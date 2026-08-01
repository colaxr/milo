import { sessionUser } from "../../../../server/auth";
import { getDatabase } from "../../../../server/sqlite";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

type EncryptedPayload = {
  version: 1;
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
  updatedAt: string;
};

type RecordRow = {
  payload: string;
  revision: number;
  updated_at: string;
};

function validName(name: string): boolean {
  return /^[a-z0-9:_-]{1,96}$/i.test(name);
}

function validPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<EncryptedPayload>;
  return payload.version === 1
    && payload.algorithm === "AES-GCM-256"
    && typeof payload.iv === "string"
    && payload.iv.length <= 128
    && typeof payload.ciphertext === "string"
    && payload.ciphertext.length <= 16 * 1024 * 1024
    && typeof payload.updatedAt === "string";
}

export async function GET(request: Request, context: { params: Promise<{ name: string }> }): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const { name } = await context.params;
    if (!validName(name)) return apiError("invalid record name", 400);
    const record = getDatabase().prepare(`
      SELECT payload, revision, updated_at
      FROM records
      WHERE username = ? AND name = ?
    `).get(user.username, name) as RecordRow | undefined;
    if (!record) return json({ record: null });
    return json({
      record: {
        payload: JSON.parse(record.payload) as EncryptedPayload,
        revision: record.revision,
        updatedAt: record.updated_at,
      },
    });
  } catch {
    return apiError("record unavailable", 503);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ name: string }> }): Promise<Response> {
  try {
    const user = sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const { name } = await context.params;
    if (!validName(name)) return apiError("invalid record name", 400);
    const body = await request.json() as { payload?: unknown };
    if (!validPayload(body.payload)) return apiError("invalid encrypted payload", 400);
    const now = new Date().toISOString();
    const result = getDatabase().prepare(`
      INSERT INTO records (username, name, payload, revision, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(username, name) DO UPDATE SET
        payload = excluded.payload,
        revision = records.revision + 1,
        updated_at = excluded.updated_at
      RETURNING revision
    `).get(user.username, name, JSON.stringify(body.payload), now, now) as { revision: number };
    return json({ revision: result.revision, updatedAt: now });
  } catch {
    return apiError("record save unavailable", 503);
  }
}
