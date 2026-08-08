import type { LocalUser } from "./local-auth";
import type { EncryptedMessageEnvelope, EncryptedRecord } from "./secure-storage";

export type SiteSettings = {
  brandName: string;
  footerLabel: string;
};

export type RemoteRecord = {
  payload: EncryptedRecord;
  revision: number;
  updatedAt: string;
};

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

export async function fetchSiteSettings(): Promise<SiteSettings> {
  return (await api<{ settings: SiteSettings }>("/api/site-settings")).settings;
}

export async function updateSiteSettings(settings: SiteSettings): Promise<SiteSettings> {
  return (await api<{ settings: SiteSettings }>("/api/site-settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  })).settings;
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

export async function updateRemoteUser(username: string, input: { username: string; displayName: string; password?: string }): Promise<LocalUser> {
  return (await api<{ user: LocalUser }>(`/api/users/${encodeURIComponent(username)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })).user;
}

export async function deleteRemoteUser(username: string): Promise<void> {
  await api(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export async function searchRemoteUsers(query: string): Promise<LocalUser[]> {
  return (await api<{ users: LocalUser[] }>(`/api/users?q=${encodeURIComponent(query)}`)).users;
}

export async function fetchRemoteContacts(): Promise<LocalUser[]> {
  return (await api<{ contacts: LocalUser[] }>("/api/contacts")).contacts;
}

export async function addRemoteContact(username: string): Promise<LocalUser> {
  return (await api<{ contact: LocalUser }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ username }),
  })).contact;
}

export async function deleteRemoteContact(username: string): Promise<void> {
  await api(`/api/contacts/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export async function registerRemoteIdentityKey(publicKey: JsonWebKey): Promise<void> {
  await api("/api/identity-key", { method: "PUT", body: JSON.stringify({ publicKey }) });
}

export async function fetchRemoteIdentityKey(username: string): Promise<JsonWebKey> {
  return (await api<{ publicKey: JsonWebKey }>(`/api/identity-key/${encodeURIComponent(username)}`)).publicKey;
}

export async function fetchRemoteMessages(): Promise<EncryptedMessageEnvelope[]> {
  return (await api<{ messages: EncryptedMessageEnvelope[] }>("/api/messages?limit=200")).messages;
}

export async function sendRemoteMessage(envelope: EncryptedMessageEnvelope): Promise<void> {
  await api("/api/messages", { method: "POST", body: JSON.stringify({ envelope }) });
}

export async function acknowledgeRemoteMessages(messageIds: string[]): Promise<number> {
  return (await api<{ acknowledged: number }>("/api/messages", {
    method: "DELETE",
    body: JSON.stringify({ messageIds }),
  })).acknowledged;
}

export async function fetchEncryptedRecord(name: string): Promise<RemoteRecord | null> {
  const result = await api<{ record: RemoteRecord | null }>(`/api/records/${encodeURIComponent(name)}`);
  return result.record;
}

export async function saveEncryptedRecordRemote(name: string, payload: EncryptedRecord, revision?: number | null): Promise<number> {
  return (await api<{ revision: number }>(`/api/records/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ payload, ...(revision === undefined ? {} : { revision }) }),
  })).revision;
}
