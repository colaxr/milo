import { searchUsers } from "./auth";
import { getDatabase } from "./sqlite";

export type PublicIdentityKey = Record<string, unknown>;

export type EncryptedMessageEnvelope = {
  version: 1;
  algorithm: "ECDH-P256-AES-GCM";
  messageId: string;
  senderUsername: string;
  recipientUsername: string;
  ephemeralPublicKey: PublicIdentityKey;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type IdentityKeyRow = { public_key: string };
type MessageRow = { id: string; envelope: string; created_at: string };

const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function setIdentityPublicKey(username: string, publicKey: PublicIdentityKey): void {
  const normalized = normalizeUsername(username);
  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO identity_keys (username, public_key, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET public_key = excluded.public_key, updated_at = excluded.updated_at
  `).run(normalized, JSON.stringify(publicKey), now, now);
}

export function getIdentityPublicKey(username: string): PublicIdentityKey | null {
  const row = getDatabase().prepare("SELECT public_key FROM identity_keys WHERE username = ?").get(normalizeUsername(username)) as IdentityKeyRow | undefined;
  if (!row) return null;
  return JSON.parse(row.public_key) as PublicIdentityKey;
}

export function hasContact(ownerUsername: string, contactUsername: string): boolean {
  const row = getDatabase().prepare(`
    SELECT 1 AS found
    FROM contacts
    WHERE owner_username = ? AND contact_username = ?
  `).get(normalizeUsername(ownerUsername), normalizeUsername(contactUsername)) as { found: number } | undefined;
  return Boolean(row?.found);
}

export function saveEncryptedMessage(senderUsername: string, envelope: EncryptedMessageEnvelope): string {
  const sender = normalizeUsername(senderUsername);
  const recipient = normalizeUsername(envelope.recipientUsername);
  if (normalizeUsername(envelope.senderUsername) !== sender) throw new Error("INVALID_MESSAGE");
  if (!searchUsers(recipient, sender)[0]) throw new Error("RECIPIENT_NOT_FOUND");
  if (!hasContact(sender, recipient)) throw new Error("CONTACT_REQUIRED");
  if (!getIdentityPublicKey(recipient)) throw new Error("RECIPIENT_KEY_MISSING");
  const now = new Date().toISOString();
  const database = getDatabase();
  database.prepare("DELETE FROM messages WHERE created_at < ?").run(new Date(Date.now() - MESSAGE_RETENTION_MS).toISOString());
  const storedEnvelope: EncryptedMessageEnvelope = {
    ...envelope,
    senderUsername: sender,
    recipientUsername: recipient,
    createdAt: now,
  };
  database.prepare(`
    INSERT OR IGNORE INTO messages (id, sender_username, recipient_username, envelope, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(storedEnvelope.messageId, sender, recipient, JSON.stringify(storedEnvelope), now);
  database.prepare(`
    INSERT OR IGNORE INTO contacts (owner_username, contact_username, created_at)
    VALUES (?, ?, ?)
  `).run(recipient, sender, now);
  return envelope.messageId;
}

export function listIncomingMessages(username: string, limit = 100): EncryptedMessageEnvelope[] {
  const database = getDatabase();
  database.prepare("DELETE FROM messages WHERE created_at < ?").run(new Date(Date.now() - MESSAGE_RETENTION_MS).toISOString());
  const rows = database.prepare(`
    SELECT id, envelope, created_at
    FROM messages
    WHERE recipient_username = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(normalizeUsername(username), Math.min(Math.max(limit, 1), 200)) as MessageRow[];
  return rows.reverse().map((row) => JSON.parse(row.envelope) as EncryptedMessageEnvelope);
}

export function acknowledgeIncomingMessages(username: string, messageIds: string[]): number {
  const normalizedIds = [...new Set(messageIds)].filter((id) => /^[a-f0-9-]{16,80}$/i.test(id)).slice(0, 200);
  if (normalizedIds.length === 0) return 0;
  const placeholders = normalizedIds.map(() => "?").join(", ");
  const result = getDatabase().prepare(`
    DELETE FROM messages
    WHERE recipient_username = ? AND id IN (${placeholders})
  `).run(username.trim().toLowerCase(), ...normalizedIds);
  return result.changes;
}
