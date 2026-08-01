import { createSession, sessionCookie, toPublicUser, verifyCredentials } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { username?: unknown; password?: unknown };
    if (typeof body.username !== "string" || typeof body.password !== "string") {
      return apiError("invalid credentials", 400);
    }
    const user = await verifyCredentials(body.username, body.password);
    if (!user) return apiError("invalid credentials", 401);
    const session = await createSession(user.username);
    return json(
      { user: toPublicUser(user) },
      { headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) } },
    );
  } catch {
    return apiError("login unavailable", 503);
  }
}
