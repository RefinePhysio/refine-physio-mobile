import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, normalizeEmail } from "../services/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const dataDir = path.join(projectRoot, "server", "data");
const dbPath = path.join(dataDir, "db.json");

loadEnv(path.join(projectRoot, ".env"));

const args = parseArgs(process.argv.slice(2));
const email = normalizeEmail(args.email || process.env.ADMIN_EMAIL || "admin@refinephysio.com.au");
const name = String(args.name || process.env.ADMIN_NAME || "Refine Admin").trim();
const password = String(args.password || process.env.ADMIN_PASSWORD || generatedPassword());

if (!email) throw new Error("Admin email is required.");
if (password.length < 10) throw new Error("Admin password must be at least 10 characters.");

await mkdir(dataDir, { recursive: true });
const db = existsSync(dbPath)
  ? JSON.parse(await readFile(dbPath, "utf8"))
  : emptyDb();

db.users ||= [];
db.sessions ||= [];
db.activityLog ||= [];

let admin = db.users.find((user) => normalizeEmail(user.email) === email);
if (!admin) {
  admin = {
    id: `user-${randomUUID()}`,
    email,
    name,
    role: "admin",
    discipline: "Admin",
    phone: "",
    baseSuburb: "",
    clinikoPractitionerId: "",
    clinikoSyncEnabled: false,
    requiresLoginSetup: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.users.push(admin);
} else {
  admin.email = email;
  admin.name = name || admin.name;
  admin.role = "admin";
  admin.discipline = admin.discipline || "Admin";
  admin.isActive = true;
  admin.requiresLoginSetup = false;
  admin.updatedAt = new Date().toISOString();
}

admin.passwordHash = await hashPassword(password);
for (const session of db.sessions) {
  if (session.userId === admin.id && !session.revokedAt) session.revokedAt = new Date().toISOString();
}
db.activityLog.push({
  id: `activity-${randomUUID()}`,
  actorId: "setup-script",
  action: "seeded_first_admin",
  entityType: "user",
  entityId: admin.id,
  createdAt: new Date().toISOString()
});

await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

console.log(`Admin account ready: ${email}`);
if (!args.password && !process.env.ADMIN_PASSWORD) {
  console.log(`Generated temporary password: ${password}`);
  console.log("Store this password securely, then change it from Admin > Users.");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    parsed[key] = values[index + 1] || "";
    index += 1;
  }
  return parsed;
}

function generatedPassword() {
  return `Refine-${randomBytes(12).toString("base64url")}`;
}

function emptyDb() {
  return {
    meta: { schemaVersion: 2, createdAt: new Date().toISOString(), productionEmpty: true },
    settings: { businessName: "Refine Physio Mobile", timezone: "Australia/Brisbane" },
    users: [],
    clients: [],
    referrals: [],
    appointments: [],
    archivedAppointments: [],
    treatmentNotes: [],
    reports: [],
    appointmentTypes: [],
    rebookStatuses: [],
    notifications: [],
    approvalRequests: [],
    inboxItems: [],
    reportReminders: [],
    messages: [],
    sessions: [],
    activityLog: [],
    clinikoSyncLogs: [],
    syncErrors: [],
    clinikoLocations: []
  };
}

function loadEnv(envPath) {
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
