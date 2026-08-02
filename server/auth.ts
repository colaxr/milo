import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { getDatabase } from "./sqlite";

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

type UserRow = {
  username: string;
  display_name: string;
  role: UserRole;
  password_salt: string;
  password_hash: string;
  vault_salt: string;
  vault_iterations: number;
  created_at: string;
};

export type PublicUser = Omit<UserDocument, "passwordSalt" | "passwordHash" | "createdAt"> & { createdAt: string };

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function fromRow(row: UserRow): UserDocument {
  return {
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    vaultSalt: row.vault_salt,
    vaultIterations: row.vault_iterations,
    createdAt: new Date(row.created_at),
  };
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

export function insertUser(user: UserDocument): void {
  getDatabase().prepare(`
    INSERT INTO users (
      username, display_name, role, password_salt, password_hash,
      vault_salt, vault_iterations, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.username,
    user.displayName,
    user.role,
    user.passwordSalt,
    user.passwordHash,
    user.vaultSalt,
    user.vaultIterations,
    user.createdAt.toISOString(),
  );
}

export function usersExist(): boolean {
  const row = getDatabase().prepare("SELECT 1 AS found FROM users LIMIT 1").get() as { found: number } | undefined;
  return Boolean(row?.found);
}

export async function createFirstAdmin(username: string, displayName: string, password: string): Promise<UserDocument> {
  const user = await createUserDocument(username, displayName, password, "admin");
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = database.prepare("SELECT 1 AS found FROM users LIMIT 1").get();
    if (existing) throw new Error("ALREADY_INITIALIZED");
    insertUser(user);
    database.exec("COMMIT");
    return user;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function listUsers(): UserDocument[] {
  const rows = getDatabase().prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map(fromRow);
}

export function searchUsers(query: string, excludeUsername?: string): UserDocument[] {
  const normalized = normalizeUsername(query);
  if (!/^[a-z0-9_.-]{3,32}$/.test(normalized)) return [];
  const rows = getDatabase().prepare(`
    SELECT * FROM users
    WHERE username = ? AND username <> ?
    ORDER BY created_at ASC
    LIMIT 10
  `).all(normalized, normalizeUsername(excludeUsername ?? "")) as UserRow[];
  return rows.map(fromRow);
}

export async function updateUserAccount(
  username: string,
  input: { newUsername?: string; displayName?: string; password?: string },
): Promise<UserDocument | null> {
  const normalized = normalizeUsername(username);
  const user = findUser(normalized);
  if (!user) return null;

  const nextUsername = normalizeUsername(input.newUsername ?? normalized);
  if (!/^[a-z0-9_.-]{3,32}$/.test(nextUsername)) throw new Error("INVALID_USERNAME");
  if (typeof input.password === "string" && input.password.length > 0 && input.password.length < 12) throw new Error("WEAK_PASSWORD");
  const nextDisplayName = input.displayName?.trim() || user.displayName || nextUsername;
  const database = getDatabase();
  const records = database.prepare("SELECT COUNT(*) AS count FROM records WHERE username = ?").get(normalized) as { count: number };
  if (records.count > 0 && (nextUsername !== normalized || Boolean(input.password))) throw new Error("USER_HAS_RECORDS");
  const duplicate = database.prepare("SELECT 1 AS found FROM users WHERE username = ? AND username <> ?").get(nextUsername, normalized) as { found: number } | undefined;
  if (duplicate) throw new Error("USERNAME_EXISTS");

  let passwordSalt = user.passwordSalt;
  let passwordHashValue = user.passwordHash;
  if (input.password) {
    const salt = randomBytes(16);
    passwordSalt = salt.toString("base64");
    passwordHashValue = (await passwordHash(input.password, salt)).toString("base64");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    if (nextUsername !== normalized) {
      database.prepare(`
        INSERT INTO users (
          username, display_name, role, password_salt, password_hash,
          vault_salt, vault_iterations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(nextUsername, nextDisplayName, user.role, passwordSalt, passwordHashValue, user.vaultSalt, user.vaultIterations, user.createdAt.toISOString());
      database.prepare("UPDATE sessions SET username = ? WHERE username = ?").run(nextUsername, normalized);
      database.prepare("UPDATE records SET username = ? WHERE username = ?").run(nextUsername, normalized);
      if (input.password) database.prepare("DELETE FROM sessions WHERE username = ?").run(nextUsername);
      database.prepare("DELETE FROM users WHERE username = ?").run(normalized);
    } else {
      database.prepare(`
        UPDATE users
        SET display_name = ?, password_salt = ?, password_hash = ?
        WHERE username = ?
      `).run(nextDisplayName, passwordSalt, passwordHashValue, normalized);
      if (input.password) database.prepare("DELETE FROM sessions WHERE username = ?").run(normalized);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return findUser(nextUsername);
}

export function deleteUser(username: string): boolean {
  const result = getDatabase().prepare("DELETE FROM users WHERE username = ?").run(normalizeUsername(username));
  return result.changes > 0;
}

function findUser(username: string): UserDocument | null {
  const row = getDatabase().prepare("SELECT * FROM users WHERE username = ?").get(normalizeUsername(username)) as UserRow | undefined;
  return row ? fromRow(row) : null;
}

export async function verifyCredentials(username: string, password: string): Promise<UserDocument | null> {
  const user = findUser(username);
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

export function createSession(username: string): { token: string; expiresAt: Date } {
  const database = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const days = Math.min(Math.max(Number(process.env.SESSION_TTL_DAYS ?? 30), 1), 90);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + days * 86_400_000);
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(createdAt.toISOString());
  database.prepare(`
    INSERT INTO sessions (token_hash, username, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash(token), username, createdAt.toISOString(), expiresAt.toISOString());
  return { token, expiresAt };
}

function secureSessionCookie(request: Request): boolean {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProtocol) return forwardedProtocol === "https";
  return new URL(request.url).protocol === "https:";
}

export function sessionCookie(token: string, expiresAt: Date, request: Request): string {
  const secure = secureSessionCookie(request);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function sessionUser(request: Request): UserDocument | null {
  const token = cookieValue(request);
  if (!token) return null;
  const row = getDatabase().prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.username = sessions.username
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(token), new Date().toISOString()) as UserRow | undefined;
  return row ? fromRow(row) : null;
}

export function deleteSession(request: Request): void {
  const token = cookieValue(request);
  if (!token) return;
  getDatabase().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
