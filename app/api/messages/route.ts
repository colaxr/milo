import { sessionUser } from "../../../server/auth";
import { acknowledgeIncomingMessages, listIncomingMessages, saveEncryptedMessage, type EncryptedMessageEnvelope } from "../../../server/messages";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

function validEnvelope(value: unknown): value is EncryptedMessageEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<EncryptedMessageEnvelope>;
  return envelope.version === 1
    && envelope.algorithm === "ECDH-P256-AES-GCM"
    && typeof envelope.messageId === "string"
    && /^[a-f0-9-]{16,80}$/i.test(envelope.messageId)
    && typeof envelope.senderUsername === "string"
    && typeof envelope.recipientUsername === "string"
    && Boolean(envelope.ephemeralPublicKey && typeof envelope.ephemeralPublicKey === "object")
    && typeof envelope.iv === "string"
    && envelope.iv.length <= 128
    && typeof envelope.ciphertext === "string"
    && envelope.ciphertext.length <= 16 * 1024 * 1024
    && typeof envelope.createdAt === "string"
    && JSON.stringify(envelope).length <= 20 * 1024 * 1024;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return json({ messages: listIncomingMessages(user.username, Number.isFinite(limit) ? limit : 100) });
  } catch {
    return apiError("messages unavailable", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const body = await request.json() as { envelope?: unknown };
    if (!validEnvelope(body.envelope)) return apiError("invalid encrypted message", 400);
    const messageId = saveEncryptedMessage(user.username, body.envelope);
    return json({ messageId }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CONTACT_REQUIRED") return apiError("contact required", 403);
    if (error instanceof Error && error.message === "RECIPIENT_NOT_FOUND") return apiError("recipient not found", 404);
    if (error instanceof Error && error.message === "RECIPIENT_KEY_MISSING") return apiError("recipient device unavailable", 409);
    if (error instanceof Error && error.message === "INVALID_MESSAGE") return apiError("invalid encrypted message", 400);
    return apiError("message unavailable", 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const body = await request.json() as { messageIds?: unknown };
    if (!Array.isArray(body.messageIds) || body.messageIds.length > 200 || body.messageIds.some((id) => typeof id !== "string" || !/^[a-f0-9-]{16,80}$/i.test(id))) {
      return apiError("invalid message acknowledgements", 400);
    }
    return json({ acknowledged: acknowledgeIncomingMessages(user.username, body.messageIds) });
  } catch {
    return apiError("message acknowledgement unavailable", 503);
  }
}
