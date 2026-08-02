import { deleteUser, sessionUser, toPublicUser, updateUserDisplayName } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    const admin = await sessionUser(request);
    if (!admin || admin.role !== "admin") return apiError("forbidden", 403);
    const { username } = await context.params;
    if (username.trim().toLowerCase() === admin.username) return apiError("cannot edit current admin", 400);
    const body = await request.json() as { displayName?: unknown };
    if (typeof body.displayName !== "string" || body.displayName.trim().length > 80) return apiError("invalid display name", 400);
    const user = updateUserDisplayName(username, body.displayName);
    if (!user) return apiError("user not found", 404);
    return json({ user: toPublicUser(user) });
  } catch {
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
