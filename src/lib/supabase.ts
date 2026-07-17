export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const sessionKey = "pupdate.supabase.session";
const signedUrlStorageKey = "pupdate.supabase.signed-url-cache";
const signedUrlTtlMs = 55 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlRequests = new Map<string, Promise<string | null>>();

export const supabaseConfigured = Boolean(url && key);

async function request<T>(path: string, init: RequestInit = {}, session?: Session | null): Promise<T> {
  if (!supabaseConfigured) throw new Error("Supabase environment variables are not configured.");
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.msg || payload.message || payload.error_description || payload.error || "Something went wrong.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normaliseSession(value: Session & { expires_in?: number }) {
  return { ...value, expires_at: value.expires_at ?? Math.floor(Date.now() / 1000) + (value.expires_in ?? 3600) };
}

export function saveSession(value: Session | null) {
  if (typeof window === "undefined") return;
  if (value) localStorage.setItem(sessionKey, JSON.stringify(value));
  else localStorage.removeItem(sessionKey);
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(sessionKey) ?? "null") as Session | null; } catch { return null; }
}

export async function refreshSession(session: Session) {
  const next = normaliseSession(await request<Session & { expires_in: number }>("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }),
  }));
  saveSession(next);
  return next;
}

export async function ensureSession(session: Session) {
  return session.expires_at - Math.floor(Date.now() / 1000) < 90 ? refreshSession(session) : session;
}

export async function signUp(email: string, password: string, name: string) {
  const result = await request<{ access_token?: string; refresh_token?: string; expires_in?: number; user: Session["user"] }>("/auth/v1/signup", {
    method: "POST", body: JSON.stringify({ email, password, data: { display_name: name } }),
  });
  if (!result.access_token || !result.refresh_token) return { session: null, user: result.user };
  const session = normaliseSession(result as Session & { expires_in: number }); saveSession(session); return { session, user: result.user };
}

export async function logIn(email: string, password: string) {
  const session = normaliseSession(await request<Session & { expires_in: number }>("/auth/v1/token?grant_type=password", {
    method: "POST", body: JSON.stringify({ email, password }),
  }));
  saveSession(session); return session;
}

export async function forgotPassword(email: string) {
  await request("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email, redirect_to: `${window.location.origin}/` }) });
}

export async function updatePassword(session: Session, password: string) {
  await request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) }, session);
}

export async function signOut(session: Session) {
  await request("/auth/v1/logout", { method: "POST" }, session).catch(() => undefined); saveSession(null); clearSignedUrlCache();
}

export async function db<T>(session: Session, table: string, query = "", init: RequestInit = {}) {
  return request<T>(`/rest/v1/${table}${query}`, {
    ...init,
    headers: { Prefer: "return=representation", ...init.headers },
  }, session);
}

export async function upload(session: Session, bucket: "avatars" | "pupdates", file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const prepared = bucket === "avatars"
    ? await prepareImage(file, 900_000, 1200, [0.82, 0.74, 0.64, 0.54])
    : await prepareImage(file, 1_200_000, 1280, [0.78, 0.68, 0.58, 0.48]);
  const extension = prepared.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST", body: prepared,
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": prepared.type, "x-upsert": "false" },
  });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || payload.error || "Photo upload failed."); }
  return path;
}

async function prepareImage(file: File, maxBytes: number, maxDimension: number, qualitySteps: number[]) {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("This photo format cannot be processed. Please choose a JPG, PNG or WebP image."); }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= maxBytes && longest <= maxDimension && file.type !== "image/heic" && file.type !== "image/heif") { bitmap.close(); return file; }
  const scale = Math.min(1, maxDimension / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of qualitySteps) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  }
  throw new Error(`This photo is still too large after resizing. Please choose an image under ${Math.round(maxBytes / 1_000_000)} MB.`);
}

export async function removeUpload(session: Session, bucket: "avatars" | "pupdates", path: string) {
  await request(`/storage/v1/object/${bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: [path] }) }, session);
}

async function signedUrl(session: Session, bucket: "avatars" | "pupdates", path?: string | null) {
  if (!path) return null;
  const result = await request<{ signedURL: string }>(`/storage/v1/object/sign/${bucket}/${path}`, { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) }, session);
  return `${url}/storage/v1${result.signedURL}`;
}

export async function cachedSignedUrl(session: Session, bucket: "avatars" | "pupdates", path?: string | null) {
  if (!path) return null;
  const cacheKey = `${bucket}:${path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const stored = readStoredSignedUrl(cacheKey);
  if (stored) {
    signedUrlCache.set(cacheKey, stored);
    return stored.url;
  }
  const pending = signedUrlRequests.get(cacheKey);
  if (pending) return pending;
  const requestPromise = signedUrl(session, bucket, path)
    .then(next => {
      if (next) {
        const entry = { url: next, expiresAt: Date.now() + signedUrlTtlMs };
        signedUrlCache.set(cacheKey, entry);
        writeStoredSignedUrl(cacheKey, entry);
      }
      return next;
    })
    .finally(() => signedUrlRequests.delete(cacheKey));
  signedUrlRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export function clearSignedUrlCache() {
  signedUrlCache.clear();
  signedUrlRequests.clear();
  if (typeof window !== "undefined") localStorage.removeItem(signedUrlStorageKey);
}

function readStoredSignedUrl(cacheKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const values = JSON.parse(localStorage.getItem(signedUrlStorageKey) ?? "{}") as Record<string, { url: string; expiresAt: number }>;
    const entry = values[cacheKey];
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry;
  } catch { return null; }
}

function writeStoredSignedUrl(cacheKey: string, entry: { url: string; expiresAt: number }) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const values = JSON.parse(localStorage.getItem(signedUrlStorageKey) ?? "{}") as Record<string, { url: string; expiresAt: number }>;
    values[cacheKey] = entry;
    for (const [key, value] of Object.entries(values)) if (!value?.url || value.expiresAt <= now) delete values[key];
    localStorage.setItem(signedUrlStorageKey, JSON.stringify(values));
  } catch { /* Best-effort cache only. */ }
}
