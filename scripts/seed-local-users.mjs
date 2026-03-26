import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import xlsx from "xlsx";

const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error("Usage: node scripts/seed-local-users.mjs <path-to-xlsx>");
  process.exit(1);
}

const persistenceRoot =
  process.env.PERSISTENCE_ROOT ||
  (process.env.VERCEL ? path.join(os.tmpdir(), "student-grader-ai") : process.cwd());
const dataDirectory = path.join(persistenceRoot, "data");
const authDatabasePath = path.join(dataDirectory, "student-grader-auth.db");
const credentialsPath = path.join(dataDirectory, "seeded-user-passwords.csv");

fs.mkdirSync(dataDirectory, { recursive: true });

const workbook = xlsx.readFile(sourcePath);
const sheetName = workbook.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
  defval: "",
}) ?? [];

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
`);

const upsertUser = database.prepare(`
  INSERT INTO users (id, username, email, first_name, last_name, role, password_hash, must_change_password, active, created_at)
  VALUES (@id, @username, @email, @first_name, @last_name, @role, @password_hash, @must_change_password, @active, @created_at)
  ON CONFLICT(email) DO UPDATE SET
    username = excluded.username,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    password_hash = excluded.password_hash,
    must_change_password = excluded.must_change_password,
    active = excluded.active
`);

const credentialsRows = [["email", "username", "role", "temporary_password"]];
let imported = 0;

for (const row of rows) {
  const email = String(row["Email Address"] || "").trim().toLowerCase();
  const username = String(row["USERNAME"] || "").trim();
  const firstName = String(row["First Name (Preferred)"] || "").trim();
  const lastName = String(row["Last Name"] || "").trim();
  const rawStatus = String(row["Status"] || "").trim();

  if (!email || !username || !rawStatus) {
    continue;
  }

  const role = normalizeRole(rawStatus);
  if (!role) {
    continue;
  }

  const temporaryPassword = generatePassword();
  const passwordHash = hashPassword(temporaryPassword);

  upsertUser.run({
    id: crypto.randomUUID(),
    username,
    email,
    first_name: firstName || username,
    last_name: lastName || "",
    role,
    password_hash: passwordHash,
    must_change_password: 1,
    active: 1,
    created_at: new Date().toISOString(),
  });

  credentialsRows.push([email, username, role, temporaryPassword]);
  imported += 1;
}

fs.writeFileSync(credentialsPath, credentialsRows.map(toCsvLine).join("\n"), "utf8");

console.log(`Imported ${imported} users into ${authDatabasePath}`);
console.log(`Temporary passwords written to ${credentialsPath}`);

function normalizeRole(rawStatus) {
  const status = rawStatus.toLowerCase();
  if (status === "student") return "student";
  if (status === "faculty") return "faculty";
  if (status === "admininstrator" || status === "administrator") return "admin";
  return null;
}

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function toCsvLine(values) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    })
    .join(",");
}
