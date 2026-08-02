import { addContact, listContacts } from "../../../server/contacts";
import { sessionUser } from "../../../server/auth";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    return json({ contacts: listContacts(user.username) });
  } catch {
    return apiError("contacts unavailable", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const body = await request.json() as { username?: unknown };
    if (typeof body.username !== "string") return apiError("invalid contact", 400);
    const contact = addContact(user.username, body.username);
    if (!contact) return apiError("user not found", 404);
    return json({ contact }, { status: 201 });
  } catch {
    return apiError("contact unavailable", 503);
  }
}
