import { authenticatedUser, claimPupdateDispatch, displayName, sendToOtherUsers } from "@/lib/push-server";

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
    const { pupdateId } = await request.json() as { pupdateId?: string };
    if (!pupdateId) return Response.json({ error: "A Pupdate ID is required." }, { status: 400 });
    const claim = await claimPupdateDispatch(pupdateId, user.id);
    if (claim === "not-found") return Response.json({ error: "Pupdate not found." }, { status: 404 });
    if (claim === "duplicate") return Response.json({ ok: true, duplicate: true });
    const name = await displayName(user.id);
    if (!name) return Response.json({ error: "Profile not found." }, { status: 404 });
    await sendToOtherUsers(user.id, `${name} has just posted a Pupdate!`, `/?pupdate=${encodeURIComponent(pupdateId)}`);
    return Response.json({ ok: true });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Could not send Pupdate notifications." }, { status: 500 });
  }
}

