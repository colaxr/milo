import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const globalSqlite = globalThis as typeof globalThis & {
  miloSqlite?: DatabaseSync;
};

function databasePath(): string {
  const configured = process.env.SQLITE_PATH ?? ".data/milo.db";
  return configured === ":memory:" ? configured : resolve(configured);
}

function initialize(database: DatabaseSync): void {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      vault_salt TEXT NOT NULL,
      vault_iterations INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    ) STRICT
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at)
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS records (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (username, name)
    ) STRICT
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_records_updated_at
    ON records(updated_at)
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      owner_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      contact_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (owner_username, contact_username),
      CHECK (owner_username <> contact_username)
    ) STRICT
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_contacts_contact_username
    ON contacts(contact_username)
  `);
  database.exec("PRAGMA optimize");
}

export function getDatabase(): DatabaseSync {
  if (!globalSqlite.miloSqlite) {
    try {
      const path = databasePath();
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const database = new DatabaseSync(path);
      initialize(database);
      globalSqlite.miloSqlite = database;
    } catch (error) {
      console.error("SQLite initialization failed", error);
      throw error;
    }
  }
  return globalSqlite.miloSqlite;
}

export function databaseReady(): void {
  getDatabase().prepare("SELECT 1").get();
}
