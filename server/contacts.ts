import { getDatabase } from "./sqlite";
import { searchUsers, toPublicUser, type PublicUser } from "./auth";

type ContactRow = {
  contact_username: string;
};

export function listContacts(ownerUsername: string): PublicUser[] {
  const rows = getDatabase().prepare(`
    SELECT contact_username
    FROM contacts
    WHERE owner_username = ?
    ORDER BY created_at ASC
  `).all(ownerUsername) as ContactRow[];
  return rows.flatMap((row) => searchUsers(row.contact_username, ownerUsername).map(toPublicUser));
}

export function addContact(ownerUsername: string, contactUsername: string): PublicUser | null {
  const target = searchUsers(contactUsername, ownerUsername)[0];
  if (!target) return null;
  getDatabase().prepare(`
    INSERT OR IGNORE INTO contacts (owner_username, contact_username, created_at)
    VALUES (?, ?, ?)
  `).run(ownerUsername, target.username, new Date().toISOString());
  return toPublicUser(target);
}

export function deleteContact(ownerUsername: string, contactUsername: string): boolean {
  const result = getDatabase().prepare(`
    DELETE FROM contacts
    WHERE owner_username = ? AND contact_username = ?
  `).run(ownerUsername, contactUsername.trim().toLowerCase());
  return result.changes > 0;
}
