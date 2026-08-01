import { createUserDocument, sessionUser, toPublicUser, type UserDocument } from "../../../server/auth";
import { ensureDatabase } from "../../../server/mongodb";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

async function requireAdmin(request: Request): Promise<UserDocument | null> {
  const user = await sessionUser(request);
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    if (!await requireAdmin(request)) return apiError("forbidden", 403);
    const database = await ensureDatabase();
    const users = await database.collection<UserDocument>("users").find().sort({ createdAt: 1 }).toArray();
    return json({ users: users.map(toPublicUser) });
  } catch {
    return apiError("users unavailable", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!await requireAdmin(request)) return apiError("forbidden", 403);
    const body = await request.json() as { username?: unknown; displayName?: unknown; password?: unknown };
    if (typeof body.username !== "string" || typeof body.displayName !== "string" || typeof body.password !== "string") {
      return apiError("invalid user", 400);
    }
    const user = await createUserDocument(body.username, body.displayName, body.password);
    const database = await ensureDatabase();
    await database.collection<UserDocument>("users").insertOne(user);
    return json({ user: toPublicUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_USERNAME") return apiError("invalid username", 400);
    if (error instanceof Error && error.message === "WEAK_PASSWORD") return apiError("weak password", 400);
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return apiError("username exists", 409);
    return apiError("user creation unavailable", 503);
  }
}
