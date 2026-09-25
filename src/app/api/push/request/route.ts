import { authenticatedUser, displayName, requestPupdate, sendToOtherUsers } from "@/lib/push-server";

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const accessToken = request.headers.get("authorization")?.slice("Bearer ".length);
    if (!user || !accessToken) return Response.json({ error: "Authentication required." }, { status: 401 });
    const [result] = await requestPupdate(accessToken);
    if (!result?.accepted) {
      return Response.json({ error: "You can request a Pupdate once every 6 hours.", nextAllowedAt: result?.next_allowed_at }, { status: 429 });
    }
    const name = await displayName(user.id);
    if (!name) return Response.json({ error: "Profile not found." }, { status: 404 });
    await sendToOtherUsers(user.id, `${name} requests a Pupdate! 🐶🙏`);
    return Response.json({ ok: true, nextAllowedAt: result.next_allowed_at });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Could not request a Pupdate." }, { status: 500 });
  }
}
