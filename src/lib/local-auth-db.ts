import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dataDirectory } from "@/lib/paths";
import type { AppRole, AppUser } from "@/lib/types";

const authDatabasePath = path.join(dataDirectory, "student-grader-auth.db");

let databaseInstance: Database.Database | null = null;

function getDatabase() {
  if (databaseInstance) {
    return databaseInstance;
  }

  mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(authDatabasePath);
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  databaseInstance = database;
  return database;
}

type UserRow = {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: AppRole;
  must_change_password: number;
  active: number;
  created_at: string;
};

export function mapUserRow(row: UserRow | undefined | null): AppUser | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

export function getLocalAuthDatabase() {
  return getDatabase();
}

export function hasLocalUsers() {
  const database = getDatabase();
  const row = database.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count > 0;
}

export function getUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const row = getDatabase()
    .prepare(
      `SELECT id, username, email, first_name, last_name, role, must_change_password, active, created_at
       FROM users WHERE lower(email) = ?`,
    )
    .get(normalized) as UserRow | undefined;
  return mapUserRow(row);
}

export function getUserById(id: string) {
  const row = getDatabase()
    .prepare(
      `SELECT id, username, email, first_name, last_name, role, must_change_password, active, created_at
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined;
  return mapUserRow(row);
}

export function getUserPasswordHash(email: string) {
  const normalized = email.trim().toLowerCase();
  const row = getDatabase()
    .prepare("SELECT password_hash as passwordHash FROM users WHERE lower(email) = ?")
    .get(normalized) as { passwordHash: string } | undefined;
  return row?.passwordHash ?? null;
}

export function updateUserPasswordByEmail(
  email: string,
  passwordHash: string,
  mustChangePassword = false,
) {
  const normalized = email.trim().toLowerCase();
  return getDatabase()
    .prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = ?
       WHERE lower(email) = ? AND active = 1`,
    )
    .run(passwordHash, mustChangePassword ? 1 : 0, normalized);
}

export function updateUserActivationByEmail({
  email,
  passwordHash,
  firstName,
  lastName,
}: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}) {
  const normalized = email.trim().toLowerCase();
  return getDatabase()
    .prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0, first_name = ?, last_name = ?
       WHERE lower(email) = ? AND active = 1`,
    )
    .run(passwordHash, firstName.trim(), lastName.trim(), normalized);
}

export function insertSession(token: string, userId: string, expiresAt: string) {
  getDatabase()
    .prepare(
      "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(token, userId, expiresAt, new Date().toISOString());
}

export function getUserBySessionToken(token: string) {
  const row = getDatabase()
    .prepare(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role, u.must_change_password, u.active, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as UserRow | undefined;

  return mapUserRow(row);
}

export function deleteSession(token: string) {
  getDatabase().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteExpiredSessions() {
  getDatabase().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}
