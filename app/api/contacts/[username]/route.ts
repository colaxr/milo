import { deleteContact } from "../../../../server/contacts";
import { sessionUser } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const { username } = await context.params;
    deleteContact(user.username, username);
    return json({ ok: true });
  } catch {
    return apiError("contact deletion unavailable", 503);
  }
}
