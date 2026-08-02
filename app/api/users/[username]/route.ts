import { deleteUser, isUniqueConstraintError, sessionUser, toPublicUser, updateUserAccount } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    const admin = await sessionUser(request);
    if (!admin || admin.role !== "admin") return apiError("forbidden", 403);
    const { username } = await context.params;
    if (username.trim().toLowerCase() === admin.username) return apiError("cannot edit current admin", 400);
    const body = await request.json() as { username?: unknown; displayName?: unknown; password?: unknown };
    if (typeof body.username !== "string" || typeof body.displayName !== "string" || body.displayName.trim().length > 80 || (body.password !== undefined && typeof body.password !== "string")) {
      return apiError("invalid user", 400);
    }
    const user = await updateUserAccount(username, {
      newUsername: body.username,
      displayName: body.displayName,
      password: body.password as string | undefined,
    });
    if (!user) return apiError("user not found", 404);
    return json({ user: toPublicUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_USERNAME") return apiError("invalid username", 400);
    if (error instanceof Error && error.message === "WEAK_PASSWORD") return apiError("weak password", 400);
    if (error instanceof Error && error.message === "USERNAME_EXISTS") return apiError("username exists", 409);
    if (error instanceof Error && error.message === "USER_HAS_RECORDS") return apiError("user has encrypted records", 409);
    if (isUniqueConstraintError(error)) return apiError("username exists", 409);
    return apiError("user update unavailable", 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    const admin = await sessionUser(request);
    if (!admin || admin.role !== "admin") return apiError("forbidden", 403);
    const { username } = await context.params;
    if (username.trim().toLowerCase() === admin.username) return apiError("cannot delete current admin", 400);
    if (!deleteUser(username)) return apiError("user not found", 404);
    return json({ ok: true });
  } catch {
    return apiError("user deletion unavailable", 503);
  }
}
