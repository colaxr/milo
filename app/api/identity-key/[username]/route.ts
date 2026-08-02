import { sessionUser } from "../../../../server/auth";
import { getIdentityPublicKey } from "../../../../server/messages";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const { username } = await context.params;
    const publicKey = getIdentityPublicKey(username);
    if (!publicKey) return apiError("identity key not found", 404);
    return json({ publicKey });
  } catch {
    return apiError("identity key unavailable", 503);
  }
}
