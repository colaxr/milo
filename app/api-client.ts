import type { LocalUser } from "./local-auth";
import type { EncryptedRecord } from "./secure-storage";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export async function fetchSession(): Promise<LocalUser | null> {
  try {
    return (await api<{ user: LocalUser }>("/api/auth/session")).user;
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return null;
    throw error;
  }
}

export async function fetchInitializationStatus(): Promise<boolean> {
  return (await api<{ initialized: boolean }>("/api/auth/status")).initialized;
}

export async function setupRemote(username: string, password: string): Promise<LocalUser> {
  return (await api<{ user: LocalUser }>("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })).user;
}

export async function loginRemote(username: string, password: string): Promise<LocalUser> {
  return (await api<{ user: LocalUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })).user;
}

export async function logoutRemote(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function fetchUsers(): Promise<LocalUser[]> {
  return (await api<{ users: LocalUser[] }>("/api/users")).users;
}

export async function createRemoteUser(input: { username: string; displayName: string; password: string }): Promise<LocalUser> {
  return (await api<{ user: LocalUser }>("/api/users", { method: "POST", body: JSON.stringify(input) })).user;
}

export async function fetchEncryptedRecord(name: string): Promise<EncryptedRecord | null> {
  const result = await api<{ record: { payload: EncryptedRecord } | null }>(`/api/records/${encodeURIComponent(name)}`);
  return result.record?.payload ?? null;
}

export async function saveEncryptedRecordRemote(name: string, payload: EncryptedRecord): Promise<void> {
  await api(`/api/records/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ payload }) });
}
