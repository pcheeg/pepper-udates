import type { Session } from "@/lib/supabase";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), character => character.charCodeAt(0));
}

async function api<T>(session: Session, path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Push notification request failed.") as Error & { nextAllowedAt?: string };
    error.nextAllowedAt = payload.nextAllowedAt;
    throw error;
  }
  return payload as T;
}

export async function subscribeToPush(session: Session, askPermission = false) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
  const permission = askPermission ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked in your browser settings." : "Notification permission was not granted.");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push notifications are not configured yet.");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
  await api(session, "/api/push/subscribe", subscription.toJSON());
}

export async function detachPushSubscription(session: Session) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
}

export function requestAPupdate(session: Session) {
  return api<{ ok: true; nextAllowedAt: string }>(session, "/api/push/request");
}

export function announceNewPupdate(session: Session, pupdateId: string) {
  return api<{ ok: true }>(session, "/api/push/new-pupdate", { pupdateId });
}
