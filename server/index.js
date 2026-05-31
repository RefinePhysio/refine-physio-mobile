import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticateSession,
  clearSessionCookie,
  cookieValue,
  createSession,
  hashPassword,
  hasPassword,
  mergeSessionRecords,
  normalizeEmail,
  publicUser,
  pruneExpiredSessions,
  revokeSession,
  sessionCookie,
  verifyPassword
} from "./services/auth.js";
import {
  clinikoEndpointSummary,
  createClinikoAppointmentFromApp,
  enabledClinikoBusinessIds,
  enabledClinikoPractitionerIds,
  getClinikoConfig,
  reportPdfFilename,
  syncCliniko,
  updateClinikoLocationEnabled,
  updateClinikoPractitionerEnabled,
  updateClinikoAppointmentFromApp,
  treatmentNotePdfFilename,
  uploadReportPdfToCliniko,
  uploadTreatmentNotePdfToCliniko
} from "./services/cliniko.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const reportTemplateAssetDir = path.join(__dirname, "assets", "report-templates");

loadEnv(path.join(projectRoot, ".env"));

const dataDir = process.env.REFINE_DATA_DIR
  ? path.resolve(process.env.REFINE_DATA_DIR)
  : path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");
const seedPath = path.join(__dirname, "data", "seed.json");
const port = Number(process.env.PORT || 4173);
assertSafeProductionConfig();

process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

const noteTemplates = {
  "Physiotherapy": [
    "subjective",
    "objective",
    "assessment",
    "treatment",
    "response",
    "risksIssues",
    "plan",
    "nextAppointment"
  ]
};

const reportTemplates = [
  {
    type: "Initial Physiotherapy Assessment Report",
    discipline: "Physiotherapy",
    fields: [
      "Participant Details",
      "Assessor Details",
      "Reason for Referral",
      "Medical History",
      "Current Home Set Up",
      "Subjective",
      "Objective Observations",
      "Outcome Measures",
      "Assessment",
      "Treatment",
      "Recommendations",
      "Plan",
      "Therapist Signature"
    ]
  },
  {
    type: "Equipment Trial Report",
    discipline: "Physiotherapy",
    fields: [
      "Participant Details",
      "Equipment Trial Summary",
      "Equipment Trialed",
      "Observations",
      "Outcomes",
      "Clinical Reasoning",
      "Recommendations",
      "Equipment List",
      "Funding Recommendations",
      "Supplier Information",
      "Therapist Signature"
    ]
  }
];

const REPORT_CLOSING_MESSAGE = "Thank you again for your kind referral! If you have any questions, please feel free to call (07) 3216 1330 or email hello@refinehealthgroup.com.au.";
const SIGNATURE_MAX_DATA_URL_LENGTH = 450000;
const AI_REPORT_SECTION_MAX_CHARS = 5000;
const REAL_CLINIKO_RESET_MARKER = "2026-06-01-real-cliniko-reset-v1";

const appointmentStatuses = ["booked", "confirmed", "completed", "cancelled", "rescheduled", "no-show"];
const referralStatuses = ["new", "contacted", "assigned", "booked", "active", "paused", "discharged", "declined"];

await ensureDb();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`Refine Physio Mobile running at http://localhost:${port}`);
  startClinikoPolling();
});

function loadEnv(envPath) {
  if (!existsSync(envPath)) return;
  const contents = String(readFileSyncSafe(envPath));
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

function readFileSyncSafe(filePath) {
  try {
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function assertSafeProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const missing = [];
  if (!process.env.DATABASE_URL && !process.env.REFINE_DATA_DIR) missing.push("DATABASE_URL or REFINE_DATA_DIR");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET");
  if (process.env.REFINE_EMPTY_DB !== "true") missing.push("REFINE_EMPTY_DB=true");
  if (process.env.REFINE_AUTH_IMPLEMENTED !== "true") missing.push("REFINE_AUTH_IMPLEMENTED=true after real login is implemented");

  if (missing.length) {
    throw new Error(`Production startup blocked. This prototype is not safe for real patient data until these are configured: ${missing.join(", ")}.`);
  }
}

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    if (process.env.NODE_ENV === "production" || process.env.REFINE_EMPTY_DB === "true") {
      await writeFile(dbPath, `${JSON.stringify(emptyDb(), null, 2)}\n`, "utf8");
    } else {
      await copyFile(seedPath, dbPath);
    }
  }
}

async function readDb() {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const contents = await readFile(dbPath, "utf8");
    try {
      return normalizeDb(JSON.parse(contents));
    } catch (error) {
      lastError = error;
      await waitForDbRetry(25 * (attempt + 1));
    }
  }
  throw lastError;
}

async function writeDb(db) {
  const nextDb = normalizeDb(db);
  const latestDb = await readLatestDbForWriteMerge();
  if (latestDb) {
    nextDb.sessions = mergeSessionRecords(latestDb.sessions, nextDb.sessions);
    pruneExpiredSessions(nextDb);
  }
  const tempPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(nextDb, null, 2)}\n`, "utf8");
  await rename(tempPath, dbPath);
}

async function readLatestDbForWriteMerge() {
  try {
    if (!existsSync(dbPath)) return null;
    return normalizeDb(JSON.parse(await readFile(dbPath, "utf8")));
  } catch {
    return null;
  }
}

async function waitForDbRetry(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDb(db) {
  db.meta ||= {};
  db.settings ||= { businessName: "Refine Physio Mobile", timezone: "Australia/Brisbane" };
  db.users ||= [];
  db.clients ||= [];
  db.caseManagers ||= [];
  db.referrals ||= [];
  db.appointments ||= [];
  db.archivedAppointments ||= [];
  db.treatmentNotes ||= [];
  db.reports ||= [];
  db.appointmentTypes ||= [];
  db.rebookStatuses ||= [];
  db.notifications ||= [];
  db.approvalRequests ||= [];
  db.inboxItems ||= [];
  db.reportReminders ||= [];
  db.messages ||= [];
  db.runningLateAlerts ||= [];
  db.sessions ||= [];
  db.activityLog ||= [];
  db.clinikoSyncLogs ||= [];
  db.syncErrors ||= [];
  db.clinikoLocations ||= [];
  db.clinikoSync ||= {
    status: getClinikoConfig().connected ? "ready" : "not_connected",
    lastSyncAt: null,
    message: getClinikoConfig().connected
      ? "Cliniko API key is configured. Run read-only sync before enabling writes."
      : "Add a test CLINIKO_API_KEY to .env to enable read-only Cliniko sync."
  };
  for (const user of db.users) {
    user.email = normalizeEmail(user.email);
    user.isActive = user.isActive !== false;
    user.isOwner = Boolean(user.isOwner);
    user.signatureDataUrl = sanitizeSignatureDataUrl(user.signatureDataUrl);
    user.signatureWidth = Number(user.signatureWidth || 0) || 520;
    user.signatureHeight = Number(user.signatureHeight || 0) || 160;
    user.signatureUpdatedAt ||= "";
    normalizeUserWorkingHours(user);
    if (user.password_hash && !user.passwordHash) user.passwordHash = user.password_hash;
    delete user.password_hash;
    if (user.clinikoPractitionerId && typeof user.clinikoSyncEnabled !== "boolean") {
      user.clinikoSyncEnabled = false;
    }
  }
  maybeResetTestClinikoDataForRealSync(db);
  normalizeCaseManagers(db);
  pruneExpiredSessions(db);
  normalizeAppointmentApprovalState(db);
  syncInboxItems(db);
  return db;
}

function maybeResetTestClinikoDataForRealSync(db) {
  if (String(process.env.REFINE_RESET_TEST_CLINIKO_DATA_ON_START || "").trim().toLowerCase() !== "true") return;
  db.meta ||= {};
  if (db.meta.realClinikoResetMarker === REAL_CLINIKO_RESET_MARKER) return;

  const now = new Date().toISOString();
  const keptUsers = (db.users || []).filter((user) => {
    const role = String(user.role || "").toLowerCase();
    return role === "admin" || role === "receptionist";
  });

  for (const user of keptUsers) {
    user.clinikoPractitionerId = "";
    user.clinikoSyncEnabled = false;
    user.clinikoSyncEnabledAt = "";
    user.clinikoSyncDisabledAt = now;
    if (normalizeEmail(user.email) === "katie@refinehealthgroup.com.au") {
      user.role = "admin";
      user.isOwner = true;
      user.isActive = true;
      user.requiresLoginSetup = false;
    }
    user.updatedAt = now;
  }

  db.users = keptUsers;
  for (const key of [
    "clients",
    "caseManagers",
    "referrals",
    "appointments",
    "archivedAppointments",
    "treatmentNotes",
    "reports",
    "appointmentTypes",
    "rebookStatuses",
    "notifications",
    "approvalRequests",
    "inboxItems",
    "reportReminders",
    "messages",
    "runningLateAlerts",
    "sessions",
    "clinikoSyncLogs",
    "syncErrors",
    "clinikoLocations"
  ]) {
    db[key] = [];
  }

  db.activityLog = [{
    id: `activity-${randomUUID()}`,
    actorId: keptUsers.find((user) => normalizeEmail(user.email) === "katie@refinehealthgroup.com.au")?.id || "system",
    action: "cleared_test_cliniko_data_before_real_sync",
    entityType: "cliniko",
    entityId: "real-cliniko-reset",
    createdAt: now
  }];
  db.clinikoSync = {
    status: getClinikoConfig().connected ? "ready" : "not_connected",
    lastSyncAt: null,
    message: "Test Cliniko data has been cleared. Choose one location and practitioner, then run Sync Now.",
    counts: {}
  };
  db.meta.testClinikoClearedAt = now;
  db.meta.realClinikoReady = true;
  db.meta.realClinikoResetMarker = REAL_CLINIKO_RESET_MARKER;
}

function emptyDb() {
  return normalizeDb({
    meta: {
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      productionEmpty: true
    },
    settings: {
      businessName: "Refine Physio Mobile",
      timezone: "Australia/Brisbane"
    },
    users: [],
    clients: [],
    caseManagers: [],
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
    runningLateAlerts: [],
    sessions: [],
    activityLog: [],
    clinikoSyncLogs: [],
    syncErrors: [],
    clinikoLocations: []
  });
}

function normalizeAppointmentApprovalState(db) {
  for (const appointment of db.appointments || []) {
    if (appointment.status !== "pending_approval" && !appointment.approvalRequired) continue;
    appointment.status = "booked";
    appointment.approvalRequired = false;
    appointment.approvalStatus = "";
    appointment.approvalRequestId = "";
    if (appointment.clinikoStatus === "hold_for_admin_approval") {
      appointment.clinikoStatus = getClinikoConfig().connected ? "pending_push" : "not_connected";
    }
  }
}

function normalizeCaseManagers(db) {
  db.caseManagers = (db.caseManagers || [])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || `case-manager-${slugId(item.name || item.email || randomUUID())}`),
      name: String(item.name || "").trim(),
      email: String(item.email || "").trim(),
      mobile: String(item.mobile || item.phone || "").trim(),
      organisation: String(item.organisation || item.provider || "").trim(),
      notes: String(item.notes || "").trim(),
      isActive: item.isActive !== false,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
    }))
    .filter((item) => item.name);

  for (const referral of db.referrals || []) {
    if (!referral.caseManager || referral.caseManagerId) continue;
    const name = String(referral.caseManager || "").trim();
    if (!name) continue;
    let manager = findCaseManagerByName(db, name);
    if (!manager) {
      manager = {
        id: uniqueCaseManagerId(db, name),
        name,
        email: "",
        mobile: "",
        organisation: "",
        notes: "",
        isActive: true,
        createdAt: referral.createdAt || new Date().toISOString(),
        updatedAt: referral.updatedAt || referral.createdAt || new Date().toISOString()
      };
      db.caseManagers.push(manager);
    }
    referral.caseManagerId = manager.id;
    const client = db.clients.find((item) => item.id === referral.clientId);
    if (client && !client.caseManagerId) client.caseManagerId = manager.id;
  }
}

function findCaseManagerByName(db, name) {
  const normalized = String(name || "").trim().toLowerCase();
  return (db.caseManagers || []).find((item) => item.name.toLowerCase() === normalized);
}

function uniqueCaseManagerId(db, name) {
  const base = `case-manager-${slugId(name) || randomUUID()}`;
  const ids = new Set((db.caseManagers || []).map((item) => item.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function slugId(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function startClinikoPolling() {
  const config = getClinikoConfig();
  if (!config.connected || !config.pollEnabled) return;

  const intervalMs = config.pollingIntervalSeconds
    ? Math.max(config.pollingIntervalSeconds, 15) * 1000
    : Math.max(config.pollingIntervalMinutes || 5, 1) * 60 * 1000;
  let isPolling = false;
  const pollCliniko = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      const db = await readDb();
      const result = await syncCliniko(db);
      result.db.clinikoSync = result.sync;
      logActivity(result.db, "system", "polled_cliniko", "cliniko", "sync");
      await writeDb(result.db);
    } catch (error) {
      console.error(error);
    } finally {
      isPolling = false;
    }
  };

  pollCliniko();
  setInterval(pollCliniko, intervalMs).unref?.();
}

async function routeApi(req, res, url) {
  const db = await readDb();
  const method = req.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);
  const auth = authContext(db, req);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "refine-physio-mobile",
      environment: process.env.NODE_ENV || "development",
      cliniko: getClinikoConfig()
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const result = await loginUser(db, body);
    if (result.error) {
      await writeDb(db);
      return sendJson(res, result.status, { error: result.error });
    }
    await writeDb(db);
    sendJson(res, 200, { user: publicUser(result.user, { includeSignature: true }) }, { "Set-Cookie": sessionCookie(result.token) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookieValue(req.headers.cookie, "refine_session");
    revokeSession(db, token);
    if (auth?.user) logActivity(db, auth.user.id, "logged_out", "user", auth.user.id);
    await writeDb(db);
    sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/forgot-password") {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const user = db.users.find((item) => normalizeEmail(item.email) === email && item.isActive !== false);
    if (user) logActivity(db, user.id, "requested_password_reset", "user", user.id);
    await writeDb(db);
    sendJson(res, 200, {
      message: "If this email has an account, ask an admin to reset the password from User management."
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/auth/session") {
    if (!auth?.user) return sendJson(res, 401, { error: "Not signed in" }, { "Set-Cookie": clearSessionCookie() });
    sendJson(res, 200, { user: publicUser(auth.user, { includeSignature: true }) });
    return;
  }

  if (!auth?.user) {
    sendJson(res, 401, { error: "Please sign in to continue." }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/cliniko/status") {
    if (!requireRole(res, auth.user, ["admin"])) return;
    sendJson(res, 200, {
      config: getClinikoConfig(),
      endpoints: clinikoEndpointSummary(),
      lastSync: db.clinikoSync,
      locations: db.clinikoLocations || [],
      practitioners: clinikoPractitioners(db),
      recentSyncLogs: (db.clinikoSyncLogs || []).slice(-20).reverse(),
      recentSyncErrors: (db.syncErrors || []).slice(-20).reverse()
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(res, 200, buildBootstrap(db, auth.user.id));
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/report-section") {
    const body = await readJsonBody(req);
    const result = await polishReportSectionWithOpenAI(body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    logActivity(db, auth.user.id, "ai_polished_report_section", "reportSection", result.sectionType);
    await writeDb(db);
    sendJson(res, 200, { text: result.text });
    return;
  }

  if (method === "PATCH" && url.pathname === "/api/users/me/signature") {
    const body = await readJsonBody(req);
    const result = updateOwnSignature(db, auth.user.id, body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, { user: publicUser(result.user, { includeSignature: true }) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/referrals") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    body.actorId = auth.user.id;
    const result = createReferral(db, body);
    await writeDb(db);
    sendJson(res, 201, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/case-managers") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = createCaseManager(db, body, auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 201, result.caseManager);
    return;
  }

  if (method === "PATCH" && parts[1] === "case-managers" && parts[2]) {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = updateCaseManager(db, parts[2], body, auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result.caseManager);
    return;
  }

  if (method === "PATCH" && parts[1] === "clients" && parts[2] && parts[3] === "case-manager") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    const result = assignCaseManagerToClient(db, parts[2], body, auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/reception-bookings") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    body.actorId = auth.user.id;
    const result = await createReceptionBooking(db, body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 201, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/appointments") {
    const body = await readJsonBody(req);
    body.actorId = auth.user.id;
    if (auth.user.role === "contractor") body.contractorId = auth.user.id;
    const result = await createAppointment(db, body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 201, result.appointment);
    return;
  }

  if (method === "PATCH" && parts[1] === "referrals" && parts[2]) {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    const referral = db.referrals.find((item) => item.id === parts[2]);
    if (!referral) return sendJson(res, 404, { error: "Referral not found" });
    const previousContractor = referral.assignedContractorId;
    Object.assign(referral, pick(body, [
      "clientName",
      "dob",
      "address",
      "phone",
      "email",
      "fundingType",
      "referralSource",
      "caseManagerId",
      "caseManager",
      "diagnosis",
      "goals",
      "reasonForReferral",
      "status",
      "assignedContractorId",
      "urgency",
      "notes",
      "risks",
      "preferredTherapist",
      "suburb",
      "serviceTypeRequired"
    ]));
    const referralReason = Object.hasOwn(body, "reasonForReferral")
      ? body.reasonForReferral
      : Object.hasOwn(body, "goals")
      ? body.goals
      : undefined;
    if (referralReason !== undefined) {
      referral.reasonForReferral = referralReason;
      referral.goals = referralReason;
    }
    const caseManagerSelection = resolveCaseManagerSelection(db, body);
    if (caseManagerSelection.hasSelection) {
      referral.caseManagerId = caseManagerSelection.caseManagerId;
      referral.caseManager = caseManagerSelection.caseManager;
      referral.caseManagerDetails = caseManagerSelection.caseManagerDetails;
    }
    updateClientFromReferralPatch(db, referral, body, referralReason);
    referral.updatedAt = new Date().toISOString();

    if (body.assignedContractorId && body.assignedContractorId !== previousContractor) {
      referral.status = referral.status === "new" ? "assigned" : referral.status;
      db.notifications.push(notification(body.assignedContractorId, "new_referral_assigned", `${referral.clientName} has been assigned to you.`));
    }

    logActivity(db, auth.user.id, "updated_referral", "referral", referral.id);
    await writeDb(db);
    sendJson(res, 200, referral);
    return;
  }

  if (method === "POST" && parts[1] === "appointments" && parts[2] && parts[3] === "running-late") {
    const body = await readJsonBody(req);
    const appointment = db.appointments.find((item) => item.id === parts[2]);
    if (!appointment) return sendJson(res, 404, { error: "Appointment not found" });
    if (!canAccessAppointment(db, auth.user, appointment)) return sendJson(res, 403, { error: "You do not have access to this appointment." });

    const result = await createRunningLateAlert(db, appointment.id, body, auth.user);
    if (result.error) return sendJson(res, result.status, { error: result.error });

    await writeDb(db);
    sendJson(res, 201, result);
    return;
  }

  if (method === "PATCH" && parts[1] === "appointments" && parts[2]) {
    const body = await readJsonBody(req);
    const appointment = db.appointments.find((item) => item.id === parts[2]);
    if (!appointment) return sendJson(res, 404, { error: "Appointment not found" });
    if (!canAccessAppointment(db, auth.user, appointment)) return sendJson(res, 403, { error: "You do not have access to this appointment." });
    body.actorId = auth.user.id;

    const clinikoWriteBackEdit = isClinikoAppointmentWriteBackEdit(body, appointment);
    if (clinikoWriteBackEdit) {
      const writeResult = await updateClinikoAppointmentFromApp(db, appointment, body);
      if (!["synced", "no_changes"].includes(writeResult.status)) {
        await writeDb(db);
        const status = writeResult.status === "not_enabled" ? 409 : writeResult.status === "conflict" ? 409 : 502;
        return sendJson(res, status, {
          error: writeResult.message || "Cliniko appointment write-back failed."
        });
      }
    }

    Object.assign(appointment, pick(body, ["status", "startsAt", "endsAt", "notesComplete", "reportDue", "recurrence", "appointmentType"]));
    if (body.status === "archived") {
      appointment.archivedBy = body.actorId || appointment.contractorId;
      appointment.archivedAt = new Date().toISOString();
    }
    appointment.notesComplete = appointmentHasSignedNote(db, appointment.id);
    logActivity(db, body.actorId || appointment.contractorId, body.status === "archived" ? "archived_appointment" : "updated_appointment", "appointment", appointment.id);

    await writeDb(db);
    sendJson(res, 200, appointment);
    return;
  }

  if (method === "DELETE" && url.pathname === "/api/archived-appointments") {
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = clearArchivedAppointmentHistory(db, auth.user.id);
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "DELETE" && parts[1] === "archived-appointments" && parts[2]) {
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = deleteArchivedAppointmentHistory(db, parts[2], auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/treatment-notes") {
    const body = await readJsonBody(req);
    body.actorId = auth.user.id;
    const existingNote = body.id ? db.treatmentNotes.find((item) => item.id === body.id) : null;
    if (existingNote && !canAccessTreatmentNote(db, auth.user, existingNote)) return sendJson(res, 403, { error: "You do not have access to this note." });
    const appointment = body.appointmentId ? db.appointments.find((item) => item.id === body.appointmentId) : null;
    if (appointment && !canAccessAppointment(db, auth.user, appointment)) return sendJson(res, 403, { error: "You do not have access to this appointment." });
    if (auth.user.role === "contractor") body.contractorId = auth.user.id;
    const note = await upsertTreatmentNote(db, body);
    await writeDb(db);
    sendJson(res, body.id ? 200 : 201, note);
    return;
  }

  if (method === "POST" && url.pathname === "/api/reports") {
    const body = await readJsonBody(req);
    body.actorId = auth.user.id;
    const existingReport = body.id ? db.reports.find((item) => item.id === body.id) : null;
    if (existingReport && !canAccessReport(auth.user, existingReport)) return sendJson(res, 403, { error: "You do not have access to this report." });
    const appointment = body.appointmentId ? db.appointments.find((item) => item.id === body.appointmentId) : null;
    if (appointment && !canAccessAppointment(db, auth.user, appointment)) return sendJson(res, 403, { error: "You do not have access to this appointment." });
    if (auth.user.role === "contractor") body.contractorId = auth.user.id;
    const report = await upsertReport(db, body);
    await writeDb(db);
    sendJson(res, body.id ? 200 : 201, report);
    return;
  }

  if (method === "PATCH" && parts[1] === "reports" && parts[2] && parts[3] === "case-manager") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    body.actorId = auth.user.id;
    const result = markReportSentToCaseManager(db, parts[2], body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result.report);
    return;
  }

  if (method === "POST" && parts[1] === "reports" && parts[2] && parts[3] === "cliniko-upload") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = await uploadCompletedReportToCliniko(db, parts[2], auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/report-reminders") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    body.actorId = auth.user.id;
    const result = createReportReminder(db, body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 201, result.reminder);
    return;
  }

  if (method === "POST" && url.pathname === "/api/messages") {
    const body = await readJsonBody(req);
    body.fromUserId = auth.user.id;
    const result = createMessage(db, body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 201, result.message);
    return;
  }

  if (method === "PATCH" && url.pathname === "/api/messages/read") {
    const body = await readJsonBody(req);
    const result = markMessagesRead(db, auth.user, body);
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "GET" && parts[1] === "reports" && parts[2] && parts[3] === "print") {
    const report = db.reports.find((item) => item.id === parts[2]);
    if (!report) return sendHtml(res, 404, "<h1>Report not found</h1>");
    if (!canAccessReport(auth.user, report)) return sendHtml(res, 403, "<h1>Forbidden</h1>");
    sendHtml(res, 200, renderReportHtml(db, report, { hideCaseManagerDetails: auth.user.role === "contractor" }));
    return;
  }

  if (method === "GET" && parts[1] === "reports" && parts[2] && parts[3] === "pdf") {
    const report = db.reports.find((item) => item.id === parts[2]);
    if (!report) return sendText(res, 404, "Report not found");
    if (!canAccessReport(auth.user, report)) return sendText(res, 403, "Forbidden");
    sendPdf(res, 200, renderReportPdfBuffer(db, report, { hideCaseManagerDetails: auth.user.role === "contractor" }), reportDownloadFilename(db, report));
    return;
  }

  if (method === "POST" && url.pathname === "/api/approval-requests") {
    const body = await readJsonBody(req);
    if (auth.user.role === "contractor") body.contractorId = auth.user.id;
    if (auth.user.role === "contractor" && !contractorCanAccessClient(db, auth.user.id, body.clientId)) {
      return sendJson(res, 403, { error: "Practitioners can only request approvals for their own clients." });
    }
    const client = db.clients.find((item) => item.id === body.clientId);
    const contractor = db.users.find((item) => item.id === body.contractorId && item.role === "contractor" && item.isActive !== false);
    if (!client) return sendJson(res, 400, { error: "Choose a client before sending the approval request." });
    if (!contractor) return sendJson(res, 400, { error: "Choose a practitioner before sending the approval request." });
    const requestType = body.type || "Approvals needed";
    const approvalNeedType = body.approvalNeedType || requestType;
    const duplicateRequest = db.approvalRequests.find((item) =>
      isCaseManagerApprovalRequest(item)
      && item.contractorId === contractor.id
      && item.clientId === client.id
      && (item.approvalNeedType || item.type) === approvalNeedType
      && !["approved", "declined"].includes(item.status)
    );

    if (duplicateRequest) {
      if (body.details) duplicateRequest.details = body.details;
      duplicateRequest.updatedAt = new Date().toISOString();
      syncInboxItems(db);
      notifyOperationsUsers(db, "approval_request", approvalRequestAdminMessage(db, duplicateRequest));
      logActivity(db, auth.user.id, "resent_approval_request", "approvalRequest", duplicateRequest.id);
      await writeDb(db);
      sendJson(res, 200, { ...duplicateRequest, alreadySent: true });
      return;
    }

    const request = {
      id: `approval-${randomUUID()}`,
      contractorId: contractor.id,
      clientId: client.id,
      appointmentId: "",
      type: requestType,
      approvalNeedType,
      adminAction: body.adminAction || "Ask case manager for approval",
      source: body.source || "case_manager_approval",
      status: "pending",
      resultMessage: "",
      details: body.details || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.approvalRequests.push(request);
    syncInboxItems(db);
    notifyOperationsUsers(db, "approval_request", approvalRequestAdminMessage(db, request));
    logActivity(db, auth.user.id, "created_approval_request", "approvalRequest", request.id);
    await writeDb(db);
    sendJson(res, 201, request);
    return;
  }

  if (method === "PATCH" && parts[1] === "approval-requests" && parts[2]) {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    const request = db.approvalRequests.find((item) => item.id === parts[2]);
    if (!request) return sendJson(res, 404, { error: "Approval request not found" });
    Object.assign(request, pick(body, ["status", "resultMessage"]));
    request.updatedAt = new Date().toISOString();

    const client = db.clients.find((item) => item.id === request.clientId);
    const statusLabel = approvalStatusLabel(request.status);
    syncInboxItems(db);
    db.notifications.push(notification(
      request.contractorId,
      "approval_result",
      `${client?.name || "Client"} approval update: ${request.approvalNeedType || request.type} is ${statusLabel}.`
    ));
    logActivity(db, auth.user.id, "updated_approval_request", "approvalRequest", request.id);
    await writeDb(db);
    sendJson(res, 200, request);
    return;
  }

  if (method === "PATCH" && parts[1] === "inbox-items" && parts[2]) {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin", "receptionist"])) return;
    const item = db.inboxItems.find((entry) => entry.id === parts[2]);
    if (!item) return sendJson(res, 404, { error: "Inbox item not found" });

    Object.assign(item, pick(body, ["status", "priority", "adminNote"]));
    item.updatedAt = new Date().toISOString();

    if (item.sourceType === "approval_request" && body.status === "waiting") {
      const request = db.approvalRequests.find((entry) => entry.id === item.sourceId);
      if (request && request.status === "pending") {
        request.status = "waiting";
        request.updatedAt = item.updatedAt;
      }
    }

    logActivity(db, auth.user.id, "updated_inbox_item", "inboxItem", item.id);
    await writeDb(db);
    sendJson(res, 200, item);
    return;
  }

  if (method === "PATCH" && url.pathname === "/api/notifications/read") {
    const body = await readJsonBody(req);
    body.userId = auth.user.id;
    const result = markNotificationsRead(db, body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && parts[1] === "sync-errors" && parts[2] && parts[3] === "retry") {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = await retrySyncError(db, parts[2], auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/rebook-statuses") {
    const body = await readJsonBody(req);
    if (auth.user.role === "contractor") body.contractorId = auth.user.id;
    if (auth.user.role === "contractor" && !contractorCanAccessClient(db, auth.user.id, body.clientId)) {
      return sendJson(res, 403, { error: "Practitioners can only update rebooking status for their own clients." });
    }
    const client = db.clients.find((item) => item.id === body.clientId);
    const contractor = db.users.find((item) => item.id === body.contractorId);
    if (!client) return sendJson(res, 404, { error: "Client not found" });
    if (!contractor) return sendJson(res, 404, { error: "Contractor not found" });

    const status = {
      id: `rebook-status-${randomUUID()}`,
      contractorId: contractor.id,
      clientId: client.id,
      status: "sent_to_reception",
      reason: body.reason || "",
      createdAt: new Date().toISOString()
    };
    db.rebookStatuses.push(status);
    db.notifications.push(notification("admin-jenni", "rebook_status", `${contractor.name} says ${client.name} does not need to be rebooked.`));
    logActivity(db, contractor.id, "sent_rebook_status", "client", client.id);
    await writeDb(db);
    sendJson(res, 201, status);
    return;
  }

  if (method === "POST" && url.pathname === "/api/cliniko/sync") {
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = await syncCliniko(db);
    result.db.clinikoSync = result.sync;
    logActivity(result.db, auth.user.id, "synced_cliniko", "cliniko", "sync");
    await writeDb(result.db);
    sendJson(res, 200, {
      clinikoSync: result.sync,
      config: getClinikoConfig(),
      locations: result.db.clinikoLocations || [],
      practitioners: clinikoPractitioners(result.db)
    });
    return;
  }

  if (method === "PATCH" && parts[1] === "cliniko" && parts[2] === "locations" && parts[3]) {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = updateClinikoLocationEnabled(db, parts[3], Boolean(body.enabled));
    if (result.error) return sendJson(res, result.status, { error: result.error });
    logActivity(db, auth.user.id, body.enabled ? "enabled_cliniko_location" : "disabled_cliniko_location", "clinikoLocation", result.location.id);
    await writeDb(db);
    sendJson(res, 200, {
      location: result.location,
      locations: result.locations,
      config: getClinikoConfig()
    });
    return;
  }

  if (method === "PATCH" && parts[1] === "cliniko" && parts[2] === "practitioners" && parts[3]) {
    const body = await readJsonBody(req);
    if (!requireRole(res, auth.user, ["admin"])) return;
    const result = updateClinikoPractitionerEnabled(db, parts[3], Boolean(body.enabled));
    if (result.error) return sendJson(res, result.status, { error: result.error });
    logActivity(db, auth.user.id, body.enabled ? "enabled_cliniko_practitioner" : "disabled_cliniko_practitioner", "clinikoPractitioner", result.practitioner.id);
    await writeDb(db);
    sendJson(res, 200, {
      practitioner: result.practitioner,
      practitioners: result.practitioners,
      config: getClinikoConfig()
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/users") {
    if (!requireRole(res, auth.user, ["admin"])) return;
    const body = await readJsonBody(req);
    const result = await createAppUser(db, body, auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 201, { user: publicUser(result.user), temporaryPassword: result.temporaryPassword || "" });
    return;
  }

  if (method === "PATCH" && parts[1] === "users" && parts[2]) {
    if (!requireRole(res, auth.user, ["admin"])) return;
    const body = await readJsonBody(req);
    const result = updateAppUser(db, parts[2], body, auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, { user: publicUser(result.user) });
    return;
  }

  if (method === "POST" && parts[1] === "users" && parts[2] && parts[3] === "password") {
    if (!requireRole(res, auth.user, ["admin"])) return;
    const body = await readJsonBody(req);
    const result = await setUserPassword(db, parts[2], body.password, auth.user.id);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    await writeDb(db);
    sendJson(res, 200, { user: publicUser(result.user) });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function authContext(db, req) {
  const token = cookieValue(req.headers.cookie, "refine_session");
  return authenticateSession(db, token);
}

async function loginUser(db, body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const user = db.users.find((item) => normalizeEmail(item.email) === email && item.isActive !== false);
  const passwordHash = user?.passwordHash || "";
  const valid = passwordHash ? await verifyPassword(password, passwordHash) : false;

  if (!email || !password || !user || !valid) {
    if (user) logActivity(db, user.id, "failed_login", "user", user.id);
    return { status: 401, error: "Email or password is incorrect." };
  }

  user.lastLoginAt = new Date().toISOString();
  user.requiresLoginSetup = false;
  const { token } = createSession(db, user);
  logActivity(db, user.id, "logged_in", "user", user.id);
  return { user, token };
}

function requireRole(res, user, roles) {
  if (roles.includes(user.role)) return true;
  sendJson(res, 403, { error: "You do not have permission to do that." });
  return false;
}

function canAccessAppointment(db, user, appointment) {
  if (["admin", "receptionist"].includes(user.role)) return true;
  return user.role === "contractor" && appointment.contractorId === user.id;
}

function canAccessTreatmentNote(db, user, note) {
  if (["admin", "receptionist"].includes(user.role)) return true;
  if (user.role !== "contractor") return false;
  if (note.contractorId === user.id) return true;
  const appointment = db.appointments.find((item) => item.id === note.appointmentId);
  return Boolean(appointment && appointment.contractorId === user.id);
}

function canAccessReport(user, report) {
  if (["admin", "receptionist"].includes(user.role)) return true;
  return user.role === "contractor" && report.contractorId === user.id;
}

async function createAppUser(db, body, actorId) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, error: "Email is required." };
  if (db.users.some((user) => normalizeEmail(user.email) === email)) {
    return { status: 409, error: "A user with this email already exists." };
  }

  const role = normalizedRole(body.role);
  if (!role) return { status: 400, error: "Choose admin, receptionist, or practitioner." };

  const temporaryPassword = String(body.password || "").trim();
  const user = {
    id: `user-${randomUUID()}`,
    email,
    name: String(body.name || "").trim() || email,
    role,
    discipline: role === "contractor" ? (body.discipline || "Physiotherapy") : (body.discipline || roleLabel(role)),
    phone: body.phone || "",
    baseSuburb: body.baseSuburb || "",
    ...normalizedWorkingHours(body, role),
    clinikoPractitionerId: role === "contractor" ? String(body.clinikoPractitionerId || "").trim() : "",
    clinikoSyncEnabled: false,
    requiresLoginSetup: true,
    isActive: body.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (temporaryPassword) {
    user.passwordHash = await hashPassword(temporaryPassword);
    user.requiresLoginSetup = false;
  }

  db.users.push(user);
  logActivity(db, actorId, "created_user", "user", user.id);
  return { user, temporaryPassword: temporaryPassword ? "" : "" };
}

function updateAppUser(db, userId, body, actorId) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) return { status: 404, error: "User not found." };

  if (body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!email) return { status: 400, error: "Email is required." };
    if (db.users.some((item) => item.id !== user.id && normalizeEmail(item.email) === email)) {
      return { status: 409, error: "A user with this email already exists." };
    }
    user.email = email;
  }

  if (body.role !== undefined) {
    const role = normalizedRole(body.role);
    if (!role) return { status: 400, error: "Choose admin, receptionist, or practitioner." };
    user.role = role;
    if (role !== "contractor") {
      user.clinikoSyncEnabled = false;
      user.clinikoPractitionerId = "";
    }
  }

  for (const key of ["name", "discipline", "phone", "baseSuburb", "clinikoPractitionerId"]) {
    if (body[key] !== undefined) user[key] = String(body[key] || "").trim();
  }
  Object.assign(user, normalizedWorkingHours(body, user.role));
  if (body.isActive !== undefined) user.isActive = Boolean(body.isActive);
  user.updatedAt = new Date().toISOString();
  logActivity(db, actorId, "updated_user", "user", user.id);
  return { user };
}

async function setUserPassword(db, userId, password, actorId) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) return { status: 404, error: "User not found." };
  try {
    user.passwordHash = await hashPassword(password);
  } catch (error) {
    return { status: 400, error: error.message };
  }
  user.requiresLoginSetup = false;
  user.updatedAt = new Date().toISOString();
  for (const session of db.sessions || []) {
    if (session.userId === user.id && !session.revokedAt) session.revokedAt = new Date().toISOString();
  }
  logActivity(db, actorId, "reset_user_password", "user", user.id);
  return { user };
}

function updateOwnSignature(db, userId, body = {}) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) return { status: 404, error: "User not found." };

  const clear = body.clear === true || body.signatureDataUrl === "";
  if (clear) {
    user.signatureDataUrl = "";
    user.signatureWidth = 0;
    user.signatureHeight = 0;
    user.signatureUpdatedAt = "";
    user.updatedAt = new Date().toISOString();
    logActivity(db, user.id, "cleared_signature", "user", user.id);
    return { user };
  }

  const signatureDataUrl = sanitizeSignatureDataUrl(body.signatureDataUrl);
  if (!signatureDataUrl) {
    return { status: 400, error: "Please draw and save a signature first." };
  }

  user.signatureDataUrl = signatureDataUrl;
  user.signatureWidth = Math.max(1, Math.min(1200, Number(body.width || 520) || 520));
  user.signatureHeight = Math.max(1, Math.min(500, Number(body.height || 160) || 160));
  user.signatureUpdatedAt = new Date().toISOString();
  user.updatedAt = user.signatureUpdatedAt;
  logActivity(db, user.id, "saved_signature", "user", user.id);
  return { user };
}

function sanitizeSignatureDataUrl(value) {
  const dataUrl = String(value || "").trim();
  if (!dataUrl) return "";
  if (dataUrl.length > SIGNATURE_MAX_DATA_URL_LENGTH) return "";
  return /^data:image\/jpe?g;base64,[A-Za-z0-9+/=]+$/i.test(dataUrl) ? dataUrl : "";
}

async function polishReportSectionWithOpenAI(body = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return { status: 409, error: "AI rewriting is not connected yet. Add OPENAI_API_KEY in Render environment variables first." };
  }

  const section = aiReportSectionConfig(body.sectionType, body.sectionLabel);
  if (!section) {
    return { status: 400, error: "This report section is not set up for AI rewriting." };
  }

  const text = String(body.text || "").trim();
  if (!text) return { status: 400, error: "Add dot points first." };
  if (text.length > AI_REPORT_SECTION_MAX_CHARS) {
    return { status: 400, error: "This section is too long for one AI rewrite. Please shorten it first." };
  }

  const model = String(process.env.OPENAI_MODEL || "gpt-5-mini").trim();
  const requestBody = {
    model,
    instructions: aiReportInstructions(section, body.reportType),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Raw practitioner notes:\n${text}`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "report_section_rewrite",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: {
              type: "string",
              description: "The polished report-ready paragraph text."
            }
          },
          required: ["text"]
        }
      }
    },
    max_output_tokens: 800,
    store: false
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || "OpenAI request failed.";
      return { status: 502, error: `AI rewrite failed: ${message}` };
    }

    const outputText = extractOpenAIOutputText(payload);
    const polished = parseAiRewriteText(outputText);
    if (!polished) return { status: 502, error: "AI rewrite did not return usable text." };

    return {
      sectionType: section.type,
      text: polished.slice(0, AI_REPORT_SECTION_MAX_CHARS)
    };
  } catch (error) {
    return { status: 502, error: `AI rewrite failed: ${error.message}` };
  }
}

function aiReportSectionConfig(sectionType, sectionLabel = "") {
  const configured = {
    subjective: {
      type: "subjective",
      label: "Subjective",
      guidance: "Focus on patient-reported and carer-reported information, symptoms, function, goals, concerns, and relevant history."
    },
    objective: {
      type: "objective",
      label: "Objective observations",
      guidance: "Focus on observed assessment findings, mobility, transfers, balance, gait, strength, safety, and outcome measure observations."
    },
    equipmentChosenReason: {
      type: "equipmentChosenReason",
      label: "Equipment trial chosen option explanation",
      guidance: "Explain why the chosen equipment option was most suitable based only on the supplied trial notes. Do not invent brands, pricing, supplier details, risks, or specifications."
    },
    recommendations: {
      type: "recommendations",
      label: "Recommendations",
      guidance: "Rewrite the supplied recommendation dot points into clear report-ready recommendations. Do not create new recommendations, treatment frequency, risks, equipment, or follow-up actions that were not supplied."
    },
    equipmentRecommendations: {
      type: "equipmentRecommendations",
      label: "Equipment trial recommendations",
      guidance: "Rewrite the supplied equipment recommendation dot points into clear report-ready wording. Do not invent equipment, brands, funding advice, supplier details, prices, risks, or follow-up actions that were not supplied."
    },
    equipmentSummary: {
      type: "equipmentSummary",
      label: "Equipment trial summary",
      guidance: "Rewrite the supplied equipment trial summary dot points into a concise report-ready summary. Do not invent trial outcomes, equipment details, recommendations, funding details, or safety issues that were not supplied."
    }
  }[String(sectionType || "").trim()];
  if (configured) return configured;

  const label = String(sectionLabel || sectionType || "Report section").trim();
  return {
    type: String(sectionType || "genericReportSection").trim() || "genericReportSection",
    label,
    guidance: `Rewrite the supplied notes for the ${label} section into clear report-ready wording. Do not invent clinical findings, recommendations, equipment, funding details, risks, diagnoses, timeframes, or follow-up actions that were not supplied.`
  };
}

function aiReportInstructions(section, reportType = "") {
  return [
    "You are helping an Australian mobile physiotherapy practitioner rewrite rough report notes into clear professional report wording.",
    `Section: ${section.label}.`,
    reportType ? `Report type: ${String(reportType).trim()}.` : "",
    section.guidance,
    "Rewrite only the information supplied by the practitioner.",
    "Do not add, infer, assume, embellish, diagnose, recommend, or create any clinical facts that are not in the notes.",
    "Preserve clinical meaning, uncertainty, names, abbreviations, measurements, timeframes, and equipment details exactly where important.",
    "Use Australian English in a polished, professional physiotherapy report tone suitable for case managers, aged care providers, and clinical records.",
    "Keep the wording concise, objective, respectful, and report-ready. Avoid casual, chatty, promotional, or overly dramatic phrasing.",
    "If the notes are dot points, turn them into one or two polished paragraphs. If the notes are already paragraphs, lightly improve grammar and flow.",
    "Return JSON only with a single key named text."
  ].filter(Boolean).join("\n");
}

function extractOpenAIOutputText(payload = {}) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const pieces = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") pieces.push(content.text);
    }
  }
  return pieces.join("\n").trim();
}

function parseAiRewriteText(outputText) {
  const raw = String(outputText || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.text || "").trim();
  } catch {
    return raw;
  }
}

function normalizedRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "practitioner") return "contractor";
  return ["admin", "receptionist", "contractor"].includes(value) ? value : "";
}

function roleLabel(role) {
  return {
    admin: "Admin",
    receptionist: "Reception",
    contractor: "Physiotherapy"
  }[role] || "";
}

function normalizeUserWorkingHours(user) {
  Object.assign(user, normalizedWorkingHours(user, user.role));
}

function normalizedWorkingHours(body = {}, role = "contractor") {
  if (role !== "contractor") return { workingStart: "", workingEnd: "" };
  const workingStart = normalizeWorkingTime(body.workingStart, "09:00");
  const workingEnd = normalizeWorkingTime(body.workingEnd, "17:00");
  if (timeToMinutes(workingEnd) <= timeToMinutes(workingStart)) {
    return { workingStart: "09:00", workingEnd: "17:00" };
  }
  return { workingStart, workingEnd };
}

function normalizeWorkingTime(value, fallback) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function professionalTitleForUser(user = {}) {
  const discipline = String(user.discipline || "").trim();
  if (!discipline || discipline.toLowerCase() === "physiotherapy") return "Physiotherapist";
  return discipline;
}

function createCaseManager(db, body, actorId) {
  const payload = normalizeCaseManagerPayload(body);
  if (!payload.name) return { status: 400, error: "Case manager name is required." };
  if (db.caseManagers.some((item) => item.name.toLowerCase() === payload.name.toLowerCase())) {
    return { status: 409, error: "A case manager with this name already exists." };
  }
  const now = new Date().toISOString();
  const caseManager = {
    id: uniqueCaseManagerId(db, payload.name),
    ...payload,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
  db.caseManagers.push(caseManager);
  logActivity(db, actorId, "created_case_manager", "caseManager", caseManager.id);
  return { caseManager };
}

function updateCaseManager(db, caseManagerId, body, actorId) {
  const caseManager = db.caseManagers.find((item) => item.id === caseManagerId);
  if (!caseManager) return { status: 404, error: "Case manager not found." };
  const payload = normalizeCaseManagerPayload(body);
  if (!payload.name) return { status: 400, error: "Case manager name is required." };
  if (db.caseManagers.some((item) => item.id !== caseManager.id && item.name.toLowerCase() === payload.name.toLowerCase())) {
    return { status: 409, error: "A case manager with this name already exists." };
  }
  Object.assign(caseManager, payload, {
    isActive: body.isActive !== false,
    updatedAt: new Date().toISOString()
  });
  syncCaseManagerNameToAssignments(db, caseManager);
  logActivity(db, actorId, "updated_case_manager", "caseManager", caseManager.id);
  return { caseManager };
}

function assignCaseManagerToClient(db, clientId, body, actorId) {
  const client = db.clients.find((item) => item.id === clientId);
  if (!client) return { status: 404, error: "Client not found." };
  const caseManagerId = String(body.caseManagerId || "").trim();
  const caseManager = caseManagerId ? db.caseManagers.find((item) => item.id === caseManagerId && item.isActive !== false) : null;
  if (caseManagerId && !caseManager) return { status: 404, error: "Case manager not found." };

  client.caseManagerId = caseManagerId;
  client.updatedAt = new Date().toISOString();

  for (const referral of db.referrals.filter((item) => item.clientId === client.id)) {
    referral.caseManagerId = caseManagerId;
    referral.caseManager = caseManager?.name || "";
    referral.caseManagerDetails = caseManager ? caseManagerDetailsText(caseManager) : "";
    referral.updatedAt = new Date().toISOString();
  }

  logActivity(db, actorId, "assigned_case_manager_to_client", "client", client.id);
  return { client, caseManager };
}

function normalizeCaseManagerPayload(body = {}) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim(),
    mobile: String(body.mobile || body.phone || "").trim(),
    organisation: String(body.organisation || "").trim(),
    notes: String(body.notes || "").trim()
  };
}

function syncCaseManagerNameToAssignments(db, caseManager) {
  for (const client of db.clients || []) {
    if (client.caseManagerId === caseManager.id) client.updatedAt = new Date().toISOString();
  }
  for (const referral of db.referrals || []) {
    if (referral.caseManagerId !== caseManager.id) continue;
    referral.caseManager = caseManager.name;
    referral.caseManagerDetails = caseManagerDetailsText(caseManager);
    referral.updatedAt = new Date().toISOString();
  }
}

function caseManagerDetailsText(caseManager = {}) {
  return [
    caseManager.organisation,
    caseManager.mobile,
    caseManager.email
  ].filter(Boolean).join(" | ");
}

function resolveCaseManagerSelection(db, body = {}) {
  const hasSelection = Object.hasOwn(body, "caseManagerId") || Object.hasOwn(body, "caseManager");
  if (!hasSelection) {
    return { hasSelection: false, caseManagerId: "", caseManager: "", caseManagerDetails: "" };
  }

  const caseManagerId = String(body.caseManagerId || "").trim();
  if (caseManagerId) {
    const caseManager = (db.caseManagers || []).find((item) => item.id === caseManagerId && item.isActive !== false);
    return {
      hasSelection: true,
      caseManagerId: caseManager?.id || "",
      caseManager: caseManager?.name || "",
      caseManagerDetails: caseManager ? caseManagerDetailsText(caseManager) : ""
    };
  }

  const caseManagerName = String(body.caseManager || "").trim();
  if (caseManagerName) {
    const caseManager = findCaseManagerByName(db, caseManagerName);
    return {
      hasSelection: true,
      caseManagerId: caseManager?.id || "",
      caseManager: caseManager?.name || caseManagerName,
      caseManagerDetails: caseManager ? caseManagerDetailsText(caseManager) : ""
    };
  }

  return { hasSelection: true, caseManagerId: "", caseManager: "", caseManagerDetails: "" };
}

function buildBootstrap(db, userId) {
  const activeUsers = db.users.filter((user) => user.isActive !== false);
  const currentUser = activeUsers.find((user) => user.id === userId)
    || {
      id: "setup-required",
      name: "Setup required",
      email: "",
      role: "admin",
      discipline: "Admin",
      requiresSetup: true
    };
  const isAdmin = currentUser.role === "admin";
  const isOwner = Boolean(currentUser.isOwner);
  const isReceptionist = currentUser.role === "receptionist";
  const isOperations = isAdmin || isReceptionist;
  const canUseOwnerWorkspace = isAdmin || (isOwner && isOperations);
  const visibleUsers = isOperations
    ? activeUsers
    : activeUsers.filter((user) => user.role === "admin" || user.id === currentUser.id);
  const physioContractorIds = new Set(activeUsers.filter((user) => user.role === "contractor").map((user) => user.id));
  const selectedClinikoBusinessIds = new Set(enabledClinikoBusinessIds(db));
  const selectedClinikoPractitionerIds = new Set(enabledClinikoPractitionerIds(db));
  const physioReferrals = db.referrals.filter((referral) =>
    referral.serviceTypeRequired === "Physiotherapy"
    || physioContractorIds.has(referral.assignedContractorId)
  );
  const physioAppointments = db.appointments
    .filter((appointment) =>
      appointment.serviceType === "Physiotherapy"
      || physioContractorIds.has(appointment.contractorId)
    )
    .filter((appointment) => clinikoAppointmentMatchesSelectedSetup(appointment, selectedClinikoBusinessIds, selectedClinikoPractitionerIds));
  const activePhysioAppointments = physioAppointments.filter((appointment) => !appointmentIsArchived(appointment));
  const archivedPhysioAppointments = physioAppointments.filter(appointmentIsArchived);
  const physioReports = db.reports.filter((report) =>
    physioContractorIds.has(report.contractorId)
    || report.type === "Initial Physiotherapy Assessment Report"
    || report.type === "Equipment Trial Report"
  );
  const physioClientIds = new Set([
    ...physioReferrals.map((referral) => referral.clientId),
    ...physioAppointments.map((appointment) => appointment.clientId),
    ...physioReports.map((report) => report.clientId)
  ]);
  const assignedClientIds = new Set([
    ...db.referrals.filter((referral) => referral.assignedContractorId === currentUser.id).map((referral) => referral.clientId),
    ...db.appointments.filter((appointment) => appointment.contractorId === currentUser.id).map((appointment) => appointment.clientId)
  ]);

  const clients = isOperations ? db.clients.filter((client) => physioClientIds.has(client.id)) : db.clients.filter((client) => assignedClientIds.has(client.id));
  const referrals = isOperations ? physioReferrals : db.referrals.filter((referral) => referral.assignedContractorId === currentUser.id);
  const appointments = isOperations
    ? activePhysioAppointments
    : activePhysioAppointments.filter((appointment) => appointment.contractorId === currentUser.id);
  const treatmentNotes = isOperations
    ? db.treatmentNotes.filter((note) => physioContractorIds.has(note.contractorId) || note.discipline === "Physiotherapy")
    : db.treatmentNotes.filter((note) => note.contractorId === currentUser.id);
  const reports = isOperations ? physioReports : db.reports.filter((report) => report.contractorId === currentUser.id);
  const scrubCaseManagerDetails = !isOperations;
  const treatmentNotesForRole = scrubCaseManagerDetails
    ? treatmentNotes.map(stripCaseManagerFromTreatmentNote)
    : treatmentNotes;
  const reportsForRole = scrubCaseManagerDetails
    ? reports.map(stripCaseManagerFromReport)
    : reports;
  const caseManagerApprovalRequests = db.approvalRequests.filter(isCaseManagerApprovalRequest);
  const caseManagerApprovalIds = new Set(caseManagerApprovalRequests.map((request) => request.id));
  const approvalRequests = isOperations
    ? caseManagerApprovalRequests.filter((request) => physioContractorIds.has(request.contractorId) || physioClientIds.has(request.clientId))
    : caseManagerApprovalRequests.filter((request) => request.contractorId === currentUser.id);
  const rebookStatuses = isOperations
    ? db.rebookStatuses.filter((status) => physioContractorIds.has(status.contractorId) || physioClientIds.has(status.clientId))
    : db.rebookStatuses.filter((status) => status.contractorId === currentUser.id);
  const inboxItems = isOperations
    ? db.inboxItems.filter((item) =>
      (item.sourceType !== "approval_request" || caseManagerApprovalIds.has(item.sourceId))
      && (physioContractorIds.has(item.contractorId) || physioClientIds.has(item.clientId))
    )
    : [];
  const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
  const messages = db.messages
    .filter((message) => visibleUserIds.has(message.fromUserId) && visibleUserIds.has(message.toUserId))
    .filter((message) => isOperations
      ? isAdminMessageParticipant(db, message)
      : message.fromUserId === currentUser.id || message.toUserId === currentUser.id
    )
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  const currentUserPublic = publicUser(currentUser, { includeSignature: true });
  if (!canUseOwnerWorkspace) currentUserPublic.isOwner = false;

  return {
    currentUser: currentUserPublic,
    users: visibleUsers.map(publicUser),
    contractors: (isOperations ? activeUsers.filter((user) => user.role === "contractor") : activeUsers.filter((user) => user.id === currentUser.id)).map(publicUser),
    caseManagers: isOperations ? (db.caseManagers || []).filter((item) => item.isActive !== false) : [],
    clients: scrubCaseManagerDetails ? clients.map(stripCaseManagerFromClient) : clients,
    referrals: scrubCaseManagerDetails ? referrals.map(stripCaseManagerFromReferral) : referrals,
    appointments,
    archivedAppointments: isOperations ? archivedPhysioAppointments : [],
    treatmentNotes: treatmentNotesForRole,
    reports: reportsForRole,
    approvalRequests,
    rebookStatuses,
    inboxItems,
    messages,
    notifications: canUseOwnerWorkspace ? db.notifications : db.notifications.filter((notificationItem) => notificationItem.userId === currentUser.id),
    activityLog: isOperations ? db.activityLog.slice(-10).reverse() : [],
    appointmentTypes: db.appointmentTypes || [],
    clinikoLocations: isAdmin ? (db.clinikoLocations || []) : [],
    clinikoPractitioners: isAdmin ? clinikoPractitioners(db) : [],
    clinikoSyncLogs: isAdmin ? (db.clinikoSyncLogs || []).slice(-20).reverse() : [],
    syncErrors: isAdmin ? (db.syncErrors || []).slice(-20).reverse() : [],
    noteTemplates,
    reportTemplates,
    appointmentStatuses,
    referralStatuses,
    clinikoSync: db.clinikoSync,
    clinikoConfig: publicClinikoConfig(isAdmin),
    permissions: {
      canManageUsers: isAdmin,
      canManageCliniko: isAdmin,
      canViewSyncLogs: isAdmin,
      canReviewReports: isOperations,
      canManageReferrals: isOperations,
      canAccessPractitionerWorkspace: canUseOwnerWorkspace
    }
  };
}

function publicClinikoConfig(isAdmin = false) {
  const current = getClinikoConfig();
  if (isAdmin) return current;
  return {
    connected: current.connected,
    appointmentCreateEnabled: current.appointmentCreateEnabled,
    appointmentWriteEnabled: current.appointmentWriteEnabled,
    reportUploadEnabled: current.reportUploadEnabled,
    reportUploadAutoEnabled: current.reportUploadAutoEnabled,
    noteUploadEnabled: current.noteUploadEnabled,
    noteUploadAutoEnabled: current.noteUploadAutoEnabled,
    mode: current.mode
  };
}

function clinikoPractitioners(db) {
  return (db.users || [])
    .filter((user) => user.role === "contractor" && user.clinikoPractitionerId)
    .filter((user) => user.syncSource === "cliniko" || user.requiresLoginSetup || user.clinikoUpdatedAt)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map(publicUser);
}

function stripCaseManagerFromClient(client = {}) {
  const {
    caseManager,
    caseManagerId,
    caseManagerDetails,
    caseManagerRegisteredNurse,
    registeredNurse,
    registeredNurseDetails,
    ...safeClient
  } = client;
  return safeClient;
}

function stripCaseManagerFromReferral(referral = {}) {
  const {
    caseManager,
    caseManagerId,
    caseManagerDetails,
    caseManagerRegisteredNurse,
    registeredNurse,
    registeredNurseDetails,
    ...safeReferral
  } = referral;
  return safeReferral;
}

function stripCaseManagerFromTreatmentNote(note = {}) {
  const {
    caseManager,
    caseManagerId,
    caseManagerDetails,
    caseManagerRegisteredNurse,
    registeredNurse,
    registeredNurseDetails,
    ...safeNote
  } = note;
  return {
    ...safeNote,
    fields: stripCaseManagerFields(note.fields || {})
  };
}

function stripCaseManagerFromReport(report = {}) {
  const {
    caseManager,
    caseManagerId,
    caseManagerDetails,
    caseManagerRegisteredNurse,
    caseManagerSentAt,
    caseManagerSentBy,
    caseManagerStatus,
    registeredNurse,
    registeredNurseDetails,
    ...safeReport
  } = report;
  return {
    ...safeReport,
    fields: stripCaseManagerFields(report.fields || {})
  };
}

function stripCaseManagerFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields || {}).filter(([key]) => !isCaseManagerSensitiveField(key))
  );
}

function isCaseManagerSensitiveField(key) {
  const normalized = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.includes("casemanager") || normalized.includes("registerednurse");
}

function clinikoAppointmentMatchesSelectedSetup(appointment, selectedBusinessIds, selectedPractitionerIds) {
  if (appointment.syncSource !== "cliniko") return true;
  if (!selectedBusinessIds.size || !selectedPractitionerIds.size) return false;
  return selectedBusinessIds.has(String(appointment.clinikoBusinessId || ""))
    && selectedPractitionerIds.has(String(appointment.clinikoPractitionerId || ""));
}

function appointmentIsArchived(appointment) {
  return appointment.status === "archived" || Boolean(appointment.archivedAt);
}

function deleteArchivedAppointmentHistory(db, appointmentId, actorId) {
  const index = db.appointments.findIndex((appointment) => appointment.id === appointmentId);
  if (index === -1 || !appointmentIsArchived(db.appointments[index])) {
    return { status: 404, error: "Archived appointment history not found." };
  }
  const [deleted] = db.appointments.splice(index, 1);
  logActivity(db, actorId, "deleted_archived_appointment_history", "appointment", deleted.id);
  return { deleted: 1, appointmentId: deleted.id };
}

function clearArchivedAppointmentHistory(db, actorId) {
  const archivedAppointments = db.appointments.filter(appointmentIsArchived);
  if (!archivedAppointments.length) return { deleted: 0 };
  const archivedIds = new Set(archivedAppointments.map((appointment) => appointment.id));
  db.appointments = db.appointments.filter((appointment) => !archivedIds.has(appointment.id));
  logActivity(db, actorId, "cleared_archived_appointment_history", "archived_appointments", String(archivedAppointments.length));
  return { deleted: archivedAppointments.length };
}

function isClinikoAppointmentWriteBackEdit(body, appointment) {
  if (!appointment.clinikoId) return false;
  return ["startsAt", "endsAt", "appointmentType", "recurrence"].some((key) =>
    Object.hasOwn(body, key) && body[key] !== appointment[key]
  );
}

function createReferral(db, body) {
  const now = new Date().toISOString();
  const clientId = `client-${randomUUID()}`;
  const clientName = body.clientName || body.name || "New client";
  const reasonForReferral = body.reasonForReferral || body.goals || body.notes || "";
  const caseManagerSelection = resolveCaseManagerSelection(db, body);
  const client = {
    id: clientId,
    clinikoPatientId: "",
    name: clientName,
    dob: body.dob || "",
    address: body.address || "",
    suburb: body.suburb || "",
    phone: body.phone || "",
    email: body.email || "",
    fundingType: body.fundingType || "",
    emergencyContact: body.emergencyContact || "",
    risks: body.risks || "",
    diagnosis: body.diagnosis || "",
    goals: reasonForReferral,
    caseManagerId: caseManagerSelection.caseManagerId
  };

  const referral = {
    id: `ref-${randomUUID()}`,
    clientId,
    clientName,
    dob: client.dob,
    address: client.address,
    phone: client.phone,
    email: client.email,
    fundingType: client.fundingType,
    referralSource: body.referralSource || "",
    caseManagerId: caseManagerSelection.caseManagerId,
    caseManager: caseManagerSelection.caseManager,
    caseManagerDetails: caseManagerSelection.caseManagerDetails,
    diagnosis: client.diagnosis,
    reasonForReferral,
    goals: reasonForReferral,
    urgency: body.urgency || "Medium",
    notes: body.notes || "",
    risks: client.risks,
    preferredTherapist: body.preferredTherapist || "",
    suburb: client.suburb,
    serviceTypeRequired: body.serviceTypeRequired || "Physiotherapy",
    status: body.assignedContractorId ? "assigned" : "new",
    assignedContractorId: body.assignedContractorId || "",
    createdAt: now,
    updatedAt: now
  };

  db.clients.push(client);
  db.referrals.push(referral);

  if (referral.assignedContractorId) {
    db.notifications.push(notification(referral.assignedContractorId, "new_referral_assigned", `${referral.clientName} has been assigned to you.`));
  }

  logActivity(db, body.actorId || "admin-jenni", "created_referral", "referral", referral.id);
  return { client, referral };
}

function updateClientFromReferralPatch(db, referral, body, reasonForReferral) {
  const client = db.clients.find((item) => item.id === referral.clientId);
  if (!client) return;

  const fieldMap = {
    clientName: "name",
    dob: "dob",
    address: "address",
    phone: "phone",
    email: "email",
    fundingType: "fundingType",
    diagnosis: "diagnosis",
    risks: "risks",
    suburb: "suburb"
  };

  for (const [bodyKey, clientKey] of Object.entries(fieldMap)) {
    if (Object.hasOwn(body, bodyKey)) client[clientKey] = body[bodyKey];
  }

  if (Object.hasOwn(body, "caseManagerId") || Object.hasOwn(body, "caseManager")) {
    client.caseManagerId = referral.caseManagerId || "";
  }

  if (reasonForReferral !== undefined) client.goals = reasonForReferral;
}

async function createAppointment(db, body) {
  const actor = db.users.find((user) => user.id === body.actorId) || null;
  const client = db.clients.find((item) => item.id === body.clientId);
  const contractor = db.users.find((user) => user.id === body.contractorId);

  if (!client) return { status: 404, error: "Client not found" };
  if (!contractor || contractor.role !== "contractor") return { status: 400, error: "Contractor not found" };
  if (!body.startsAt) return { status: 400, error: "Start time is required" };
  if (actor?.role === "contractor" && !contractorCanAccessClient(db, actor.id, client.id)) {
    return { status: 403, error: "Contractors can only rebook assigned clients" };
  }

  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { status: 400, error: "Start time is invalid" };

  const durationMinutes = Number(body.durationMinutes || 60);
  const endsAt = body.endsAt
    ? new Date(body.endsAt)
    : new Date(startsAt.getTime() + Math.max(durationMinutes, 15) * 60 * 1000);
  if (Number.isNaN(endsAt.getTime())) return { status: 400, error: "End time is invalid" };
  const now = new Date().toISOString();

  const appointment = {
    id: `appt-${randomUUID()}`,
    clinikoId: "",
    clinikoStatus: getClinikoConfig().connected ? "pending_push" : "not_connected",
    clientId: client.id,
    contractorId: contractor.id,
    serviceType: body.serviceType || contractor.discipline,
    appointmentType: body.appointmentType || body.recurrence || "",
    contactNumber: body.contactNumber || client.phone || "",
    reasonForReferral: body.reasonForReferral || body.rebookReason || "",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    address: body.address || client.address || "",
    status: body.status || "booked",
    travelWindow: body.travelWindow || "",
    notesComplete: false,
    reportDue: false,
    recurrence: body.recurrence || "Rebooked visit",
    rebookedFromAppointmentId: body.rebookedFromAppointmentId || "",
    rebookReason: body.rebookReason || "",
    approvalRequired: false,
    approvalStatus: "",
    approvalRequestId: "",
    createdBy: body.actorId || contractor.id,
    createdAt: now
  };

  db.appointments.push(appointment);

  const referral = db.referrals.find((item) => item.clientId === client.id);
  if (referral && ["new", "contacted", "assigned"].includes(referral.status)) {
    referral.status = "booked";
    referral.updatedAt = new Date().toISOString();
  }

  const actorName = actor?.name || contractor.name;
  db.notifications.push(notification("admin-jenni", "appointment_rebooked", `${actorName} rebooked ${client.name} for ${formatForNotification(appointment.startsAt)}.`));
  if (actor?.id !== contractor.id) {
    db.notifications.push(notification(contractor.id, "appointment_rebooked", `${client.name} has been rebooked for ${formatForNotification(appointment.startsAt)}.`));
  }
  logActivity(db, body.actorId || contractor.id, "rebooked_appointment", "appointment", appointment.id);
  const clinikoCreate = await createClinikoAppointmentFromApp(db, appointment);
  if (clinikoCreate.status === "synced") {
    logActivity(db, body.actorId || contractor.id, "created_cliniko_appointment", "appointment", appointment.id);
  }

  return { appointment };
}

async function createReceptionBooking(db, body) {
  const contractor = db.users.find((user) => user.id === body.contractorId);
  if (!contractor || contractor.role !== "contractor") return { status: 400, error: "Practitioner is required" };
  if (!body.fullName) return { status: 400, error: "Full name is required" };
  if (!body.address) return { status: 400, error: "Address is required" };
  if (!body.contactNumber) return { status: 400, error: "Contact number is required" };
  if (!body.appointmentType) return { status: 400, error: "Appointment type is required" };
  if (!body.startsAt) return { status: 400, error: "Appointment time is required" };

  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { status: 400, error: "Appointment time is invalid" };

  const durationMinutes = Number(body.durationMinutes || 60);
  const endsAt = new Date(startsAt.getTime() + Math.max(durationMinutes, 15) * 60 * 1000);
  const now = new Date().toISOString();
  const clientId = `client-${randomUUID()}`;
  const serviceType = body.serviceType || contractor.discipline || serviceForAppointmentType(body.appointmentType);

  const client = {
    id: clientId,
    clinikoPatientId: "",
    name: body.fullName,
    dob: "",
    address: body.address,
    suburb: body.suburb || "",
    phone: body.contactNumber,
    email: body.email || "",
    fundingType: body.fundingType || "",
    emergencyContact: "",
    risks: body.risks || "",
    diagnosis: "",
    goals: body.reasonForReferral || ""
  };

  const referral = {
    id: `ref-${randomUUID()}`,
    clientId,
    clientName: body.fullName,
    dob: "",
    address: body.address,
    phone: body.contactNumber,
    email: body.email || "",
    fundingType: body.fundingType || "",
    referralSource: "Reception booking",
    caseManager: body.caseManager || "",
    diagnosis: "",
    goals: body.reasonForReferral || "",
    urgency: body.urgency || "Medium",
    notes: body.reasonForReferral || "",
    risks: body.risks || "",
    preferredTherapist: contractor.name,
    suburb: body.suburb || "",
    serviceTypeRequired: serviceType,
    status: "booked",
    assignedContractorId: contractor.id,
    createdAt: now,
    updatedAt: now
  };

  const appointment = {
    id: `appt-${randomUUID()}`,
    clinikoId: "",
    clinikoStatus: getClinikoConfig().connected ? "pending_push" : "not_connected",
    clientId,
    contractorId: contractor.id,
    serviceType,
    appointmentType: body.appointmentType,
    contactNumber: body.contactNumber,
    reasonForReferral: body.reasonForReferral || "",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    address: body.address,
    status: "booked",
    travelWindow: "",
    notesComplete: false,
    reportDue: false,
    recurrence: body.appointmentType,
    rebookedFromAppointmentId: "",
    rebookReason: "",
    createdBy: body.actorId || "admin-jenni",
    createdAt: now
  };

  db.clients.push(client);
  db.referrals.push(referral);
  db.appointments.push(appointment);
  db.notifications.push(notification(contractor.id, "new_patient_booked", `${body.fullName} has been booked for ${body.appointmentType}.`));
  logActivity(db, body.actorId || "admin-jenni", "created_reception_booking", "appointment", appointment.id);
  const clinikoCreate = await createClinikoAppointmentFromApp(db, appointment);
  if (clinikoCreate.status === "synced") {
    logActivity(db, body.actorId || "admin-jenni", "created_cliniko_appointment", "appointment", appointment.id);
  }

  return { client, referral, appointment };
}

function contractorCanAccessClient(db, contractorId, clientId) {
  return db.referrals.some((referral) => referral.clientId === clientId && referral.assignedContractorId === contractorId)
    || db.appointments.some((appointment) => appointment.clientId === clientId && appointment.contractorId === contractorId);
}

function serviceForAppointmentType(appointmentType) {
  return "Physiotherapy";
}

function appointmentHasSignedNote(db, appointmentId) {
  return db.treatmentNotes.some((note) => note.appointmentId === appointmentId && note.status === "signed");
}

async function upsertTreatmentNote(db, body) {
  const now = new Date().toISOString();
  let note = body.id ? db.treatmentNotes.find((item) => item.id === body.id) : null;
  const appointment = db.appointments.find((item) => item.id === body.appointmentId);

  if (!note) {
    note = {
      id: `note-${randomUUID()}`,
      appointmentId: body.appointmentId,
      clientId: body.clientId || appointment?.clientId || "",
      contractorId: body.contractorId || appointment?.contractorId || "",
      discipline: body.discipline || appointment?.serviceType || "Physiotherapy",
      status: body.status || "draft",
      signature: body.signature || "",
      fields: body.fields || {},
      createdAt: now,
      updatedAt: now
    };
    db.treatmentNotes.push(note);
  } else {
    Object.assign(note, {
      status: body.status || note.status,
      signature: body.signature ?? note.signature,
      fields: body.fields || note.fields,
      updatedAt: now
    });
  }

  if (appointment && note.status === "signed") {
    appointment.notesComplete = true;
    if (appointment.status !== "cancelled") appointment.status = "completed";

    const report = upsertReportFromSignedNote(db, note, appointment);
    if (report) {
      sendReportCopyToAdmin(db, report, {
        appointment,
        actorId: note.contractorId,
        trigger: "signed_note"
      });
    }

    if (getClinikoConfig().noteUploadAutoEnabled) {
      await uploadCompletedTreatmentNoteToCliniko(db, note.id, note.contractorId);
    }
  }

  logActivity(db, note.contractorId, note.status === "signed" ? "signed_treatment_note" : "saved_treatment_note", "treatmentNote", note.id);
  return note;
}

async function uploadCompletedTreatmentNoteToCliniko(db, noteId, actorId = "admin-jenni") {
  const note = db.treatmentNotes.find((item) => item.id === noteId);
  if (!note) return { status: 404, error: "Treatment note not found" };
  if (note.status !== "signed") return { status: 400, error: "Treatment note must be signed before upload" };

  const filename = treatmentNoteDownloadFilename(db, note);
  const pdfBuffer = renderTreatmentNotePdfBuffer(db, note);
  const result = await uploadTreatmentNotePdfToCliniko(db, note, pdfBuffer, filename);
  note.updatedAt = new Date().toISOString();

  if (result.status === "synced") {
    logActivity(db, actorId, result.duplicate ? "prevented_duplicate_cliniko_note_upload" : "uploaded_note_to_cliniko", "treatmentNote", note.id);
  } else if (result.status === "not_enabled") {
    logActivity(db, actorId, "skipped_cliniko_note_upload_disabled", "treatmentNote", note.id);
  }

  return { note, upload: result };
}

async function upsertReport(db, body) {
  const now = new Date().toISOString();
  let report = body.id ? db.reports.find((item) => item.id === body.id) : null;
  const appointment = body.appointmentId
    ? db.appointments.find((item) => item.id === body.appointmentId)
    : null;
  const reportType = body.type || report?.type || "Initial Physiotherapy Assessment Report";
  const reportFields = normalizeReportFields(body.fields !== undefined ? body.fields : report?.fields || {}, reportType);

  if (!report) {
    report = {
      id: `report-${randomUUID()}`,
      type: reportType,
      appointmentId: body.appointmentId || "",
      clientId: body.clientId || "",
      contractorId: body.contractorId || "",
      status: body.status || "draft",
      summary: body.summary || "",
      signature: body.signature || "",
      signedAt: "",
      signedBy: "",
      fields: reportFields,
      createdAt: now,
      updatedAt: now
    };
    db.reports.push(report);
  } else {
    Object.assign(report, {
      type: reportType,
      appointmentId: body.appointmentId || report.appointmentId || "",
      clientId: body.clientId || report.clientId,
      contractorId: body.contractorId || report.contractorId,
      status: body.status || report.status,
      summary: body.summary ?? report.summary,
      signature: body.signature ?? report.signature ?? "",
      fields: reportFields,
      updatedAt: now
    });
  }

  const completedStatus = ["ready_for_admin", "final"].includes(report.status);
  if (completedStatus && isAdminCopyReportType(report.type)) {
    report.signedAt = report.signedAt || now;
    report.signedBy = report.signedBy || body.actorId || report.contractorId || "";
    if (!report.signature) {
      report.signature = db.users.find((user) => user.id === report.signedBy)?.name || "";
    }
  }

  if (appointment && report.status === "final") {
    appointment.reportDue = false;
  }

  const actor = db.users.find((user) => user.id === body.actorId);
  const submittedForAdminReview = body.submittedForAdminReview === true || body.submittedForAdminReview === "true";
  if (completedStatus && (actor?.role !== "admin" || submittedForAdminReview)) {
    sendReportCopyToAdmin(db, report, {
      appointment,
      actorId: body.actorId || report.contractorId,
      trigger: "report_submission"
    });
  }

  if (completedStatus && (actor?.role !== "admin" || submittedForAdminReview) && getClinikoConfig().reportUploadAutoEnabled) {
    await uploadCompletedReportToCliniko(db, report.id, body.actorId || report.contractorId);
  }

  logActivity(db, report.contractorId || "admin-jenni", "saved_report", "report", report.id);
  return report;
}

async function uploadCompletedReportToCliniko(db, reportId, actorId = "admin-jenni") {
  const report = db.reports.find((item) => item.id === reportId);
  if (!report) return { status: 404, error: "Report not found" };
  if (!isAdminCopyReportType(report.type)) return { status: 400, error: "Only initial and equipment trial reports can upload to Cliniko" };
  if (!["ready_for_admin", "final"].includes(report.status)) return { status: 400, error: "Report must be signed before upload" };

  const filename = reportDownloadFilename(db, report);
  const pdfBuffer = renderReportPdfBuffer(db, report);
  const result = await uploadReportPdfToCliniko(db, report, pdfBuffer, filename);
  report.updatedAt = new Date().toISOString();

  if (result.status === "synced") {
    logActivity(db, actorId, result.duplicate ? "prevented_duplicate_cliniko_report_upload" : "uploaded_report_to_cliniko", "report", report.id);
  } else if (result.status === "not_enabled") {
    logActivity(db, actorId, "skipped_cliniko_report_upload_disabled", "report", report.id);
  }

  return { report, upload: result };
}

function markReportSentToCaseManager(db, reportId, body) {
  const report = db.reports.find((item) => item.id === reportId);
  if (!report) return { status: 404, error: "Report not found" };
  if (!isAdminCopyReportType(report.type)) return { status: 400, error: "Only initial and equipment trial reports can be sent to a case manager" };
  if (!["ready_for_admin", "final"].includes(report.status)) return { status: 400, error: "Report is not completed yet" };

  const now = new Date().toISOString();
  const markSent = typeof body.sent === "boolean" ? body.sent : !report.caseManagerSentAt;
  if (markSent) {
    report.caseManagerSentAt = report.caseManagerSentAt || now;
    report.caseManagerSentBy = body.actorId || "admin-jenni";
    report.caseManagerStatus = "sent";
    resolveInboxItem(db, inboxId("report", report.id));
  } else {
    report.caseManagerSentAt = "";
    report.caseManagerSentBy = "";
    report.caseManagerStatus = "";
    const client = db.clients.find((item) => item.id === report.clientId);
    const contractor = db.users.find((item) => item.id === report.contractorId);
    const item = reportInboxItem(report, client, contractor, now);
    item.status = "new";
    item.updatedAt = now;
    const restored = ensureInboxItem(db, item);
    if (restored.status !== "closed") restored.status = "new";
  }
  report.updatedAt = now;

  if (markSent) {
    const client = db.clients.find((item) => item.id === report.clientId);
    db.notifications.push(notification(
      report.contractorId,
      "case_manager_report_sent",
      `${report.type} for ${client?.name || "a client"} was marked sent to the case manager.`
    ));
  }
  logActivity(db, body.actorId || "admin-jenni", markSent ? "sent_report_to_case_manager" : "unmarked_report_sent_to_case_manager", "report", report.id);

  return { report };
}

async function retrySyncError(db, errorId, actorId) {
  const syncError = db.syncErrors.find((item) => item.id === errorId);
  if (!syncError) return { status: 404, error: "Sync error not found" };
  if (syncError.resolvedAt) return { retried: false, message: "Sync error is already resolved." };

  if (syncError.operation === "report_upload" && syncError.entityType === "report") {
    const result = await uploadCompletedReportToCliniko(db, syncError.entityId, actorId);
    if (result.upload?.status === "synced") {
      syncError.resolvedAt = new Date().toISOString();
      syncError.resolvedBy = actorId;
    }
    logActivity(db, actorId, "retried_report_upload_error", "report", syncError.entityId);
    return { retried: true, syncError, result };
  }

  if (syncError.operation !== "read_sync") {
    return {
      status: 400,
      error: "Retry is only available for Cliniko read sync and report upload errors."
    };
  }

  const result = await syncCliniko(db);
  db.clinikoSync = result.sync;
  if (result.sync.status === "connected") {
    syncError.resolvedAt = new Date().toISOString();
    syncError.resolvedBy = actorId;
  }
  logActivity(db, actorId, "retried_read_sync_error", syncError.entityType, syncError.entityId);
  return { retried: true, syncError, result };
}

function upsertReportFromSignedNote(db, note, appointment) {
  const type = reportTypeForAppointment(appointment);
  if (!type) return null;

  const now = new Date().toISOString();
  let report = db.reports.find((item) => item.appointmentId === appointment.id)
    || db.reports.find((item) =>
      !item.appointmentId
      && type
      && item.clientId === note.clientId
      && item.contractorId === note.contractorId
      && item.type === type
    );
  const summary = `${type} signed from practitioner notes.`;
  const noteFields = note.fields || {};

  if (!report) {
    report = {
      id: `report-${randomUUID()}`,
      type,
      appointmentId: appointment.id,
      clientId: note.clientId || appointment.clientId || "",
      contractorId: note.contractorId || appointment.contractorId || "",
      status: "ready_for_admin",
      summary,
      fields: noteFields,
      createdAt: now,
      updatedAt: now
    };
    db.reports.push(report);
    return report;
  }

  Object.assign(report, {
    type,
    appointmentId: appointment.id,
    clientId: report.clientId || note.clientId || appointment.clientId || "",
    contractorId: report.contractorId || note.contractorId || appointment.contractorId || "",
    status: report.status === "final" ? "final" : "ready_for_admin",
    summary: report.summary || summary,
    fields: { ...(report.fields || {}), ...noteFields },
    updatedAt: now
  });

  return report;
}

function sendReportCopyToAdmin(db, report, options = {}) {
  if (!isAdminCopyReportType(report.type) || report.adminCopySentAt) return false;

  const now = new Date().toISOString();
  const actorId = options.actorId || report.contractorId || "admin-jenni";
  const contractor = db.users.find((user) => user.id === report.contractorId);
  const client = db.clients.find((item) => item.id === report.clientId);

  report.adminCopySentAt = now;
  report.adminCopySentBy = actorId;
  report.adminCopyTrigger = options.trigger || "report_submission";

  const message = `${contractor?.name || "Practitioner"} sent ${report.type} for ${client?.name || "a client"} to admin for review.`;
  for (const user of db.users || []) {
    if (user.isActive === false || !["admin", "receptionist"].includes(user.role)) continue;
    db.notifications.push(notification(user.id, "report_copy", message));
  }
  ensureInboxItem(db, reportInboxItem(report, client, contractor, now));
  logActivity(db, actorId, "sent_report_copy_to_admin", "report", report.id);
  return true;
}

function isAdminCopyReportType(type) {
  return ["Initial Physiotherapy Assessment Report", "Equipment Trial Report"].includes(type);
}

function isInitialPhysioReportType(type) {
  return String(type || "").toLowerCase().includes("initial physiotherapy");
}

function normalizeReportFields(fields = {}, reportType = "") {
  const normalized = { ...(fields || {}) };
  if (isInitialPhysioReportType(reportType)) {
    normalized.photoAttachments = normalizeReportPhotoAttachments(normalized.photoAttachments);
  } else {
    delete normalized.photoAttachments;
  }
  return normalized;
}

function normalizeReportPhotoAttachments(value) {
  let parsed = [];

  if (Array.isArray(value)) {
    parsed = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }

  return parsed
    .filter((photo) => photo && typeof photo === "object" && /^data:image\/jpe?g;base64,/i.test(String(photo.dataUrl || "")))
    .slice(0, 8)
    .map((photo, index) => ({
      id: String(photo.id || `photo-${index + 1}`).slice(0, 80),
      order: index + 1,
      name: String(photo.name || `Photo ${index + 1}`).slice(0, 80),
      mimeType: "image/jpeg",
      width: clampNumber(photo.width, 1, 5000, 1200),
      height: clampNumber(photo.height, 1, 5000, 900),
      dataUrl: String(photo.dataUrl || "").slice(0, 2200000),
      note: String(photo.note || "").slice(0, 600),
      addedAt: String(photo.addedAt || "").slice(0, 40)
    }))
    .filter((photo) => photo.dataUrl.length < 2200000);
}

function reportPhotoAttachmentsFromFields(fields = {}) {
  return normalizeReportPhotoAttachments(fields.photoAttachments);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function reportTypeForAppointment(appointment) {
  if (!appointment) return "";
  if (isEquipmentTrialReportAppointment(appointment)) return "Equipment Trial Report";
  if (isInitialPhysioReportAppointment(appointment)) return "Initial Physiotherapy Assessment Report";
  return "";
}

function isInitialPhysioReportAppointment(appointment) {
  return appointmentMatchesPhysioFundingType(appointment, "initial");
}

function isEquipmentTrialReportAppointment(appointment) {
  return appointmentBookingText(appointment).includes("equipment");
}

function appointmentMatchesPhysioFundingType(appointment, visitStage) {
  const bookingType = appointmentBookingText(appointment);
  const isPhysio = appointment.serviceType === "Physiotherapy" || bookingType.includes("physio");
  return isPhysio
    && bookingType.includes(visitStage)
    && (bookingType.includes("sah") || bookingType.includes("chsp"));
}

function appointmentBookingText(appointment) {
  return `${appointment?.appointmentType || ""} ${appointment?.recurrence || ""}`.toLowerCase();
}

function createReportReminder(db, body) {
  const appointment = db.appointments.find((item) => item.id === body.appointmentId);
  if (!appointment) return { status: 404, error: "Appointment not found" };

  const contractor = db.users.find((user) => user.id === (body.contractorId || appointment.contractorId));
  if (!contractor) return { status: 404, error: "Practitioner not found" };

  const client = db.clients.find((item) => item.id === (body.clientId || appointment.clientId));
  const message = String(body.message || "").trim();
  if (!message) return { status: 400, error: "Message is required" };

  const now = new Date().toISOString();
  const reminder = {
    id: `report-reminder-${randomUUID()}`,
    appointmentId: appointment.id,
    clientId: client?.id || appointment.clientId,
    contractorId: contractor.id,
    actorId: body.actorId || "admin-jenni",
    message,
    createdAt: now
  };

  db.reportReminders.push(reminder);
  db.notifications.push(notification(contractor.id, "report_reminder", message));
  logActivity(db, reminder.actorId, "sent_report_reminder", "appointment", appointment.id);

  return { reminder };
}

function createMessage(db, body) {
  const from = db.users.find((user) => user.id === body.fromUserId);
  const to = db.users.find((user) => user.id === body.toUserId);
  const messageBody = String(body.body || "").trim();

  if (!from) return { status: 404, error: "Sender not found" };
  if (!to) return { status: 404, error: "Recipient not found" };
  if (!messageBody) return { status: 400, error: "Message is required" };
  if (from.role === "contractor" && to.role !== "admin") {
    return { status: 403, error: "Practitioners can only message admin." };
  }

  const message = {
    id: `msg-${randomUUID()}`,
    fromUserId: from.id,
    toUserId: to.id,
    body: messageBody,
    readBy: [from.id],
    createdAt: new Date().toISOString()
  };

  db.messages.push(message);
  db.notifications.push(notification(to.id, "direct_message", `${from.name}: ${messageBody}`));
  logActivity(db, from.id, "sent_message", "message", message.id);

  return { message };
}

function markMessagesRead(db, user, body = {}) {
  const fromUserId = String(body.fromUserId || body.threadUserId || "").trim();
  let updated = 0;

  for (const message of db.messages || []) {
    if (message.toUserId !== user.id) continue;
    if (fromUserId && message.fromUserId !== fromUserId) continue;
    message.readBy ||= [];
    if (message.readBy.includes(user.id)) continue;
    message.readBy.push(user.id);
    updated += 1;
  }

  if (updated) logActivity(db, user.id, "read_messages", "messageThread", fromUserId || "all");
  return { updated };
}

async function createRunningLateAlert(db, appointmentId, body, actor) {
  const appointment = db.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return { status: 404, error: "Appointment not found" };
  if (actor.role === "contractor" && appointment.contractorId !== actor.id) {
    return { status: 403, error: "You can only send late notices for your own appointments." };
  }

  const minutesLate = Number(body.minutesLate);
  if (!Number.isFinite(minutesLate) || minutesLate < 1 || minutesLate > 240) {
    return { status: 400, error: "Choose how many minutes late." };
  }

  const client = db.clients.find((item) => item.id === appointment.clientId) || {};
  const contractor = db.users.find((user) => user.id === appointment.contractorId) || {};
  const now = new Date().toISOString();
  const message = `${contractor.name || "A practitioner"} is running ${minutesLate} minutes late for ${client.name || "a patient"} on ${formatForNotification(appointment.startsAt)}. Please let reception/admin know.`;
  const alert = {
    id: `late-${randomUUID()}`,
    appointmentId: appointment.id,
    clientId: appointment.clientId,
    contractorId: appointment.contractorId,
    actorId: actor.id,
    minutesLate,
    status: "new",
    message,
    createdAt: now,
    updatedAt: now
  };

  db.runningLateAlerts.push(alert);
  appointment.runningLateMinutes = minutesLate;
  appointment.runningLateNotifiedAt = now;

  ensureInboxItem(db, runningLateInboxItem(alert, client, contractor, now));
  for (const user of db.users || []) {
    if (user.isActive === false || !["admin", "receptionist"].includes(user.role)) continue;
    db.notifications.push(notification(user.id, "running_late", message));
  }
  logActivity(db, actor.id, "sent_running_late_notice", "appointment", appointment.id);

  return { alert };
}

function isAdminMessageParticipant(db, message) {
  const from = db.users.find((user) => user.id === message.fromUserId);
  const to = db.users.find((user) => user.id === message.toUserId);
  return from?.role === "admin" || to?.role === "admin";
}

function notification(userId, type, message) {
  return {
    id: `notif-${randomUUID()}`,
    userId,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
}

function operationsUsers(db) {
  return (db.users || []).filter((user) =>
    user.isActive !== false && ["admin", "receptionist"].includes(user.role)
  );
}

function notifyOperationsUsers(db, type, message) {
  for (const user of operationsUsers(db)) {
    const alreadyUnread = (db.notifications || []).some((item) =>
      item.userId === user.id && item.type === type && item.message === message && !item.read
    );
    if (alreadyUnread) continue;
    db.notifications.push(notification(user.id, type, message));
  }
}

function approvalRequestAdminMessage(db, request) {
  const client = db.clients.find((item) => item.id === request.clientId);
  const contractor = db.users.find((item) => item.id === request.contractorId);
  const requestType = request.type || "Approvals needed";
  const approvalNeedType = request.approvalNeedType || requestType;
  return requestType === "Approvals needed"
    ? `${contractor?.name || "A practitioner"} needs case-manager approval for ${client?.name || "a client"}: ${approvalNeedType}.`
    : `${contractor?.name || "A practitioner"} submitted ${requestType}.`;
}

function markNotificationsRead(db, body) {
  const userId = body.userId || "";
  if (!db.users.some((user) => user.id === userId)) {
    return { status: 404, error: "User not found" };
  }

  const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
  const types = Array.isArray(body.types) ? new Set(body.types) : null;
  if (!ids?.size && !types?.size) {
    return { status: 400, error: "Notification ids or types are required" };
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const item of db.notifications || []) {
    if (item.userId !== userId || item.read) continue;
    if (ids?.size && !ids.has(item.id)) continue;
    if (types?.size && !types.has(item.type)) continue;

    item.read = true;
    item.readAt = now;
    updated += 1;
  }

  return { updated };
}

function syncInboxItems(db) {
  const now = new Date().toISOString();

  for (const request of (db.approvalRequests || []).filter(isCaseManagerApprovalRequest)) {
    const resolved = ["approved", "declined"].includes(request.status);
    const client = db.clients.find((item) => item.id === request.clientId);
    const contractor = db.users.find((item) => item.id === request.contractorId);
    ensureInboxItem(db, {
      id: inboxId("approval", request.id),
      sourceType: "approval_request",
      sourceId: request.id,
      clientId: request.clientId,
      contractorId: request.contractorId,
      title: `Approval needed: ${request.approvalNeedType || request.type}`,
      message: request.details || `${contractor?.name || "A practitioner"} needs admin to ask the case manager for approval for ${client?.name || "a client"}.`,
      priority: String(request.approvalNeedType || "").toLowerCase().includes("equipment") ? "high" : "normal",
      status: resolved ? "resolved" : request.status === "waiting" ? "waiting" : "new",
      createdAt: request.createdAt || now,
      updatedAt: request.updatedAt || request.createdAt || now
    });
  }

  for (const rebookStatus of db.rebookStatuses || []) {
    const client = db.clients.find((item) => item.id === rebookStatus.clientId);
    const contractor = db.users.find((item) => item.id === rebookStatus.contractorId);
    ensureInboxItem(db, {
      id: inboxId("rebook", rebookStatus.id),
      sourceType: "rebook_status",
      sourceId: rebookStatus.id,
      clientId: rebookStatus.clientId,
      contractorId: rebookStatus.contractorId,
      title: `Rebook decision: ${client?.name || "Client"}`,
      message: rebookStatus.reason || `${contractor?.name || "A practitioner"} says this patient does not need a rebooking.`,
      priority: "normal",
      status: rebookStatus.status === "resolved" ? "resolved" : "new",
      createdAt: rebookStatus.createdAt || now,
      updatedAt: rebookStatus.updatedAt || rebookStatus.createdAt || now
    });
  }

  for (const referral of db.referrals || []) {
    if (!["new", "contacted"].includes(referral.status)) {
      resolveInboxItem(db, inboxId("referral", referral.id));
      continue;
    }

    ensureInboxItem(db, {
      id: inboxId("referral", referral.id),
      sourceType: "referral",
      sourceId: referral.id,
      clientId: referral.clientId,
      contractorId: referral.assignedContractorId || "",
      title: `New referral: ${referral.clientName}`,
      message: referral.notes || referral.goals || "New referral needs triage and assignment.",
      priority: ["High", "Urgent"].includes(referral.urgency) ? "high" : "normal",
      status: "new",
      createdAt: referral.createdAt || now,
      updatedAt: referral.updatedAt || referral.createdAt || now
    });
  }

  for (const report of db.reports || []) {
    if (!isAdminCopyReportType(report.type) || !["ready_for_admin", "final"].includes(report.status)) continue;
    const client = db.clients.find((item) => item.id === report.clientId);
    const contractor = db.users.find((item) => item.id === report.contractorId);
    ensureInboxItem(db, reportInboxItem(report, client, contractor, report.adminCopySentAt || report.signedAt || report.updatedAt || now));
  }

  for (const alert of db.runningLateAlerts || []) {
    const client = db.clients.find((item) => item.id === alert.clientId);
    const contractor = db.users.find((item) => item.id === alert.contractorId);
    ensureInboxItem(db, runningLateInboxItem(alert, client, contractor, alert.createdAt || now));
  }
}

function reportInboxItem(report, client, contractor, now = new Date().toISOString()) {
  return {
    id: inboxId("report", report.id),
    sourceType: "report_copy",
    sourceId: report.id,
    clientId: report.clientId,
    contractorId: report.contractorId,
    title: `Report for review: ${report.type}`,
    message: `${contractor?.name || "A practitioner"} signed off ${report.type} for ${client?.name || "a client"}. Admin review is needed.`,
    priority: "high",
    status: "new",
    createdAt: report.adminCopySentAt || report.updatedAt || report.createdAt || now,
    updatedAt: report.adminCopySentAt || report.updatedAt || report.createdAt || now
  };
}

function runningLateInboxItem(alert, client, contractor, now = new Date().toISOString()) {
  return {
    id: inboxId("late", alert.id),
    sourceType: "running_late",
    sourceId: alert.id,
    clientId: alert.clientId,
    contractorId: alert.contractorId,
    title: `Running late: ${client?.name || "Patient"}`,
    message: alert.message || `${contractor?.name || "A practitioner"} is running ${alert.minutesLate || ""} minutes late.`,
    priority: Number(alert.minutesLate || 0) >= 20 ? "high" : "normal",
    status: alert.status === "resolved" ? "resolved" : "new",
    createdAt: alert.createdAt || now,
    updatedAt: alert.updatedAt || alert.createdAt || now
  };
}

function isCaseManagerApprovalRequest(request) {
  const approvalNeed = String(request.approvalNeedType || "").toLowerCase();
  return request.source !== "rebook_slot"
    && request.type !== "Rebook slot approval"
    && !approvalNeed.includes("confirm rebooked appointment slot");
}

function ensureInboxItem(db, next) {
  const existing = db.inboxItems.find((item) => item.id === next.id);
  if (!existing) {
    db.inboxItems.push(next);
    return next;
  }

  Object.assign(existing, {
    sourceType: next.sourceType,
    sourceId: next.sourceId,
    clientId: next.clientId,
    contractorId: next.contractorId,
    title: next.title,
    message: next.message,
    priority: next.priority,
    updatedAt: next.updatedAt
  });

  if (next.status === "resolved" && existing.status !== "closed") {
    existing.status = "resolved";
  } else if (existing.status === "new" && next.status === "waiting") {
    existing.status = "waiting";
  } else if (!existing.status) {
    existing.status = next.status;
  }

  existing.createdAt ||= next.createdAt;
  return existing;
}

function resolveInboxItem(db, id) {
  const existing = db.inboxItems.find((item) => item.id === id);
  if (existing && !["resolved", "closed"].includes(existing.status)) {
    existing.status = "resolved";
    existing.updatedAt = new Date().toISOString();
  }
}

function inboxId(type, sourceId) {
  return `inbox-${type}-${sourceId}`;
}

function logActivity(db, actorId, action, entityType, entityId) {
  db.activityLog.push({
    id: `log-${randomUUID()}`,
    actorId,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString()
  });
}

function contractorName(db, id) {
  return db.users.find((user) => user.id === id)?.name || "A contractor";
}

function formatForNotification(value) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function approvalStatusLabel(status) {
  return {
    pending: "currently waiting for approval",
    waiting: "currently waiting for approval",
    approved: "approved",
    declined: "declined"
  }[status] || status || "updated";
}

function pick(source, keys) {
  return keys.reduce((result, key) => {
    if (Object.hasOwn(source, key)) result[key] = source[key];
    return result;
  }, {});
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res, url) {
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(publicDir, relativePath);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) throw new Error("Not a file");
    const contents = await readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": contentType(filePath),
      "Cache-Control": path.basename(filePath) === "service-worker.js" ? "no-store" : "no-cache"
    });
    res.end(contents);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function renderReportHtml(db, report, options = {}) {
  const client = db.clients.find((item) => item.id === report.clientId) || {};
  const contractor = db.users.find((item) => item.id === report.contractorId) || {};
  const visibleFields = options.hideCaseManagerDetails ? stripCaseManagerFields(report.fields || {}) : report.fields || {};
  const fields = Object.entries(visibleFields).filter(([key]) => key !== "photoAttachments");
  const photos = reportPhotoAttachmentsFromFields(report.fields || {});

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.type)}</title>
  <style>
    body { color: #17211f; font: 15px/1.55 Arial, sans-serif; margin: 0; }
    main { margin: 0 auto; max-width: 820px; padding: 42px; }
    header { border-bottom: 3px solid #1e7664; margin-bottom: 28px; padding-bottom: 18px; }
    .report-brand { align-items: baseline; display: flex; flex-wrap: wrap; font-size: 28px; font-weight: 700; gap: 8px; margin-bottom: 18px; }
    .report-brand span:first-child { color: #11162c; }
    .report-brand span:last-child { color: #08aeea; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    h2 { border-bottom: 1px solid #d7e3df; color: #1e7664; font-size: 18px; margin-top: 28px; padding-bottom: 6px; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 8px 18px; }
    dt { color: #5b6a66; font-weight: 700; }
    dd { margin: 0; }
    .photo-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .photo-grid figure { border: 1px solid #d7e3df; margin: 0; padding: 10px; }
    .photo-grid img { display: block; max-width: 100%; }
    .photo-grid figcaption { color: #5b6a66; font-size: 13px; margin-top: 8px; }
    .photo-grid figure p { color: #17211f; font-size: 14px; margin: 8px 0 0; white-space: pre-wrap; }
    .report-closing { font-weight: 700; margin: 32px 0 0; }
    .signature { display: grid; gap: 3px; margin-top: 10px; }
    .signature img { display: block; height: auto; max-height: 70px; max-width: 210px; object-fit: contain; }
    .signature p { margin: 0; }
    @media print { main { padding: 0; } button { display: none; } }
  </style>
</head>
<body>
  <main>
    <button onclick="window.print()">Print / Save PDF</button>
    <header>
      <div class="report-brand" aria-label="Refine Physio Mobile"><span>Refine Physio</span><span>Mobile</span></div>
      <h1>${escapeHtml(report.type)}</h1>
      <div>Refine Physio Mobile</div>
    </header>
    <h2>Participant Details</h2>
    <dl>
      <dt>Name</dt><dd>${escapeHtml(client.name || "")}</dd>
      <dt>Date of birth</dt><dd>${escapeHtml(client.dob || "")}</dd>
      <dt>Address</dt><dd>${escapeHtml(client.address || "")}</dd>
      <dt>Funding</dt><dd>${escapeHtml(client.fundingType || "")}</dd>
      <dt>Assessor</dt><dd>${escapeHtml(contractor.name || "")}</dd>
    </dl>
    <h2>Summary</h2>
    <p>${escapeHtml(report.summary || "")}</p>
    ${fields
      .map(([key, value]) => `<h2>${escapeHtml(labelFromKey(key))}</h2><p>${escapeHtml(String(value || ""))}</p>`)
      .join("")}
    ${photos.length ? `
      <h2>Attached Photos</h2>
      <div class="photo-grid">
        ${photos.map((photo, index) => `
          <figure>
            <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(`Photo ${index + 1}`)}">
            <figcaption>${escapeHtml(`Photo ${index + 1}${photo.name ? ` - ${photo.name}` : ""}`)}</figcaption>
            ${photo.note ? `<p>${escapeHtml(photo.note)}</p>` : ""}
          </figure>
        `).join("")}
      </div>
    ` : ""}
    <p class="report-closing">${escapeHtml(REPORT_CLOSING_MESSAGE)}</p>
    <div class="signature">
      <p>Warm regards,</p>
      ${contractor.signatureDataUrl ? `<img src="${escapeHtml(contractor.signatureDataUrl)}" alt="Therapist signature">` : ""}
      <strong>${escapeHtml(report.signature || contractor.name || "")}</strong>
      <span>${escapeHtml(professionalTitleForUser(contractor))}</span>
      ${report.signedAt ? `<span>Signed: ${escapeHtml(new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Brisbane" }).format(new Date(report.signedAt)))}</span>` : ""}
    </div>
  </main>
</body>
</html>`;
}

function renderReportPdfBuffer(db, report, options = {}) {
  return renderDesignedReportPdf(db, report, options);
}

function renderDesignedReportPdf(db, report, options = {}) {
  const context = designedReportContext(db, report, options);
  const pages = buildDesignedReportPages(context);
  return writeDesignedPdf(pages);
}

function designedReportContext(db, report, options = {}) {
  const hideCaseManagerDetails = Boolean(options.hideCaseManagerDetails);
  const clientRecord = db.clients.find((item) => item.id === report.clientId) || {};
  const contractor = db.users.find((item) => item.id === report.contractorId) || {};
  const appointment = db.appointments.find((item) => item.id === report.appointmentId) || {};
  const referralRecord = db.referrals.find((item) => item.clientId === report.clientId) || {};
  const client = hideCaseManagerDetails ? stripCaseManagerFromClient(clientRecord) : clientRecord;
  const referral = hideCaseManagerDetails ? stripCaseManagerFromReferral(referralRecord) : referralRecord;
  const caseManager = hideCaseManagerDetails ? null : selectedCaseManagerForReport(db, clientRecord, referralRecord);
  const fields = hideCaseManagerDetails ? stripCaseManagerFields(report.fields || {}) : report.fields || {};
  const isEquipment = designedReportIsEquipment(report.type);
  const appointmentDate = appointment.startsAt ? formatReportDate(appointment.startsAt) : "";
  const funding = reportFundingLabel(appointment, client);
  const reportType = report.type || (isEquipment ? "Equipment Trial Report" : "Initial Physiotherapy Assessment Report");

  return {
    report,
    client,
    contractor,
    appointment,
    referral,
    caseManager,
    fields,
    photos: pdfImageAttachments(reportPhotoAttachmentsFromFields(fields)),
    signatureImage: pdfSignatureImageFromUser(contractor),
    isEquipment,
    reportType,
    appointmentDate,
    funding,
    coverTitle: isEquipment
      ? ["Equipment", "Trial", "Report"]
      : ["Initial Home", "Physiotherapy", "Report"],
    contentTitle: isEquipment
      ? "Equipment Trial Report"
      : `Initial Physiotherapy${funding ? ` ${funding}` : ""} Assessment Report`
  };
}

function designedReportIsEquipment(type) {
  return String(type || "").toLowerCase().includes("equipment trial");
}

function reportFundingLabel(appointment, client) {
  const text = `${appointment?.appointmentType || ""} ${appointment?.recurrence || ""} ${client?.fundingType || ""}`.toLowerCase();
  if (text.includes("chsp")) return "CHSP";
  if (text.includes("sah")) return "SAH";
  return client?.fundingType || "";
}

function selectedCaseManagerForReport(db, client = {}, referral = {}) {
  const caseManagerId = client.caseManagerId || referral.caseManagerId || "";
  return (db.caseManagers || []).find((item) => item.id === caseManagerId) || null;
}

function formatReportDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function formatReportDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatReportPlainDate(value) {
  if (!value) return "";
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  }
  return formatReportDate(text);
}

function buildDesignedReportPages(context) {
  const pages = [designedReportCoverPage(context)];
  pages.push(context.isEquipment ? designedEquipmentDetailsPage(context) : designedInitialDetailsPage(context));
  const contentSections = normalizeDesignedSectionsForPages(designedReportSections(context));
  let current = designedReportContentPage(context);
  const contentStartY = 674;
  const contentBottomY = 138;
  let y = contentStartY;

  for (const section of contentSections) {
    const height = estimateDesignedSectionHeight(section);
    if (y - height < contentBottomY) {
      pages.push(current);
      current = designedReportContentPage(context);
      y = contentStartY;
    }
    y = drawDesignedSection(current, section, y);
  }

  pages.push(current);
  pages.push(...designedReportPhotoPages(context));
  return pages;
}

function designedReportSections(context) {
  const fields = context.fields || {};
  const sections = [];

  if (context.isEquipment) {
    sections.push(
      {
        title: "Equipment Trial Summary",
        body: context.report.summary || fields.equipmentSummary || "Equipment trial completed by the treating physiotherapist."
      },
      ...designedEquipmentSections(fields),
      {
        title: "Recommendations",
        body: [
          selectedEquipmentRecommendationText(fields),
          fields.equipmentAdditionalRecommendations
        ].filter(Boolean).join("\n")
      },
      { title: "Plan", body: fields.equipmentPlan || fields.plan || "" },
      designedSignatureSection(context)
    );
    return sections;
  }

  sections.push(
    { title: "Reason for Referral", body: fields.reasonForReferral || context.report.summary || "" },
    { title: "Medical History", body: fields.medicalHistory || context.client.diagnosis || "" },
    { title: "Current Home Set Up", body: fields.currentHomeSetUp || "" },
    { title: "Subjective", body: fields.subjective || "" },
    { title: "Objective Observations", body: fields.objectiveObservations || "" },
    designedOutcomeMeasureSection(fields),
    { title: "Assessment", body: fields.assessment || "" },
    { title: "Treatment", body: fields.treatment || "" },
    { title: "Recommendations", body: fields.recommendations || "" },
    { title: "Plan", body: fields.plan || "" },
    designedSignatureSection(context)
  );

  return sections;
}

function designedParticipantDetailsSection(context) {
  return {
    title: "Participant Details",
    rows: [
      ["Name", context.client.name],
      ["Date of birth", formatReportPlainDate(context.client.dob)],
      ["Address", reportParticipantAddress(context)],
      ["Phone", context.appointment.contactNumber || context.client.phone],
      ["Funding", context.funding || context.client.fundingType],
      ["Appointment date", context.appointmentDate],
      ["Appointment type", context.appointment.appointmentType || context.appointment.recurrence],
      ["Practitioner", context.contractor.name]
    ]
  };
}

function normalizeDesignedSectionsForPages(sections) {
  const normalized = [];
  for (const section of sections) {
    if (section.rows || section.table || section.signatureBlock) {
      normalized.push(section);
      continue;
    }

    const lines = wrapDesignedText(section.body || "Not recorded.", 88);
    const pageLineLimit = 38;
    for (let index = 0; index < lines.length; index += pageLineLimit) {
      normalized.push({
        title: index === 0 ? section.title : `${section.title} continued`,
        lines: lines.slice(index, index + pageLineLimit)
      });
    }
  }
  return normalized;
}

function designedSignatureSection(context) {
  return {
    title: "Therapist Signature",
    intro: REPORT_CLOSING_MESSAGE,
    signatureBlock: {
      image: context.signatureImage,
      name: context.report.signature || context.contractor.name,
      discipline: professionalTitleForUser(context.contractor),
      signed: context.report.signedAt ? formatReportDateTime(context.report.signedAt) : ""
    }
  };
}

function designedOutcomeMeasureSection(fields) {
  const selected = normalizeReportFieldArray(fields.outcomeMeasures);
  const customRows = customOutcomeMeasureRowsForReport(fields);
  const rows = [];

  for (const measure of selected.filter((item) => item !== "other")) {
    const label = outcomeMeasureLabel(measure);
    const details = String(fields[`outcome_${measure}_details`] || "").trim();
    const normativeValue = String(fields[`outcome_${measure}_normativeValue`] || outcomeMeasureReference(measure)).trim();
    const clinicalNote = String(fields[`outcome_${measure}_clinicalNote`] || "").trim();
    rows.push([label, details || "Not recorded.", normativeValue || "Not recorded.", clinicalNote || "Not recorded."]);
  }

  rows.push(...customRows);
  if (selected.includes("other") && !customRows.length) {
    rows.push([
      "Other",
      "Not recorded.",
      String(fields.outcome_other_normativeValue || "").trim() || "Add reference value or clinical interpretation.",
      String(fields.outcome_other_clinicalNote || "").trim() || "Not recorded."
    ]);
  }

  if (rows.length) {
    return {
      title: "Outcome Measures",
      table: {
        headers: ["Outcome measure", "Score / details", "Normative / reference value", "Clinical note"],
        widths: [88, 92, 154, 125],
        rows
      }
    };
  }

  return {
    title: "Outcome Measures",
    body: "Not recorded."
  };
}

function customOutcomeMeasureRowsForReport(fields) {
  return String(fields.customOutcomeMeasures || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => {
      const id = `custom_${reportOutcomeSlugify(label)}_${index + 1}`;
      const details = String(fields[`outcome_${id}_details`] || "").trim();
      const normativeValue = String(fields[`outcome_${id}_normativeValue`] || "").trim();
      const clinicalNote = String(fields[`outcome_${id}_clinicalNote`] || fields.outcome_other_clinicalNote || "").trim();
      return [label, details || "Not recorded.", normativeValue || "Add reference value or clinical interpretation.", clinicalNote || "Not recorded."];
    });
}

function reportOutcomeSlugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "measure";
}

function normalizeReportFieldArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function outcomeMeasureLabel(id) {
  return {
    "10mwt": "10MWT",
    "30secSts": "30 sec STS",
    tug: "TUG",
    bergBalance: "Berg Balance Scale",
    "5xSts": "5x STS",
    "4StageBalance": "4 stage balance test",
    fes1: "Falls Efficacy Scale (FES-I)",
    other: "Other"
  }[id] || labelFromKey(id);
}

function outcomeMeasureReference(id) {
  return {
    "10mwt": "Usual community ambulation is commonly around 0.8 m/s or higher; limited community ambulation is often below 0.8 m/s.",
    "30secSts": "Record total stands in 30 seconds. Compare against age and sex norms; lower scores indicate reduced lower-limb function.",
    tug: "Less than 10 seconds is usually freely mobile; 10-20 seconds is often independent; more than 20 seconds suggests higher mobility limitation.",
    bergBalance: "Score is out of 56. Scores below 45 are commonly associated with increased falls risk.",
    "5xSts": "Record time to complete five stands. More than 15 seconds is commonly used as a marker of increased falls risk in older adults.",
    "4StageBalance": "Inability to hold tandem stance for 10 seconds is commonly associated with increased falls risk.",
    fes1: "Total score ranges from 16-64. Higher scores indicate greater concern about falling.",
    other: "Custom measure. Add the relevant reference range, cut-off, or clinical interpretation."
  }[id] || "No reference value recorded.";
}

function designedEquipmentSections(fields) {
  const count = designedEquipmentTrialCount(fields);
  return Array.from({ length: count }, (_, index) => {
    const trialIndex = index + 1;
    const title = fields[`equipmentTrial_${trialIndex}_title`] || `Trialled equipment ${trialIndex}`;
    const optionCount = designedEquipmentOptionCount(trialIndex, fields);
    const options = Array.from({ length: optionCount }, (__, optionIndex) =>
      fields[`equipmentTrial_${trialIndex}_option_${optionIndex + 1}_name`]
    ).filter(Boolean);
    const chosenModel = fields[`equipmentTrial_${trialIndex}_chosenModel`] || "";
    const chosenReason = fields[`equipmentTrial_${trialIndex}_chosenReason`] || "";

    return {
      title,
      body: [
        options.length ? `Options trialled:\n${options.map((option, optionIndex) => `${optionIndex + 1}. ${option}`).join("\n")}` : "",
        chosenModel ? `Chosen equipment model: ${chosenModel}` : "",
        chosenReason ? `Clinical reasoning: ${chosenReason}` : ""
      ].filter(Boolean).join("\n\n")
    };
  });
}

function designedEquipmentTrialCount(fields = {}) {
  return Math.max(Object.keys(fields).reduce((max, key) => {
    const match = key.match(/^equipmentTrial_(\d+)_/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0), 1);
}

function designedEquipmentOptionCount(trialIndex, fields = {}) {
  return Math.max(Object.keys(fields).reduce((max, key) => {
    const match = key.match(new RegExp(`^equipmentTrial_${trialIndex}_option_(\\d+)_name$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0), 2);
}

function selectedEquipmentRecommendationText(fields) {
  const models = [];
  for (let index = 1; index <= designedEquipmentTrialCount(fields); index += 1) {
    const model = String(fields[`equipmentTrial_${index}_chosenModel`] || "").trim();
    if (!model) continue;
    const title = fields[`equipmentTrial_${index}_title`] || `Trialled equipment ${index}`;
    models.push(`${title}: ${model}`);
  }
  return models.length ? `Recommended equipment:\n${models.map((item) => `- ${item}`).join("\n")}` : "";
}

function estimateDesignedSectionHeight(section) {
  if (section.signatureBlock) {
    const introLines = section.intro ? wrapDesignedText(section.intro, 88) : [];
    const image = section.signatureBlock.image;
    const imageHeight = image ? fitImage(image.width, image.height, 180, 52).height + 8 : 0;
    const signedHeight = section.signatureBlock.signed ? 12 : 0;
    return 84 + introLines.length * 14 + imageHeight + signedHeight;
  }
  if (section.rows) {
    const introLines = section.intro ? wrapDesignedText(section.intro, 88) : [];
    const introHeight = introLines.length ? introLines.length * 14 + 12 : 0;
    return 46 + introHeight + section.rows
      .filter(([, value]) => String(value || "").trim())
      .reduce((total, [, value]) => total + Math.max(1, wrapPdfText(String(value || ""), 62).length) * 14 + 4, 0);
  }
  if (section.table) return 54 + estimateDesignedTableHeight(section.table);
  const lines = section.lines || wrapDesignedText(section.body || "Not recorded.", 86);
  return 44 + lines.length * 14;
}

function drawDesignedSection(page, section, startY) {
  let y = startY;
  const geometry = designedSectionGeometry(page);
  page.content.push(drawRect(geometry.x, y - 24, geometry.width, 24, "e9f8fb"));
  page.content.push(drawText(section.title, geometry.x + 10, y - 8, 12, "F2", "087f9a"));
  y -= 38;

  if (section.signatureBlock) {
    const introLines = section.intro ? wrapDesignedText(section.intro, 88) : [];
    for (const line of introLines) {
      page.content.push(drawText(line, geometry.x + 14, y, 10, "F2", "26211f"));
      y -= 14;
    }
    y -= 8;
    page.content.push(drawText("Warm regards,", geometry.x + 14, y, 10, "F1", "26211f"));
    y -= 16;

    if (section.signatureBlock.image) {
      const image = section.signatureBlock.image;
      const placement = fitImage(image.width, image.height, 180, 52);
      page.images.push({ pdfName: image.pdfName, buffer: image.buffer, width: image.width, height: image.height });
      page.content.push(drawImage(image.pdfName, geometry.x + 14, y - placement.height + 4, placement.width, placement.height));
      y -= placement.height + 6;
    }

    page.content.push(drawText(section.signatureBlock.name || "", geometry.x + 14, y, 10, "F2", "26211f"));
    y -= 14;
    page.content.push(drawText(section.signatureBlock.discipline || "Physiotherapist", geometry.x + 14, y, 10, "F1", "26211f"));
    y -= 14;
    if (section.signatureBlock.signed) {
      page.content.push(drawText(`Signed: ${section.signatureBlock.signed}`, geometry.x + 14, y, 8.5, "F1", "58524c"));
      y -= 12;
    }
    return y - 12;
  }

  if (section.rows) {
    if (section.intro) {
      const introLines = wrapDesignedText(section.intro, 88);
      for (const line of introLines) {
        page.content.push(drawText(line, geometry.x + 14, y, 10, "F2", "26211f"));
        y -= 14;
      }
      y -= 10;
    }

    const rows = section.rows.filter(([, value]) => String(value || "").trim());
    for (const [label, value] of rows) {
      const valueLines = wrapPdfText(String(value || ""), 62);
      page.content.push(drawText(label, geometry.x + 14, y, 9, "F2", "58524c"));
      for (const valueLine of valueLines) {
        page.content.push(drawText(valueLine, geometry.x + 148, y, 10, "F1", "26211f"));
        y -= 14;
      }
      y -= 4;
    }
    return y - 14;
  }

  if (section.table) return drawDesignedTable(page, section.table, y);

  const lines = section.lines || wrapDesignedText(section.body || "Not recorded.", 88);
  for (const line of lines) {
    page.content.push(drawText(line, geometry.x + 14, y, 10, "F1", "26211f"));
    y -= 14;
  }
  return y - 18;
}

function designedSectionGeometry(page) {
  return page.layout === "initial-content"
    ? { x: 68, width: 459 }
    : { x: 42, width: 511 };
}

function estimateDesignedTableHeight(table) {
  const widths = designedTableColumnWidths(table, 459);
  return 22 + (table.rows || []).reduce((total, row) => total + designedTableRowHeight(row, widths), 0);
}

function designedTableRowHeight(row, widths) {
  const fallbackWidth = widths.at(-1) || 120;
  const maxLines = Math.max(...row.map((value, index) => wrapPdfText(String(value || ""), Math.max(12, Math.floor((widths[index] || fallbackWidth) / 5.6))).length));
  return Math.max(28, 12 + maxLines * 11);
}

function drawDesignedTable(page, table, startY) {
  const geometry = designedSectionGeometry(page);
  const x = geometry.x;
  let y = startY;
  const widths = designedTableColumnWidths(table, geometry.width);
  const headers = table.headers || [];
  const headerHeight = 22;

  page.content.push(drawRect(x, y - headerHeight + 5, geometry.width, headerHeight, "28b9c9"));
  let colX = x;
  headers.forEach((header, index) => {
    page.content.push(drawText(header, colX + 6, y - 9, 8, "F2", "ffffff"));
    colX += widths[index] || widths.at(-1) || 120;
  });
  y -= headerHeight;

  for (const [rowIndex, row] of (table.rows || []).entries()) {
    const rowHeight = designedTableRowHeight(row, widths);
    if (rowIndex % 2 === 0) page.content.push(drawRect(x, y - rowHeight + 5, geometry.width, rowHeight, "fbfdfe"));
    page.content.push(drawStrokeRect(x, y - rowHeight + 5, geometry.width, rowHeight, "d5c9f4", 0.6));
    colX = x;
    row.forEach((value, index) => {
      const columnWidth = widths[index] || widths.at(-1) || 120;
      const maxChars = Math.max(12, Math.floor(columnWidth / 5.6));
      const lines = wrapPdfText(String(value || ""), maxChars).slice(0, 5);
      lines.forEach((line, lineIndex) => {
        page.content.push(drawText(line, colX + 6, y - 9 - lineIndex * 11, 7.5, index === 0 ? "F2" : "F1", "26211f"));
      });
      if (index < row.length - 1) page.content.push(drawLine(colX + columnWidth, y + 5, colX + columnWidth, y - rowHeight + 5, "d5c9f4", 0.6));
      colX += columnWidth;
    });
    y -= rowHeight;
  }

  return y - 18;
}

function designedTableColumnWidths(table, geometryWidth) {
  if (Array.isArray(table?.widths) && table.widths.length) {
    const raw = table.widths.map((width) => Math.max(20, Number(width) || 0));
    const total = raw.reduce((sum, width) => sum + width, 0);
    if (total > 0) {
      const scaled = raw.map((width) => width * (geometryWidth / total));
      const rounded = scaled.slice(0, -1).map((width) => Math.round(width));
      rounded.push(Math.max(20, geometryWidth - rounded.reduce((sum, width) => sum + width, 0)));
      return rounded;
    }
  }

  const columnCount = Math.max(
    1,
    table?.headers?.length || 0,
    ...(table?.rows || []).map((row) => row.length)
  );
  if (columnCount === 3) return [120, 155, geometryWidth - 275];
  if (columnCount === 4) return [90, 95, 150, geometryWidth - 335];
  const width = geometryWidth / columnCount;
  return Array.from({ length: columnCount }, () => width);
}

function designedReportCoverPage(context) {
  const page = { content: [], images: [] };
  if (context.isEquipment) {
    addAssetImage(page, "EquipmentCover", "equipment-cover-canva.jpg", 2121, 3000);
    page.content.push(drawRect(0, 0, 595, 842, "ffffff"));
    page.content.push(drawImage("EquipmentCover", 0, 0, 595, 842));
    return page;
  }

  if (!context.isEquipment) {
    addAssetImage(page, "InitialCover", "initial-cover-canva.jpg", 2298, 3250);
    page.content.push(drawRect(0, 0, 595, 842, "ffffff"));
    page.content.push(drawImage("InitialCover", 0, 0, 595, 842));
    return page;
  }

  return page;
}

function designedInitialDetailsPage(context) {
  return designedPatientDetailsPage(context, {
    pdfName: "InitialDetails",
    filename: "initial-details-canva.jpg",
    width: 2828,
    height: 4000
  });
}

function designedEquipmentDetailsPage(context) {
  return designedPatientDetailsPage(context, {
    pdfName: "EquipmentDetails",
    filename: "equipment-details-canva.jpg",
    width: 2121,
    height: 3000,
    valueX: 215,
    yPositions: [575, 535, 495, 453, 413, 373, 333, 293, 252, 212]
  });
}

function designedPatientDetailsPage(context, template) {
  const page = { content: [], images: [] };
  addAssetImage(page, template.pdfName, template.filename, template.width, template.height);
  page.content.push(drawRect(0, 0, 595, 842, "ffffff"));
  page.content.push(drawImage(template.pdfName, 0, 0, 595, 842));

  const rows = designedPatientDetailsRows(context);
  const valueX = template.valueX || 222;
  const yPositions = template.yPositions || [580, 540, 500, 460, 417, 374, 334, 294, 254, 214];
  rows.forEach((value, index) => {
    drawTableValue(page, value, valueX, yPositions[index], 53, index === 3 || index === 5 ? 3 : 2);
  });
  return page;
}

function designedPatientDetailsRows(context) {
  const fields = context.fields || {};
  return [
    context.client.name || "",
    reportParticipantAddress(context),
    formatReportPlainDate(context.client.dob),
    reportContactDetails(context),
    firstReportValue(
      fields.caseManagerRegisteredNurse,
      fields.case_manager_registered_nurse,
      fields.caseManager,
      fields.case_manager,
      context.caseManager?.name,
      context.referral.caseManager
    ),
    firstReportValue(
      fields.caseManagerDetails,
      fields.case_manager_details,
      fields.case_manager_contact_details,
      context.caseManager ? caseManagerDetailsText(context.caseManager) : "",
      context.referral.caseManagerDetails
    ),
    context.contractor.name || "",
    reportAssessorQualifications(context.contractor),
    context.appointmentDate,
    formatReportPlainDate(context.report.signedAt || context.report.updatedAt || context.report.createdAt || new Date().toISOString())
  ];
}

function reportParticipantAddress(context) {
  return context.appointment.address || context.client.address || context.referral.address || "";
}

function reportContactDetails(context) {
  return [
    context.appointment.contactNumber || context.client.phone || context.referral.phone,
    context.client.email || context.referral.email
  ].filter(Boolean).join(" | ");
}

function reportAssessorQualifications(contractor = {}) {
  if (contractor.qualifications) return contractor.qualifications;
  const discipline = String(contractor.discipline || "").toLowerCase();
  if (discipline.includes("physio")) return "Physiotherapist";
  if (discipline.includes("occupational")) return "Occupational Therapist";
  if (discipline.includes("exercise")) return "Exercise Physiologist";
  if (discipline.includes("nurs")) return "Registered Nurse";
  return contractor.discipline || "";
}

function firstReportValue(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function drawTableValue(page, value, x, centerY, maxChars, maxLines) {
  const rawLines = wrapPdfText(String(value || ""), maxChars).filter(Boolean);
  let lines = rawLines.slice(0, maxLines);
  if (rawLines.length > maxLines && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, 54).replace(/\s+$/, "")}...`;
  }
  const lineHeight = 12;
  const startY = centerY + ((lines.length - 1) * lineHeight) / 2 - 4;
  lines.forEach((line, index) => {
    page.content.push(drawText(line, x, startY - index * lineHeight, 9, "F1", "26211f"));
  });
}

function designedReportContentPage(context) {
  const page = { content: [], images: [] };
  page.layout = "initial-content";
  addAssetImage(page, "ReportContent", "initial-content-canva.jpg", 2828, 4000);
  page.content.push(drawRect(0, 0, 595, 842, "ffffff"));
  page.content.push(drawImage("ReportContent", 0, 0, 595, 842));
  page.content.push(drawText(context.contentTitle, 68, 694, 16, "F2", "26211f"));
  return page;
}

function designedReportPhotoPages(context) {
  if (!context.photos.length) return [];
  const pages = [];
  let page = designedReportContentPage(context);
  page.content.push(drawRect(42, 686, 511, 24, "e9f8fb"));
  page.content.push(drawText("Attached Photos", 52, 702, 12, "F2", "087f9a"));
  let y = 468;
  let photosOnPage = 0;

  context.photos.forEach((photo, index) => {
    if (photosOnPage === 2) {
      pages.push(page);
      page = designedReportContentPage(context);
      page.content.push(drawRect(42, 686, 511, 24, "e9f8fb"));
      page.content.push(drawText("Attached Photos", 52, 702, 12, "F2", "087f9a"));
      y = 468;
      photosOnPage = 0;
    }

    const name = `Photo${index + 1}`;
    page.images.push({ pdfName: name, buffer: photo.buffer, width: photo.width, height: photo.height });
    const noteLines = photo.note ? wrapDesignedText(photo.note, 78).slice(0, 3) : [];
    const placement = fitImage(photo.width, photo.height, 420, noteLines.length ? 188 : 220);
    const x = 88 + (420 - placement.width) / 2;
    page.content.push(drawRect(78, y - 14, 440, 260, "f7f3ef"));
    page.content.push(drawText(`${index + 1}`, 92, y + 215, 18, "F2", "16aee5"));
    page.content.push(drawText(photo.name || `Photo ${index + 1}`, 118, y + 220, 11, "F2", "26211f"));
    page.content.push(drawImage(name, x, y + (noteLines.length ? 48 : 8), placement.width, placement.height));
    if (noteLines.length) {
      page.content.push(drawText("Notes:", 92, y + 25, 9, "F2", "087f9a"));
      noteLines.forEach((line, lineIndex) => {
        page.content.push(drawText(line, 132, y + 25 - lineIndex * 12, 9, "F1", "26211f"));
      });
    }
    y -= 308;
    photosOnPage += 1;
  });

  pages.push(page);
  return pages;
}

function addAssetImage(page, pdfName, filename, width, height) {
  const buffer = readReportAsset(filename);
  if (!buffer) return;
  page.images.push({ pdfName, buffer, width, height });
}

function readReportAsset(filename) {
  try {
    return readFileSync(path.join(reportTemplateAssetDir, filename));
  } catch {
    return null;
  }
}

function fitImage(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

function drawRect(x, y, width, height, color) {
  const [r, g, b] = pdfRgb(color);
  return `${r} ${g} ${b} rg\n${roundPdf(x)} ${roundPdf(y)} ${roundPdf(width)} ${roundPdf(height)} re f`;
}

function drawStrokeRect(x, y, width, height, color, lineWidth = 1) {
  const [r, g, b] = pdfRgb(color);
  return `${r} ${g} ${b} RG\n${roundPdf(lineWidth)} w\n${roundPdf(x)} ${roundPdf(y)} ${roundPdf(width)} ${roundPdf(height)} re S`;
}

function drawLine(x1, y1, x2, y2, color, lineWidth = 1) {
  const [r, g, b] = pdfRgb(color);
  return `${r} ${g} ${b} RG\n${roundPdf(lineWidth)} w\n${roundPdf(x1)} ${roundPdf(y1)} m\n${roundPdf(x2)} ${roundPdf(y2)} l\nS`;
}

function drawText(value, x, y, size, font = "F1", color = "26211f") {
  const [r, g, b] = pdfRgb(color);
  return `BT\n${r} ${g} ${b} rg\n/${font} ${size} Tf\n${roundPdf(x)} ${roundPdf(y)} Td\n(${escapePdfText(sanitizeDesignedPdfText(value))}) Tj\nET`;
}

function drawImage(pdfName, x, y, width, height) {
  return `q\n${roundPdf(width)} 0 0 ${roundPdf(height)} ${roundPdf(x)} ${roundPdf(y)} cm\n/${pdfName} Do\nQ`;
}

function pdfRgb(hex) {
  const normalized = String(hex || "000000").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((index) => roundPdf(parseInt(value.slice(index, index + 2), 16) / 255));
}

function roundPdf(value) {
  return Number(value || 0).toFixed(3).replace(/\.?0+$/, "");
}

function wrapDesignedText(value, maxLength) {
  const paragraphs = String(value || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const lines = [];
  for (const paragraph of paragraphs) {
    lines.push(...wrapPdfText(paragraph, maxLength));
  }
  return lines.length ? lines : ["Not recorded."];
}

function sanitizeDesignedPdfText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 220);
}

function writeDesignedPdf(pages) {
  const objects = [
    { number: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { number: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { number: 4, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" }
  ];
  const pageRefs = [];
  let nextObjectNumber = 5;

  pages.forEach((page) => {
    const pageObjectNumber = nextObjectNumber;
    const contentObjectNumber = nextObjectNumber + 1;
    nextObjectNumber += 2;
    pageRefs.push(`${pageObjectNumber} 0 R`);

    const imageRefs = [];
    const xObjectRefs = [];
    for (const image of page.images || []) {
      const imageObjectNumber = nextObjectNumber;
      nextObjectNumber += 1;
      imageRefs.push({ image, imageObjectNumber });
      xObjectRefs.push(`/${image.pdfName} ${imageObjectNumber} 0 R`);
    }

    const content = (page.content || []).join("\n");
    const xObjectResource = xObjectRefs.length ? `/XObject << ${xObjectRefs.join(" ")} >>` : "";
    objects.push({
      number: pageObjectNumber,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjectResource} >> /Contents ${contentObjectNumber} 0 R >>`
    });
    objects.push({
      number: contentObjectNumber,
      body: `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
    });

    for (const { image, imageObjectNumber } of imageRefs) {
      objects.push({
        number: imageObjectNumber,
        body: Buffer.concat([
          Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.buffer.length} >>\nstream\n`, "ascii"),
          image.buffer,
          Buffer.from("\nendstream", "ascii")
        ])
      });
    }
  });

  objects.splice(1, 0, {
    number: 2,
    body: `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`
  });

  return writePdfObjects(objects);
}

function renderTreatmentNotePdfBuffer(db, note) {
  return renderSimplePdf(treatmentNoteTextLines(db, note));
}

function treatmentNoteDownloadFilename(db, note) {
  const client = db.clients.find((item) => item.id === note.clientId) || {};
  const appointment = db.appointments.find((item) => item.id === note.appointmentId) || {};
  const appointmentDate = appointment.startsAt ? appointment.startsAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return treatmentNotePdfFilename(appointmentDate, client.name || "Patient");
}

function reportDownloadFilename(db, report) {
  const client = db.clients.find((item) => item.id === report.clientId) || {};
  const contractor = db.users.find((item) => item.id === report.contractorId) || {};
  const appointment = db.appointments.find((item) => item.id === report.appointmentId) || {};
  const appointmentDate = appointment.startsAt ? appointment.startsAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return reportPdfFilename(client.name || "Patient", report.type || "Report", appointmentDate, contractor.name || "Practitioner");
}

function treatmentNoteTextLines(db, note) {
  const client = db.clients.find((item) => item.id === note.clientId) || {};
  const contractor = db.users.find((item) => item.id === note.contractorId) || {};
  const appointment = db.appointments.find((item) => item.id === note.appointmentId) || {};
  const appointmentDate = appointment.startsAt ? appointment.startsAt.slice(0, 10) : "";
  const lines = [
    "Treatment Notes",
    "Refine Physio Mobile",
    "",
    `Appointment: ${appointmentDate}`,
    `Patient: ${client.name || ""}`,
    `Practitioner: ${contractor.name || ""}`,
    `Appointment type: ${appointment.appointmentType || appointment.recurrence || ""}`,
    "",
    `Status: ${note.status || ""}`,
    `Signed by: ${note.signature || contractor.name || ""}`,
    note.updatedAt ? `Completed: ${note.updatedAt}` : "",
    ""
  ].filter((line) => line !== "");

  for (const [key, value] of Object.entries(note.fields || {})) {
    lines.push(labelFromKey(key));
    lines.push(...wrapPdfText(String(value || "Not recorded."), 92));
    lines.push("");
  }

  return lines;
}

function reportTextLines(db, report) {
  const client = db.clients.find((item) => item.id === report.clientId) || {};
  const contractor = db.users.find((item) => item.id === report.contractorId) || {};
  const appointment = db.appointments.find((item) => item.id === report.appointmentId) || {};
  const lines = [
    report.type || "Report",
    "Refine Physio Mobile",
    "",
    `Patient: ${client.name || ""}`,
    `DOB: ${client.dob || ""}`,
    `Address: ${client.address || ""}`,
    `Appointment: ${appointment.startsAt ? appointment.startsAt.slice(0, 10) : ""}`,
    `Practitioner: ${contractor.name || ""}`,
    "",
    "Summary",
    ...(wrapPdfText(report.summary || "No summary recorded.", 92)),
    ""
  ];

  const photoCount = reportPhotoAttachmentsFromFields(report.fields || {}).length;

  for (const [key, value] of Object.entries(report.fields || {})) {
    if (key === "photoAttachments") continue;
    lines.push(labelFromKey(key));
    lines.push(...wrapPdfText(String(value || "Not recorded."), 92));
    lines.push("");
  }

  if (photoCount) {
    lines.push("Attached Photos");
    reportPhotoAttachmentsFromFields(report.fields || {}).forEach((photo, index) => {
      lines.push(`${index + 1}. ${photo.name || `Photo ${index + 1}`}`);
      if (photo.note) lines.push(...wrapPdfText(`Notes: ${photo.note}`, 92));
    });
    lines.push("");
  }

  lines.push(...wrapPdfText(REPORT_CLOSING_MESSAGE, 92));
  lines.push("");
  lines.push("Warm regards,");
  lines.push(report.signature || contractor.name || "");
  lines.push(professionalTitleForUser(contractor));
  if (report.signedAt) lines.push(`Signed: ${report.signedAt}`);
  return lines;
}

function wrapPdfText(value, maxLength) {
  const words = String(value || "")
    .replace(/\r/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxLength) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function renderSimplePdf(lines, photoAttachments = []) {
  const usableLines = lines.map(sanitizePdfText);
  const pages = chunk(usableLines, 48);
  const photos = pdfImageAttachments(photoAttachments);
  const objects = [
    { number: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { number: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" }
  ];
  const pageRefs = [];
  let nextObjectNumber = 4;

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = nextObjectNumber;
    const contentObjectNumber = nextObjectNumber + 1;
    nextObjectNumber += 2;
    pageRefs.push(`${pageObjectNumber} 0 R`);
    const content = [
      "BT",
      "/F1 10 Tf",
      "50 790 Td",
      "14 TL",
      ...pageLines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, "T*"]),
      "ET"
    ].join("\n");
    objects.push({
      number: pageObjectNumber,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    });
    objects.push({
      number: contentObjectNumber,
      body: `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
    });
  });

  photos.forEach((photo, index) => {
    const pageObjectNumber = nextObjectNumber;
    const contentObjectNumber = nextObjectNumber + 1;
    const imageObjectNumber = nextObjectNumber + 2;
    nextObjectNumber += 3;
    pageRefs.push(`${pageObjectNumber} 0 R`);

    const placement = pdfImagePlacement(photo.width, photo.height);
    const caption = sanitizePdfText(`Photo ${index + 1}: ${photo.name || "Camera photo"}`);
    const noteLines = photo.note ? wrapPdfText(`Notes: ${photo.note}`, 82).slice(0, 4).map(sanitizePdfText) : [];
    const content = [
      "BT",
      "/F1 12 Tf",
      "50 790 Td",
      `(${escapePdfText(caption)}) Tj`,
      "ET",
      ...(noteLines.length
        ? [
          "BT",
          "/F1 9 Tf",
          "50 770 Td",
          "11 TL",
          ...noteLines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, "T*"]),
          "ET"
        ]
        : [
          "BT",
          "/F1 9 Tf",
          "50 770 Td",
          `(${escapePdfText("Included with the signed initial physiotherapy report.")}) Tj`,
          "ET"
        ]),
      "q",
      `${placement.width} 0 0 ${placement.height} ${placement.x} ${placement.y} cm`,
      "/Im1 Do",
      "Q"
    ].join("\n");

    objects.push({
      number: pageObjectNumber,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    });
    objects.push({
      number: contentObjectNumber,
      body: `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
    });
    objects.push({
      number: imageObjectNumber,
      body: Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${photo.width} /Height ${photo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${photo.buffer.length} >>\nstream\n`, "ascii"),
        photo.buffer,
        Buffer.from("\nendstream", "ascii")
      ])
    });
  });

  objects.splice(1, 0, {
    number: 2,
    body: `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`
  });

  return writePdfObjects(objects);
}

function pdfImageAttachments(photoAttachments = []) {
  return normalizeReportPhotoAttachments(photoAttachments)
    .map((photo) => {
      const match = String(photo.dataUrl || "").match(/^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) return null;
      const buffer = Buffer.from(match[1], "base64");
      if (!buffer.length) return null;
      return {
        name: photo.name || "Photo",
        note: photo.note || "",
        width: photo.width || 1200,
        height: photo.height || 900,
        buffer
      };
    })
    .filter(Boolean);
}

function pdfSignatureImageFromUser(user = {}) {
  const dataUrl = sanitizeSignatureDataUrl(user.signatureDataUrl);
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length) return null;
  return {
    pdfName: "TherapistSignature",
    width: Math.max(1, Math.min(1200, Number(user.signatureWidth || 520) || 520)),
    height: Math.max(1, Math.min(500, Number(user.signatureHeight || 160) || 160)),
    buffer
  };
}

function pdfImagePlacement(width, height) {
  const maxWidth = 495;
  const maxHeight = 640;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  return {
    width: drawWidth,
    height: drawHeight,
    x: Math.round((595 - drawWidth) / 2),
    y: Math.round(80 + (maxHeight - drawHeight) / 2)
  };
}

function writePdfObjects(objects) {
  objects.sort((a, b) => a.number - b.number);
  const maxObjectNumber = Math.max(...objects.map((object) => object.number));
  const offsets = Array(maxObjectNumber + 1).fill(null);
  const chunks = [];
  let byteLength = 0;
  const push = (value) => {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
    chunks.push(buffer);
    byteLength += buffer.length;
  };

  push("%PDF-1.4\n");
  for (const object of objects) {
    offsets[object.number] = byteLength;
    push(`${object.number} 0 obj\n`);
    push(object.body);
    push("\nendobj\n");
  }
  const xrefOffset = byteLength;
  let xref = `xref\n0 ${maxObjectNumber + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= maxObjectNumber; index += 1) {
    const offset = offsets[index];
    xref += offset === null
      ? "0000000000 65535 f \n"
      : `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  push(xref);
  return Buffer.concat(chunks);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function sanitizePdfText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 160);
}

function escapePdfText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function labelFromKey(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  }[ext] || "application/octet-stream";
}

function securityHeaders() {
  const headers = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()"
  };

  if (process.env.NODE_ENV === "production") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function sendPdf(res, status, buffer, filename) {
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${String(filename || "report.pdf").replace(/"/g, "")}"`,
    "Cache-Control": "no-store"
  });
  res.end(buffer);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
