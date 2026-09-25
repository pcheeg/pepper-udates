import { authenticatedUser, removeSubscription, saveSubscription } from "@/lib/push-server";
import type { PushSubscription } from "web-push";

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
    const subscription = await request.json() as PushSubscription;
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return Response.json({ error: "Invalid push subscription." }, { status: 400 });
    }
    await saveSubscription(user.id, subscription);
    return Response.json({ ok: true });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Could not save notification subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
    const { endpoint } = await request.json() as { endpoint?: string };
    if (endpoint) await removeSubscription(user.id, endpoint);
    return Response.json({ ok: true });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Could not remove notification subscription." }, { status: 500 });
  }
}
