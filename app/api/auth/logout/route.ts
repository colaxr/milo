import { deleteSession, expiredSessionCookie } from "../../../../server/auth";
import { json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  await deleteSession(request).catch(() => undefined);
  return json({ ok: true }, { headers: { "set-cookie": expiredSessionCookie() } });
}
