import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Collection } from "mongodb";
import { ensureDatabase } from "./mongodb";

const SESSION_COOKIE = "milo_session";
const PASSWORD_KEY_LENGTH = 64;
export const VAULT_ITERATIONS = 310_000;

export type UserRole = "admin" | "user";

export type UserDocument = {
  username: string;
  displayName: string;
  role: UserRole;
  passwordSalt: string;
  passwordHash: string;
  vaultSalt: string;
  vaultIterations: number;
  createdAt: Date;
};

type SessionDocument = {
  tokenHash: string;
  username: string;
  createdAt: Date;
  expiresAt: Date;
};

export type PublicUser = Omit<UserDocument, "passwordSalt" | "passwordHash" | "createdAt"> & { createdAt: string };

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function users(database: Awaited<ReturnType<typeof ensureDatabase>>): Collection<UserDocument> {
  return database.collection<UserDocument>("users");
}

async function passwordHash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => error ? reject(error) : resolve(derivedKey),
    );
  });
}

export async function createUserDocument(
  username: string,
  displayName: string,
  password: string,
  role: UserRole = "user",
): Promise<UserDocument> {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9_.-]{3,32}$/.test(normalized)) throw new Error("INVALID_USERNAME");
  if (password.length < 12) throw new Error("WEAK_PASSWORD");
  const passwordSalt = randomBytes(16);
  const hash = await passwordHash(password, passwordSalt);
  return {
    username: normalized,
    displayName: displayName.trim() || normalized,
    role,
    passwordSalt: passwordSalt.toString("base64"),
    passwordHash: hash.toString("base64"),
    vaultSalt: randomBytes(16).toString("base64"),
    vaultIterations: VAULT_ITERATIONS,
    createdAt: new Date(),
  };
}

export async function ensureAdmin(): Promise<void> {
  const database = await ensureDatabase();
  const username = normalizeUsername(process.env.ADMIN_USERNAME ?? "admin");
  if (await users(database).findOne({ username }, { projection: { _id: 1 } })) return;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is required for first startup");
  const document = await createUserDocument(username, process.env.ADMIN_DISPLAY_NAME ?? "ADMIN", password, "admin");
  await users(database).updateOne({ username }, { $setOnInsert: document }, { upsert: true });
}

export async function verifyCredentials(username: string, password: string): Promise<UserDocument | null> {
  await ensureAdmin();
  const database = await ensureDatabase();
  const user = await users(database).findOne({ username: normalizeUsername(username) });
  if (!user) return null;
  const expected = Buffer.from(user.passwordHash, "base64");
  const actual = await passwordHash(password, Buffer.from(user.passwordSalt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? user : null;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    vaultSalt: user.vaultSalt,
    vaultIterations: user.vaultIterations,
    createdAt: user.createdAt.toISOString(),
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieValue(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function createSession(username: string): Promise<{ token: string; expiresAt: Date }> {
  const database = await ensureDatabase();
  const token = randomBytes(32).toString("base64url");
  const days = Math.min(Math.max(Number(process.env.SESSION_TTL_DAYS ?? 30), 1), 90);
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await database.collection<SessionDocument>("sessions").insertOne({
    tokenHash: tokenHash(token),
    username,
    createdAt: new Date(),
    expiresAt,
  });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.SESSION_COOKIE_SECURE !== "false";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function sessionUser(request: Request): Promise<UserDocument | null> {
  const token = cookieValue(request);
  if (!token) return null;
  const database = await ensureDatabase();
  const session = await database.collection<SessionDocument>("sessions").findOne({
    tokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  return users(database).findOne({ username: session.username });
}

export async function deleteSession(request: Request): Promise<void> {
  const token = cookieValue(request);
  if (!token) return;
  const database = await ensureDatabase();
  await database.collection<SessionDocument>("sessions").deleteOne({ tokenHash: tokenHash(token) });
}
