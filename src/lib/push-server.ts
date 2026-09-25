import "server-only";
import webpush, { type PushSubscription } from "web-push";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type AuthUser = { id: string };
type Profile = { display_name: string };
type StoredSubscription = { user_id: string; endpoint: string; p256dh: string; auth: string };

function requireServerConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    throw new Error("Push notification environment variables are not configured.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function supabase<T>(path: string, init: RequestInit = {}) {
  requireServerConfig();
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `Supabase request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) as T : undefined as T;
}

export async function authenticatedUser(request: Request) {
  requireServerConfig();
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
    cache: "no-store",
  });
  return response.ok ? response.json() as Promise<AuthUser> : null;
}

export async function displayName(userId: string) {
  const rows = await supabase<Profile[]>(`/rest/v1/profiles?id=eq.${userId}&select=display_name&limit=1`);
  return rows[0]?.display_name;
}

export async function saveSubscription(userId: string, subscription: PushSubscription) {
  await supabase("/rest/v1/push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      user_id: userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await supabase(`/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
}

export async function claimPupdateDispatch(pupdateId: string, userId: string) {
  const posts = await supabase<{ id: string }[]>(`/rest/v1/pupdates?id=eq.${pupdateId}&owner_id=eq.${userId}&select=id&limit=1`);
  if (!posts.length) return "not-found" as const;
  const claimed = await supabase<{ pupdate_id: string }[]>("/rest/v1/push_dispatches?on_conflict=pupdate_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ pupdate_id: pupdateId }),
  });
  return claimed.length ? "claimed" as const : "duplicate" as const;
}

export async function sendToOtherUsers(senderId: string, body: string, url = "/") {
  const subscriptions = await supabase<StoredSubscription[]>(`/rest/v1/push_subscriptions?user_id=neq.${senderId}&select=user_id,endpoint,p256dh,auth`);
  const payload = JSON.stringify({ title: "Pupdates", body, url });
  await Promise.allSettled(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload);
    } catch (reason) {
      const statusCode = typeof reason === "object" && reason && "statusCode" in reason ? Number(reason.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await supabase(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, { method: "DELETE" });
        return;
      }
      throw reason;
    }
  }));
}

export async function requestPupdate(accessToken: string) {
  requireServerConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/request_pupdate`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("Could not record the Pupdate request.");
  return response.json() as Promise<{ accepted: boolean; next_allowed_at: string }[]>;
}
