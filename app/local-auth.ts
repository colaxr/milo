export type LocalUser = {
  username: string;
  displayName: string;
  role: "admin" | "user";
  passwordSalt: string;
  passwordHash: string;
  passwordIterations: number;
  createdAt: string;
};

const PASSWORD_ITERATIONS = 210_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derivePasswordHash(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const material = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function createLocalUser(
  username: string,
  displayName: string,
  password: string,
  role: LocalUser["role"] = "user",
): Promise<LocalUser> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return {
    username: normalizeUsername(username),
    displayName: displayName.trim(),
    role,
    passwordSalt: bytesToBase64(salt),
    passwordHash: bytesToBase64(passwordHash),
    passwordIterations: PASSWORD_ITERATIONS,
    createdAt: new Date().toISOString(),
  };
}

export async function verifyLocalPassword(user: LocalUser, password: string): Promise<boolean> {
  const actual = await derivePasswordHash(password, base64ToBytes(user.passwordSalt), user.passwordIterations);
  return constantTimeEqual(actual, base64ToBytes(user.passwordHash));
}
