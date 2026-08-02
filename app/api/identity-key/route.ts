import { sessionUser } from "../../../server/auth";
import { setIdentityPublicKey, type PublicIdentityKey } from "../../../server/messages";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const body = await request.json() as { publicKey?: unknown };
    if (!body.publicKey || typeof body.publicKey !== "object" || JSON.stringify(body.publicKey).length > 4096) return apiError("invalid identity key", 400);
    setIdentityPublicKey(user.username, body.publicKey as PublicIdentityKey);
    return json({ ok: true });
  } catch {
    return apiError("identity key unavailable", 503);
  }
}
