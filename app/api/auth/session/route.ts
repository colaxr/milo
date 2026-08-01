import { sessionUser, toPublicUser } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    return json({ user: toPublicUser(user) });
  } catch {
    return apiError("session unavailable", 503);
  }
}
