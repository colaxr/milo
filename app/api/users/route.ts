import { createUserDocument, insertUser, isUniqueConstraintError, listUsers, sessionUser, toPublicUser, type UserDocument } from "../../../server/auth";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

async function requireAdmin(request: Request): Promise<UserDocument | null> {
  const user = await sessionUser(request);
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    if (!await requireAdmin(request)) return apiError("forbidden", 403);
    return json({ users: listUsers().map(toPublicUser) });
  } catch {
    return apiError("users unavailable", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!await requireAdmin(request)) return apiError("forbidden", 403);
    const body = await request.json() as { username?: unknown; displayName?: unknown; password?: unknown };
    if (typeof body.username !== "string" || typeof body.displayName !== "string" || typeof body.password !== "string") {
      return apiError("invalid user", 400);
    }
    const user = await createUserDocument(body.username, body.displayName, body.password);
    insertUser(user);
    return json({ user: toPublicUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_USERNAME") return apiError("invalid username", 400);
    if (error instanceof Error && error.message === "WEAK_PASSWORD") return apiError("weak password", 400);
    if (isUniqueConstraintError(error)) return apiError("username exists", 409);
    return apiError("user creation unavailable", 503);
  }
}
