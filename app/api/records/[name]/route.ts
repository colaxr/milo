import { sessionUser } from "../../../../server/auth";
import { ensureDatabase } from "../../../../server/mongodb";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

type EncryptedPayload = {
  version: 1;
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
  updatedAt: string;
};

type RecordDocument = {
  username: string;
  name: string;
  payload: EncryptedPayload;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
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
    const user = await sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const { name } = await context.params;
    if (!validName(name)) return apiError("invalid record name", 400);
    const database = await ensureDatabase();
    const record = await database.collection<RecordDocument>("records").findOne({ username: user.username, name });
    if (!record) return json({ record: null });
    return json({ record: { payload: record.payload, revision: record.revision, updatedAt: record.updatedAt.toISOString() } });
  } catch {
    return apiError("record unavailable", 503);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ name: string }> }): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return apiError("unauthorized", 401);
    const { name } = await context.params;
    if (!validName(name)) return apiError("invalid record name", 400);
    const body = await request.json() as { payload?: unknown };
    if (!validPayload(body.payload)) return apiError("invalid encrypted payload", 400);
    const now = new Date();
    const database = await ensureDatabase();
    const result = await database.collection<RecordDocument>("records").findOneAndUpdate(
      { username: user.username, name },
      {
        $set: { payload: body.payload, updatedAt: now },
        $setOnInsert: { username: user.username, name, createdAt: now },
        $inc: { revision: 1 },
      },
      { upsert: true, returnDocument: "after" },
    );
    return json({ revision: result?.revision ?? 1, updatedAt: now.toISOString() });
  } catch {
    return apiError("record save unavailable", 503);
  }
}
