import { createFirstAdmin, createSession, sessionCookie, toPublicUser } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { username?: unknown; password?: unknown };
    if (typeof body.username !== "string" || typeof body.password !== "string") {
      return apiError("invalid administrator", 400);
    }
    const user = await createFirstAdmin(body.username, "ADMIN", body.password);
    const session = createSession(user.username);
    return json(
      { user: toPublicUser(user) },
      { status: 201, headers: { "set-cookie": sessionCookie(session.token, session.expiresAt, request) } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_USERNAME") return apiError("invalid username", 400);
    if (error instanceof Error && error.message === "WEAK_PASSWORD") return apiError("weak password", 400);
    if (error instanceof Error && error.message === "ALREADY_INITIALIZED") return apiError("already initialized", 409);
    return apiError("initialization unavailable", 503);
  }
}
