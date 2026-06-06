const DEFAULT_BASE_URL = "https://api.au1.cliniko.com/v1";
const DEFAULT_USER_AGENT = "Refine Physio Mobile (admin@refinephysio.com.au)";
const DEFAULT_POLL_MINUTES = 5;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 350;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_APPOINTMENT_SYNC_PAST_DAYS = 14;
const DEFAULT_APPOINTMENT_SYNC_FUTURE_DAYS = 90;
const BRISBANE_UTC_OFFSET = "+10:00";
const MAX_RETRIES = 3;

const collectionKeys = {
  "/businesses": "businesses",
  "/patients": "patients",
  "/practitioners": "practitioners",
  "/daily_availabilities": "daily_availabilities",
  "/appointment_types": "appointment_types",
  "/individual_appointments": "individual_appointments",
  "/unavailable_blocks": "unavailable_blocks",
  "/unavailable_block_types": "unavailable_block_types",
  "/treatment_notes": "treatment_notes",
  "/patient_attachments": "patient_attachments"
};

let lastClinikoRequestAt = 0;
let rateLimitQueue = Promise.resolve();

function config() {
  const apiKey = String(process.env.CLINIKO_API_KEY || "").trim();
  const configuredBaseUrl = process.env.CLINIKO_BASE_URL || DEFAULT_BASE_URL;
  return {
    apiKey,
    baseUrl: clinikoBaseUrlForKey(apiKey, configuredBaseUrl),
    userAgent: process.env.CLINIKO_USER_AGENT || DEFAULT_USER_AGENT,
    pollEnabled: process.env.CLINIKO_POLL_ENABLED === "true",
    pollSeconds: Number(process.env.CLINIKO_POLL_SECONDS || 0),
    pollMinutes: Number(process.env.CLINIKO_POLL_MINUTES || DEFAULT_POLL_MINUTES),
    minRequestIntervalMs: Number(process.env.CLINIKO_MIN_REQUEST_INTERVAL_MS || DEFAULT_MIN_REQUEST_INTERVAL_MS),
    maxPages: Number(process.env.CLINIKO_MAX_SYNC_PAGES || DEFAULT_MAX_PAGES),
    syncStartDate: normaliseDateOnly(process.env.CLINIKO_SYNC_START_DATE || ""),
    appointmentSyncPastDays: Number(process.env.CLINIKO_APPOINTMENT_SYNC_PAST_DAYS || DEFAULT_APPOINTMENT_SYNC_PAST_DAYS),
    appointmentSyncFutureDays: Number(process.env.CLINIKO_APPOINTMENT_SYNC_FUTURE_DAYS || DEFAULT_APPOINTMENT_SYNC_FUTURE_DAYS),
    activeBusinessId: process.env.CLINIKO_ACTIVE_BUSINESS_ID || "",
    allowMultipleLocations: process.env.CLINIKO_ALLOW_MULTIPLE_LOCATIONS === "true",
    activePractitionerIds: String(process.env.CLINIKO_ACTIVE_PRACTITIONER_IDS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    allowMultiplePractitioners: process.env.CLINIKO_ALLOW_MULTIPLE_PRACTITIONERS === "true",
    appointmentCreateEnabled: process.env.CLINIKO_APPOINTMENT_CREATE_ENABLED === "true",
    appointmentWriteEnabled: process.env.CLINIKO_APPOINTMENT_WRITE_ENABLED === "true",
    patientCreateEnabled: process.env.CLINIKO_PATIENT_CREATE_ENABLED === "true",
    reportUploadEnabled: process.env.CLINIKO_REPORT_UPLOAD_ENABLED === "true",
    reportUploadAutoEnabled: process.env.CLINIKO_REPORT_UPLOAD_AUTO_ENABLED === "true",
    noteUploadEnabled: process.env.CLINIKO_NOTE_UPLOAD_ENABLED === "true",
    noteUploadAutoEnabled: process.env.CLINIKO_NOTE_UPLOAD_AUTO_ENABLED === "true"
  };
}

function clinikoBaseUrlForKey(apiKey, configuredBaseUrl) {
  const fallback = String(configuredBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const shard = clinikoShardFromApiKey(apiKey);
  if (!shard) return fallback;
  if (!configuredBaseUrl || isOfficialClinikoBaseUrl(fallback)) return `https://api.${shard}.cliniko.com/v1`;
  return fallback;
}

function clinikoShardFromApiKey(apiKey) {
  const match = String(apiKey || "").trim().match(/-([a-z]{2}\d{1,2})$/i);
  return match ? match[1].toLowerCase() : "";
}

function isOfficialClinikoBaseUrl(value) {
  return /^https:\/\/api\.[a-z]{2}\d{1,2}\.cliniko\.com\/v1$/i.test(String(value || ""));
}

export function getClinikoConfig() {
  const current = config();
  return {
    connected: Boolean(current.apiKey),
    baseUrl: current.baseUrl,
    userAgentSet: Boolean(current.userAgent),
    writeEnabled: current.appointmentWriteEnabled,
    appointmentCreateEnabled: current.appointmentCreateEnabled,
    appointmentWriteEnabled: current.appointmentWriteEnabled,
    patientCreateEnabled: current.patientCreateEnabled,
    noteSyncEnabled: false,
    noteUploadEnabled: current.noteUploadEnabled,
    noteUploadAutoEnabled: current.noteUploadAutoEnabled,
    reportUploadEnabled: current.reportUploadEnabled,
    reportUploadAutoEnabled: current.reportUploadAutoEnabled,
    pollEnabled: current.pollEnabled,
    pollingIntervalSeconds: current.pollSeconds,
    pollingIntervalMinutes: current.pollMinutes,
    syncStartDate: current.syncStartDate,
    appointmentSyncPastDays: current.appointmentSyncPastDays,
    appointmentSyncFutureDays: current.appointmentSyncFutureDays,
    activeBusinessId: current.activeBusinessId,
    allowMultipleLocations: current.allowMultipleLocations,
    activePractitionerIds: current.activePractitionerIds,
    allowMultiplePractitioners: current.allowMultiplePractitioners,
    webhooksAvailable: false,
    mode: [
      current.appointmentCreateEnabled ? "appointment_create" : "",
      current.appointmentWriteEnabled ? "appointment_write" : "",
      current.reportUploadEnabled ? "report_upload" : "",
      current.noteUploadEnabled ? "note_file_upload" : ""
    ].filter(Boolean).join("_and_") || "read_only"
  };
}

export function clinikoEndpointSummary() {
  return {
    locations: "GET /businesses, GET /businesses/{id}",
    patients: "GET /patients, GET /patients/{id}",
    practitioners: "GET /businesses/{business_id}/practitioners, GET /practitioners/{id}",
    practitionerWorkingHours: "GET /practitioners/{practitioner_id}/daily_availabilities filtered by active business_id",
    appointmentTypes: "GET /appointment_types, GET /appointment_types/{id}",
    appointments: "GET /individual_appointments filtered by business_id, practitioner_id, and date range; optional POST /individual_appointments for app-created bookings; optional PATCH /individual_appointments/{id} for appointment time/type write-back.",
    unavailableBlocks: "GET /unavailable_blocks and GET /unavailable_block_types filtered by business_id, practitioner_id, and date range. Display-only Cliniko blocks are shown on the app calendar and stop bookings in that blocked time.",
    treatmentNotes: "Not enabled in Step 4 read-only sync.",
    patientAttachments: "Optional report and completed treatment note PDF upload: GET /patients/{patient_id}/attachment_presigned_post, POST S3 presigned URL, POST /patient_attachments.",
    webhooks: "No official Cliniko webhook endpoint found in the public API docs; use scheduled polling unless Cliniko support confirms otherwise."
  };
}

class ClinikoApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ClinikoApiError";
    Object.assign(this, details);
  }
}

async function wait(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimitSlot() {
  const previous = rateLimitQueue;
  let release = () => {};
  rateLimitQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous.catch(() => {});
  try {
    const interval = Math.max(Number(config().minRequestIntervalMs) || DEFAULT_MIN_REQUEST_INTERVAL_MS, 100);
    const now = Date.now();
    const waitMs = Math.max(0, lastClinikoRequestAt + interval - now);
    await wait(waitMs);
    lastClinikoRequestAt = Date.now();
  } finally {
    release();
  }
}

async function clinikoFetch(path, options = {}) {
  const current = config();
  if (!current.apiKey) {
    throw new ClinikoApiError("CLINIKO_API_KEY is not configured.", { code: "not_configured" });
  }

  const url = path.startsWith("http") ? path : `${current.baseUrl}${path}`;
  const token = Buffer.from(`${current.apiKey}:`).toString("base64");
  const method = options.method || "GET";
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForRateLimitSlot();

    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Basic ${token}`,
        "User-Agent": current.userAgent,
        ...(options.headers || {})
      }
    });

    if (response.status === 429) {
      const resetAt = Number(response.headers.get("X-RateLimit-Reset"));
      const retryMs = Number.isFinite(resetAt)
        ? Math.max(1000, resetAt * 1000 - Date.now())
        : 1500 * (attempt + 1);
      lastError = new ClinikoApiError("Cliniko rate limit reached.", {
        status: response.status,
        retryMs
      });
      await wait(retryMs);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (response.ok) return payload;

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      lastError = new ClinikoApiError(`Cliniko ${response.status}`, { status: response.status, payload });
      await wait(1000 * (attempt + 1));
      continue;
    }

    throw new ClinikoApiError(`Cliniko ${response.status}`, {
      status: response.status,
      payload
    });
  }

  throw lastError || new ClinikoApiError("Cliniko request failed.");
}

async function listResource(path, key = "", maxPages = config().maxPages) {
  const items = [];
  let nextPath = path;
  let pageCount = 0;

  while (nextPath && pageCount < maxPages) {
    const page = await clinikoFetch(nextPath);
    const pageKey = key || collectionKeyForPath(nextPath);
    const pageItems = page?.[pageKey] || [];
    items.push(...pageItems);
    nextPath = page?.links?.next || null;
    pageCount += 1;
  }

  return items;
}

async function listOptionalResource(path, key = "", maxPages = config().maxPages) {
  try {
    return await listResource(path, key, maxPages);
  } catch (error) {
    if (error?.status === 400 || error?.status === 404) return [];
    throw error;
  }
}

function appointmentSyncPath(businessId = "", practitionerId = "") {
  const { from, to } = appointmentSyncWindow();
  const params = new URLSearchParams({
    per_page: "100",
    sort: "starts_at:asc"
  });
  params.append("q[]", `starts_at:>=${from}`);
  params.append("q[]", `starts_at:<=${to}`);
  if (businessId) params.append("q[]", `business_id:=${businessId}`);
  if (practitionerId) params.append("q[]", `practitioner_id:=${practitionerId}`);
  return `/individual_appointments?${params.toString()}`;
}

function unavailableBlockSyncPath(businessId = "", practitionerId = "") {
  const { from, to } = appointmentSyncWindow();
  const params = new URLSearchParams({
    per_page: "100",
    sort: "starts_at:asc"
  });
  params.append("q[]", `starts_at:<=${to}`);
  params.append("q[]", `ends_at:>=${from}`);
  if (businessId) params.append("q[]", `business_id:=${businessId}`);
  if (practitionerId) params.append("q[]", `practitioner_id:=${practitionerId}`);
  return `/unavailable_blocks?${params.toString()}`;
}

function appointmentSyncWindow() {
  const current = config();
  const now = Date.now();
  const rollingFromMs = now - Math.max(0, current.appointmentSyncPastDays) * 24 * 60 * 60 * 1000;
  const startDateFromMs = current.syncStartDate ? new Date(`${current.syncStartDate}T00:00:00${BRISBANE_UTC_OFFSET}`).getTime() : null;
  const fromMs = Number.isFinite(startDateFromMs) ? startDateFromMs : rollingFromMs;
  const toMs = now + Math.max(1, current.appointmentSyncFutureDays) * 24 * 60 * 60 * 1000;
  return {
    fromMs,
    toMs,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString()
  };
}

function appointmentSyncStartIso() {
  const current = config();
  if (!current.syncStartDate) return "";
  const startMs = new Date(`${current.syncStartDate}T00:00:00${BRISBANE_UTC_OFFSET}`).getTime();
  return Number.isFinite(startMs) ? new Date(startMs).toISOString() : "";
}

function normaliseDateOnly(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function collectionKeyForPath(path) {
  const pathname = path.startsWith("http") ? new URL(path).pathname : path.split("?")[0];
  const match = Object.entries(collectionKeys).find(([endpoint]) => pathname.endsWith(endpoint));
  return match?.[1] || "";
}

function linkedId(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value.id) return String(value.id);
  if (value.links?.self) {
    const parts = String(value.links.self).split("/").filter(Boolean);
    return parts.at(-1) || "";
  }
  return "";
}

function linkedIdFromRecord(record, fieldName) {
  return linkedId(record?.[fieldName]);
}

function fullName(record) {
  return [record.first_name, record.last_name].filter(Boolean).join(" ").trim()
    || record.name
    || record.patient_name
    || "Unknown";
}

function mergeByExternalId(items, incoming, externalKey) {
  const index = new Map(items.map((item) => [String(item[externalKey] || ""), item]));
  for (const item of incoming) {
    if (!item[externalKey]) continue;
    const existing = index.get(String(item[externalKey]));
    if (existing) {
      Object.assign(existing, { ...existing, ...item, id: existing.id });
    } else {
      items.push(item);
      index.set(String(item[externalKey]), item);
    }
  }
}

function ensureCollections(db) {
  db.users ||= [];
  db.clients ||= [];
  db.referrals ||= [];
  db.appointments ||= [];
  db.unavailableBlocks ||= [];
  db.treatmentNotes ||= [];
  db.reports ||= [];
  db.appointmentTypes ||= [];
  db.unavailableBlockTypes ||= [];
  db.clinikoLocations ||= [];
  db.clinikoSyncLogs ||= [];
  db.syncErrors ||= [];
  for (const user of db.users) {
    if (!user.clinikoPractitionerId) continue;
    if (typeof user.clinikoSyncEnabled !== "boolean") user.clinikoSyncEnabled = false;
  }
}

function pruneClinikoRecordsBeforeStart(db, startIso) {
  if (!startIso) return { appointments: 0, clients: 0, unavailableBlocks: 0 };
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return { appointments: 0, clients: 0, unavailableBlocks: 0 };

  const beforeCount = db.appointments.length;
  db.appointments = db.appointments.filter((appointment) => {
    if (appointment.syncSource !== "cliniko") return true;
    const startsAtMs = new Date(appointment.startsAt || "").getTime();
    return !Number.isFinite(startsAtMs) || startsAtMs >= startMs;
  });

  const unavailableBeforeCount = db.unavailableBlocks.length;
  db.unavailableBlocks = db.unavailableBlocks.filter((block) => {
    if (block.syncSource !== "cliniko") return true;
    const startsAtMs = new Date(block.startsAt || "").getTime();
    return !Number.isFinite(startsAtMs) || startsAtMs >= startMs;
  });

  const remainingClientIds = new Set([
    ...db.appointments.map((appointment) => appointment.clientId),
    ...db.referrals.map((referral) => referral.clientId),
    ...db.treatmentNotes.map((note) => note.clientId),
    ...db.reports.map((report) => report.clientId)
  ].filter(Boolean));
  const clientBeforeCount = db.clients.length;
  db.clients = db.clients.filter((client) =>
    client.syncSource !== "cliniko"
    || remainingClientIds.has(client.id)
  );

  return {
    appointments: beforeCount - db.appointments.length,
    clients: clientBeforeCount - db.clients.length,
    unavailableBlocks: unavailableBeforeCount - db.unavailableBlocks.length
  };
}

function removeMissingClinikoUnavailableBlocks(db, incomingClinikoIds, enabledBusinessIds, enabledPractitionerIds) {
  const incomingIds = new Set(incomingClinikoIds.map(String).filter(Boolean));
  const businessIds = new Set(enabledBusinessIds.map(String));
  const practitionerIds = new Set(enabledPractitionerIds.map(String));
  const { fromMs, toMs } = appointmentSyncWindow();
  const beforeCount = db.unavailableBlocks.length;

  db.unavailableBlocks = (db.unavailableBlocks || []).filter((block) => {
    if (block.syncSource !== "cliniko") return true;
    if (incomingIds.has(String(block.clinikoUnavailableBlockId || ""))) return true;
    if (!businessIds.has(String(block.clinikoBusinessId || ""))) return true;
    if (!practitionerIds.has(String(block.clinikoPractitionerId || ""))) return true;

    const startsAtMs = new Date(block.startsAt || "").getTime();
    const endsAtMs = new Date(block.endsAt || "").getTime();
    const inWindow = Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs)
      ? startsAtMs <= toMs && endsAtMs >= fromMs
      : true;
    return !inWindow;
  });

  return beforeCount - db.unavailableBlocks.length;
}

function markMissingClinikoAppointmentsOutOfScope(db, incomingClinikoIds, enabledBusinessIds, enabledPractitionerIds) {
  const incomingIds = new Set(incomingClinikoIds.map(String).filter(Boolean));
  const businessIds = new Set(enabledBusinessIds.map(String));
  const practitionerIds = new Set(enabledPractitionerIds.map(String));
  const { fromMs, toMs } = appointmentSyncWindow();
  const now = Date.now();
  let count = 0;

  for (const appointment of db.appointments || []) {
    if (!appointment.clinikoId || appointment.syncSource !== "cliniko") continue;
    if (incomingIds.has(String(appointment.clinikoId))) continue;
    if (!businessIds.has(String(appointment.clinikoBusinessId || ""))) continue;
    if (!practitionerIds.has(String(appointment.clinikoPractitionerId || ""))) continue;

    const startsAtMs = new Date(appointment.startsAt || "").getTime();
    if (Number.isFinite(startsAtMs) && (startsAtMs < fromMs || startsAtMs > toMs)) continue;

    const localCreatedMs = new Date(appointment.createdAt || appointment.updatedAt || "").getTime();
    if (Number.isFinite(localCreatedMs) && now - localCreatedMs < 2 * 60 * 1000) continue;

    appointment.status = "cancelled";
    appointment.clinikoStatus = "not_returned_by_cliniko";
    appointment.syncStatus = "out_of_scope";
    appointment.syncError = "Not returned by Cliniko for the active location/practitioner/date filter. It may have been moved, deleted, or changed in Cliniko.";
    count += 1;
  }

  return count;
}

function mapClinikoBusiness(business) {
  const businessId = linkedId(business);
  const addressParts = [
    business.address_1 || business.address,
    business.address_2,
    business.city,
    business.state,
    business.post_code
  ].filter(Boolean);

  return {
    id: `location-cliniko-${businessId}`,
    clinikoBusinessId: businessId,
    name: business.business_name || business.name || business.display_name || `Cliniko location ${businessId}`,
    displayName: business.display_name || business.business_name || business.name || `Cliniko location ${businessId}`,
    address: addressParts.join(", "),
    timeZone: business.time_zone_identifier || business.time_zone || "",
    archivedAt: business.archived_at || "",
    clinikoUpdatedAt: business.updated_at || "",
    syncStatus: "synced",
    syncSource: "cliniko"
  };
}

function mergeClinikoLocations(db, businesses) {
  db.clinikoLocations ||= [];
  const existingByClinikoId = new Map(db.clinikoLocations.map((item) => [String(item.clinikoBusinessId || ""), item]));

  for (const mapped of businesses.map(mapClinikoBusiness)) {
    if (!mapped.clinikoBusinessId) continue;
    const existing = existingByClinikoId.get(String(mapped.clinikoBusinessId));
    if (existing) {
      Object.assign(existing, { ...existing, ...mapped, id: existing.id, enabled: Boolean(existing.enabled) });
    } else {
      db.clinikoLocations.push({
        ...mapped,
        enabled: false,
        enabledAt: "",
        disabledAt: ""
      });
    }
  }

  applyPreferredClinikoLocationScope(db);
  chooseEnabledClinikoLocation(db);
}

function applyPreferredClinikoLocationScope(db) {
  const current = config();
  if (current.activeBusinessId || current.allowMultipleLocations) return;
  const locations = db.clinikoLocations || [];
  const preferredLocations = locations.filter(isPreferredClinikoMobileLocation);
  if (!preferredLocations.length) {
    for (const location of locations) {
      location.clinikoOutOfScope = false;
    }
    return;
  }

  const keep = preferredLocations[0];
  const now = new Date().toISOString();
  for (const location of locations) {
    const isPreferred = location.id === keep.id;
    location.clinikoOutOfScope = !isPreferred;
    location.enabled = isPreferred;
    if (isPreferred) location.enabledAt ||= now;
    if (!isPreferred) location.disabledAt ||= now;
  }
}

function isPreferredClinikoMobileLocation(location = {}) {
  const value = normaliseLocationText([
    location.displayName,
    location.name,
    location.address
  ].filter(Boolean).join(" "));
  return value.includes("refine physio mobile")
    || value.includes("refine physiotherapy mobile")
    || value.includes("refine mobile physio")
    || value.includes("refine mobile physiotherapy");
}

function normaliseLocationText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function chooseEnabledClinikoLocation(db) {
  const current = config();
  const locations = db.clinikoLocations || [];
  if (!locations.length) return;

  if (current.activeBusinessId) {
    for (const location of locations) {
      location.enabled = String(location.clinikoBusinessId) === String(current.activeBusinessId);
      location.enabledAt ||= location.enabled ? new Date().toISOString() : "";
      if (!location.enabled) location.disabledAt ||= new Date().toISOString();
    }
    return;
  }

  const enabled = locations.filter((location) => location.enabled);
  if (!enabled.length) return;

  const keep = enabled[0];
  if (!current.allowMultipleLocations) {
    for (const location of locations) {
      const shouldEnable = location.id === keep.id;
      if (location.enabled !== shouldEnable) {
        location.enabled = shouldEnable;
        if (shouldEnable) location.enabledAt = new Date().toISOString();
        if (!shouldEnable) location.disabledAt = new Date().toISOString();
      }
    }
  }
}

export function updateClinikoLocationEnabled(db, locationId, enabled) {
  ensureCollections(db);
  const location = db.clinikoLocations.find((item) => item.id === locationId || String(item.clinikoBusinessId) === String(locationId));
  if (!location) return { status: 404, error: "Cliniko location not found. Run Sync Now first to import locations." };
  if (enabled && location.clinikoOutOfScope) {
    return { status: 400, error: "Only the Refine Physio Mobile Cliniko location can be enabled for this app." };
  }

  const now = new Date().toISOString();
  const current = config();
  if (enabled && !current.allowMultipleLocations) {
    for (const item of db.clinikoLocations) {
      item.enabled = item.id === location.id;
      item.enabledAt = item.enabled ? now : item.enabledAt || "";
      if (!item.enabled) item.disabledAt = now;
    }
  } else {
    location.enabled = Boolean(enabled);
    if (location.enabled) location.enabledAt = now;
    if (!location.enabled) location.disabledAt = now;
  }

  return { location, locations: db.clinikoLocations };
}

export function enabledClinikoBusinessIds(db) {
  const current = config();
  if (current.activeBusinessId) return [String(current.activeBusinessId)];
  return (db.clinikoLocations || [])
    .filter((location) => location.enabled && !location.clinikoOutOfScope)
    .map((location) => String(location.clinikoBusinessId))
    .filter(Boolean);
}

function clinikoPractitionerCandidates(db) {
  return (db.users || [])
    .filter((user) => user.role === "contractor" && user.clinikoPractitionerId)
    .filter((user) => user.isActive !== false && !user.clinikoOutOfScope)
    .filter((user) => user.syncSource === "cliniko" || user.requiresLoginSetup || user.clinikoUpdatedAt || user.clinikoSyncEnabled);
}

function chooseEnabledClinikoPractitioner(db) {
  const current = config();
  const practitioners = clinikoPractitionerCandidates(db);
  if (!practitioners.length) return;

  if (current.activePractitionerIds.length) {
    const activeIds = new Set(current.activePractitionerIds.map(String));
    for (const practitioner of practitioners) {
      practitioner.clinikoSyncEnabled = activeIds.has(String(practitioner.clinikoPractitionerId));
      practitioner.clinikoSyncEnabledAt ||= practitioner.clinikoSyncEnabled ? new Date().toISOString() : "";
      if (!practitioner.clinikoSyncEnabled) practitioner.clinikoSyncDisabledAt ||= new Date().toISOString();
    }
    return;
  }

  const enabled = practitioners.filter((practitioner) => practitioner.clinikoSyncEnabled);
  if (!enabled.length) return;

  const keep = enabled[0];
  if (!current.allowMultiplePractitioners) {
    for (const practitioner of practitioners) {
      const shouldEnable = practitioner.id === keep.id;
      if (practitioner.clinikoSyncEnabled !== shouldEnable) {
        practitioner.clinikoSyncEnabled = shouldEnable;
        if (shouldEnable) practitioner.clinikoSyncEnabledAt = new Date().toISOString();
        if (!shouldEnable) practitioner.clinikoSyncDisabledAt = new Date().toISOString();
      }
    }
  }
}

export function updateClinikoPractitionerEnabled(db, practitionerId, enabled) {
  ensureCollections(db);
  const practitioner = (db.users || []).find((item) =>
    item.id === practitionerId || String(item.clinikoPractitionerId || "") === String(practitionerId)
  );
  if (!practitioner) return { status: 404, error: "Cliniko practitioner not found. Run Sync Now first to import practitioners." };
  if (!practitioner.clinikoPractitionerId) return { status: 400, error: "This user is not linked to a Cliniko practitioner." };

  const now = new Date().toISOString();
  const current = config();
  if (enabled && !current.allowMultiplePractitioners) {
    for (const item of clinikoPractitionerCandidates(db)) {
      item.clinikoSyncEnabled = item.id === practitioner.id;
      item.clinikoSyncEnabledAt = item.clinikoSyncEnabled ? now : item.clinikoSyncEnabledAt || "";
      if (!item.clinikoSyncEnabled) item.clinikoSyncDisabledAt = now;
    }
  } else {
    practitioner.clinikoSyncEnabled = Boolean(enabled);
    if (practitioner.clinikoSyncEnabled) practitioner.clinikoSyncEnabledAt = now;
    if (!practitioner.clinikoSyncEnabled) practitioner.clinikoSyncDisabledAt = now;
  }

  return { practitioner, practitioners: clinikoPractitionerCandidates(db) };
}

export function enabledClinikoPractitionerIds(db) {
  const current = config();
  if (current.activePractitionerIds.length) return current.activePractitionerIds.map(String);
  return clinikoPractitionerCandidates(db)
    .filter((practitioner) => practitioner.clinikoSyncEnabled)
    .map((practitioner) => String(practitioner.clinikoPractitionerId))
    .filter(Boolean);
}

function syncLog(db, event) {
  db.clinikoSyncLogs ||= [];
  db.clinikoSyncLogs.push({
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...event
  });
  if (db.clinikoSyncLogs.length > 200) db.clinikoSyncLogs = db.clinikoSyncLogs.slice(-200);
}

function recordSyncError(db, entityType, entityId, error, operation) {
  const message = clinikoErrorMessage(error);
  db.syncErrors ||= [];
  db.syncErrors.push({
    id: `sync-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityType,
    entityId,
    operation,
    message,
    status: error?.status || "",
    createdAt: new Date().toISOString()
  });
  if (db.syncErrors.length > 200) db.syncErrors = db.syncErrors.slice(-200);
  syncLog(db, { status: "failed", operation, entityType, entityId, message });
  return message;
}

function clinikoErrorMessage(error) {
  const base = error?.payload?.message || error?.message || String(error);
  const details = clinikoPayloadDetails(error?.payload);
  return details ? `${base}: ${details}` : base;
}

function clinikoPayloadDetails(payload) {
  const errors = payload?.errors || payload?.error;
  if (!errors) return "";
  if (Array.isArray(errors)) {
    return errors.map((item) => String(item?.message || item)).filter(Boolean).join("; ");
  }
  if (typeof errors === "object") {
    return Object.entries(errors)
      .map(([field, value]) => {
        const messages = Array.isArray(value) ? value : [value];
        return `${field} ${messages.map((item) => String(item?.message || item)).join(", ")}`;
      })
      .join("; ");
  }
  return String(errors);
}

function mapClinikoPatient(patient) {
  const patientId = linkedId(patient);
  const addressParts = [
    patient.address_1 || patient.address,
    patient.address_2,
    patient.city,
    patient.state,
    patient.post_code
  ].filter(Boolean);

  return {
    id: `client-cliniko-${patientId}`,
    clinikoPatientId: patientId,
    name: fullName(patient),
    dob: patient.date_of_birth || "",
    address: addressParts.join(", "),
    suburb: patient.city || "",
    phone: patientPhoneNumber(patient),
    email: patient.email || "",
    fundingType: "",
    emergencyContact: "",
    risks: "",
    diagnosis: "",
    goals: "",
    clinikoUpdatedAt: patient.updated_at || "",
    syncStatus: "synced",
    syncSource: "cliniko"
  };
}

function patientPhoneNumber(patient) {
  const phoneNumbers = Array.isArray(patient?.patient_phone_numbers)
    ? patient.patient_phone_numbers
    : Array.isArray(patient?.phone_numbers)
    ? patient.phone_numbers
    : [];
  const mobile = phoneNumbers.find((phone) => String(phone?.phone_type || "").toLowerCase() === "mobile");
  const smsCapable = phoneNumbers.find((phone) => String(phone?.phone_type || "").toLowerCase().includes("mobile"));
  const first = mobile || smsCapable || phoneNumbers.find((phone) => phone?.number);
  return first?.number || patient.phone_number || patient.mobile_number || "";
}

function mapClinikoAppointmentType(type) {
  const typeId = linkedId(type);
  return {
    id: `appt-type-cliniko-${typeId}`,
    clinikoAppointmentTypeId: typeId,
    name: type.name || "Appointment",
    durationMinutes: type.duration_in_minutes || 60,
    color: type.color || "",
    archivedAt: type.archived_at || "",
    updatedAt: type.updated_at || "",
    syncStatus: "synced"
  };
}

function mapClinikoUnavailableBlockType(type) {
  const typeId = linkedId(type);
  return {
    id: `unavailable-type-cliniko-${typeId}`,
    clinikoUnavailableBlockTypeId: typeId,
    name: type.name || "Unavailable",
    color: type.color || "",
    archivedAt: type.archived_at || "",
    updatedAt: type.updated_at || "",
    syncStatus: "synced"
  };
}

function practitionerDailyAvailabilityPath(practitionerId, businessId) {
  const params = new URLSearchParams({ per_page: "100" });
  if (businessId) params.append("q[]", `business_id:=${businessId}`);
  return `/practitioners/${encodeURIComponent(practitionerId)}/daily_availabilities?${params.toString()}`;
}

function syncClinikoWorkingHours(db, dailyAvailabilities, options = {}) {
  const scopedPractitionerIds = new Set((options.practitionerIds || []).map(String).filter(Boolean));
  const hoursByPractitioner = new Map();
  for (const availability of dailyAvailabilities || []) {
    const practitionerId = linkedIdFromRecord(availability, "practitioner");
    const businessId = linkedIdFromRecord(availability, "business");
    const dayOfWeek = Number(availability.day_of_week);
    if (!practitionerId || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;

    const segments = Array.isArray(availability.availabilities) ? availability.availabilities : [];
    const validSegments = segments
      .map((segment) => ({
        start: normaliseClinikoTime(segment.starts_at),
        end: normaliseClinikoTime(segment.ends_at),
        businessId,
        timeZoneIdentifier: availability.time_zone_identifier || ""
      }))
      .filter((segment) => segment.start && segment.end && minutesFromTime(segment.end) > minutesFromTime(segment.start))
      .sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start));

    if (!validSegments.length) continue;
    const practitionerHours = hoursByPractitioner.get(practitionerId) || {};
    practitionerHours[String(dayOfWeek)] ||= [];
    practitionerHours[String(dayOfWeek)].push(...validSegments);
    hoursByPractitioner.set(practitionerId, practitionerHours);
  }

  let updated = 0;
  let withHours = 0;
  const syncedAt = new Date().toISOString();
  for (const user of db.users || []) {
    const practitionerId = String(user.clinikoPractitionerId || "");
    if (!practitionerId || (scopedPractitionerIds.size && !scopedPractitionerIds.has(practitionerId))) continue;
    const workingHoursByDay = sortWorkingHoursByDay(hoursByPractitioner.get(practitionerId) || {});
    const range = workingHoursRange(workingHoursByDay);
    user.workingHoursByDay = workingHoursByDay;
    user.workingHoursSource = "cliniko_daily_availability";
    user.workingHoursSyncedAt = syncedAt;
    if (range.start && range.end) {
      user.workingStart = range.start;
      user.workingEnd = range.end;
      withHours += 1;
    } else {
      user.workingStart = "";
      user.workingEnd = "";
    }
    updated += 1;
  }
  return { updated, withHours };
}

function sortWorkingHoursByDay(workingHoursByDay) {
  return Object.fromEntries(
    Object.entries(workingHoursByDay)
      .map(([day, segments]) => [
        day,
        segments.sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start))
      ])
      .sort(([dayA], [dayB]) => Number(dayA) - Number(dayB))
  );
}

function workingHoursRange(workingHoursByDay) {
  const segments = Object.values(workingHoursByDay).flat();
  if (!segments.length) return { start: "", end: "" };
  return {
    start: segments.reduce((earliest, segment) =>
      minutesFromTime(segment.start) < minutesFromTime(earliest) ? segment.start : earliest, segments[0].start),
    end: segments.reduce((latest, segment) =>
      minutesFromTime(segment.end) > minutesFromTime(latest) ? segment.end : latest, segments[0].end)
  };
}

function normaliseClinikoTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutesFromTime(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function upsertClinikoPractitioners(db, practitioners, options = {}) {
  const incomingPractitionerIds = new Set();
  for (const practitioner of practitioners) {
    const practitionerId = linkedId(practitioner);
    if (!practitionerId) continue;
    incomingPractitionerIds.add(practitionerId);
    const name = fullName(practitioner);
    const existing = db.users.find((user) => String(user.clinikoPractitionerId || "") === practitionerId);
    if (existing) {
      existing.name = name || existing.name;
      existing.email = practitioner.email || existing.email || "";
      existing.role = existing.role || "contractor";
      if (existing.clinikoOutOfScope) existing.isActive = true;
      existing.discipline = existing.discipline || "Physiotherapy";
      existing.syncSource = "cliniko";
      existing.syncStatus = "synced";
      existing.clinikoOutOfScope = false;
      existing.clinikoSyncEnabled = Boolean(existing.clinikoSyncEnabled);
      existing.clinikoUpdatedAt = practitioner.updated_at || existing.clinikoUpdatedAt || "";
      continue;
    }

    db.users.push({
      id: `practitioner-cliniko-${practitionerId}`,
      name,
      email: practitioner.email || "",
      role: "contractor",
      discipline: "Physiotherapy",
      clinikoPractitionerId: practitionerId,
      phone: practitioner.phone_number || "",
      baseSuburb: "",
      requiresLoginSetup: true,
      clinikoSyncEnabled: false,
      clinikoSyncEnabledAt: "",
      clinikoSyncDisabledAt: "",
      clinikoOutOfScope: false,
      syncSource: "cliniko",
      syncStatus: "synced",
      clinikoUpdatedAt: practitioner.updated_at || ""
    });
  }

  if (options.replaceActiveLocationScope) {
    removeClinikoPractitionersOutsideActiveLocations(db, incomingPractitionerIds);
  }

  chooseEnabledClinikoPractitioner(db);
}

function removeClinikoPractitionersOutsideActiveLocations(db, activeLocationPractitionerIds) {
  const allowedIds = new Set([...activeLocationPractitionerIds].map(String));
  db.users = (db.users || []).filter((user) => {
    const practitionerId = String(user.clinikoPractitionerId || "");
    const isClinikoContractor = user.role === "contractor" && practitionerId && user.syncSource === "cliniko";
    if (!isClinikoContractor || allowedIds.has(practitionerId)) return true;

    user.clinikoSyncEnabled = false;
    user.clinikoOutOfScope = true;
    user.syncStatus = "out_of_scope";
    if (!clinikoPractitionerHasLocalWork(db, user.id)) return false;
    user.isActive = false;
    return true;
  });
}

function clinikoPractitionerHasLocalWork(db, userId) {
  return Boolean(
    (db.appointments || []).some((appointment) => appointment.contractorId === userId)
    || (db.reports || []).some((report) => report.contractorId === userId)
    || (db.treatmentNotes || []).some((note) => note.contractorId === userId)
    || (db.referrals || []).some((referral) => referral.assignedContractorId === userId)
    || (db.approvalRequests || []).some((request) => request.contractorId === userId)
  );
}

function mapClinikoUnavailableBlock(block, db) {
  const clinikoId = linkedId(block);
  const practitionerId = linkedIdFromRecord(block, "practitioner");
  const businessId = linkedIdFromRecord(block, "business");
  const typeId = linkedIdFromRecord(block, "unavailable_block_type");
  const contractor = db.users.find((user) => String(user.clinikoPractitionerId || "") === practitionerId);
  const location = db.clinikoLocations.find((item) => String(item.clinikoBusinessId || "") === businessId);
  const blockType = db.unavailableBlockTypes.find((item) => String(item.clinikoUnavailableBlockTypeId || "") === typeId);
  const startsAt = block.starts_at || "";
  const endsAt = block.ends_at || "";
  const label = blockType?.name || block.unavailable_block_type?.name || block.name || "Unavailable";
  const note = block.notes || block.note || block.description || "";

  if (!clinikoId || !contractor || !startsAt || !endsAt || block.archived_at || block.deleted_at) return null;

  return {
    id: `unavailable-cliniko-${clinikoId}`,
    clinikoUnavailableBlockId: clinikoId,
    clinikoUnavailableBlockTypeId: typeId,
    clinikoBusinessId: businessId,
    clinikoLocationId: location?.id || "",
    clinikoPractitionerId: practitionerId,
    contractorId: contractor.id,
    kind: normaliseLocationText(`${label} ${note}`).includes("travel") ? "travel" : "unavailable",
    label,
    note,
    startsAt,
    endsAt,
    startsAtLocal: brisbaneLocalDateTimeFromIso(startsAt),
    endsAtLocal: brisbaneLocalDateTimeFromIso(endsAt),
    readOnly: true,
    syncSource: "cliniko",
    syncStatus: "synced",
    clinikoStatus: "synced",
    clinikoUpdatedAt: block.updated_at || "",
    createdAt: block.created_at || new Date().toISOString()
  };
}

function brisbaneLocalDateTimeFromIso(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function mapClinikoAppointment(appointment, db) {
  const clinikoId = linkedId(appointment);
  const patientId = linkedIdFromRecord(appointment, "patient");
  const practitionerId = linkedIdFromRecord(appointment, "practitioner");
  const appointmentTypeId = linkedIdFromRecord(appointment, "appointment_type");
  const businessId = linkedIdFromRecord(appointment, "business");
  const client = db.clients.find((item) => String(item.clinikoPatientId || "") === patientId);
  const contractor = db.users.find((user) => String(user.clinikoPractitionerId || "") === practitionerId);
  const appointmentType = db.appointmentTypes.find((item) => String(item.clinikoAppointmentTypeId || "") === appointmentTypeId);
  const location = db.clinikoLocations.find((item) => String(item.clinikoBusinessId || "") === businessId);

  if (!clinikoId || !client || !contractor) return null;

  return {
    id: `appt-cliniko-${clinikoId}`,
    clinikoId,
    clinikoAppointmentTypeId: appointmentTypeId,
    clinikoBusinessId: businessId,
    clinikoLocationId: location?.id || "",
    clinikoPatientId: patientId,
    clinikoPractitionerId: practitionerId,
    clinikoUpdatedAt: appointment.updated_at || "",
    clinikoStatus: appointment.cancelled_at ? "cancelled_in_cliniko" : "synced",
    syncStatus: "synced",
    syncSource: "cliniko",
    clientId: client.id,
    contractorId: contractor.id,
    serviceType: contractor.discipline || "Physiotherapy",
    appointmentType: appointmentType?.name || appointment.appointment_type?.name || "",
    contactNumber: client.phone || "",
    clinikoAppointmentNote: appointment.notes || "",
    reasonForReferral: appointment.notes || "",
    startsAt: appointment.starts_at || "",
    endsAt: appointment.ends_at || "",
    address: client.address,
    status: appointment.cancelled_at ? "cancelled" : appointment.did_not_arrive ? "no-show" : appointment.patient_arrived ? "completed" : "booked",
    travelWindow: "",
    notesComplete: Number(appointment.treatment_note_status) === 90,
    reportDue: false,
    recurrence: appointmentType?.name || appointment.appointment_type?.name || "",
    rebookedFromAppointmentId: "",
    rebookReason: "",
    createdBy: "cliniko",
    createdAt: appointment.created_at || new Date().toISOString()
  };
}

export async function syncCliniko(db) {
  ensureCollections(db);
  if (!config().apiKey) {
    const sync = {
      status: "not_connected",
      lastSyncAt: null,
      message: "Add a test CLINIKO_API_KEY to .env to enable read-only Cliniko sync."
    };
    syncLog(db, { status: sync.status, operation: "read_sync", message: sync.message });
    return { db, sync };
  }

  const startedAt = new Date().toISOString();
  try {
    const [businesses, appointmentTypes, unavailableBlockTypes] = await Promise.all([
      listResource("/businesses?per_page=100", "businesses"),
      listResource("/appointment_types?per_page=100", "appointment_types"),
      listOptionalResource("/unavailable_block_types?per_page=100", "unavailable_block_types")
    ]);

    mergeClinikoLocations(db, businesses);
    mergeByExternalId(db.appointmentTypes, appointmentTypes.map(mapClinikoAppointmentType), "clinikoAppointmentTypeId");
    mergeByExternalId(db.unavailableBlockTypes, unavailableBlockTypes.map(mapClinikoUnavailableBlockType), "clinikoUnavailableBlockTypeId");

    const enabledBusinessIds = enabledClinikoBusinessIds(db);
    const practitionerPages = enabledBusinessIds.length
      ? await Promise.all(enabledBusinessIds.map((businessId) =>
        listResource(`/businesses/${encodeURIComponent(businessId)}/practitioners?per_page=100`, "practitioners")
      ))
      : [];
    const practitioners = [...new Map(practitionerPages.flat().map((practitioner) => [linkedId(practitioner), practitioner])).values()];
    upsertClinikoPractitioners(db, practitioners, { replaceActiveLocationScope: enabledBusinessIds.length > 0 });
    const practitionerAvailabilityFilters = enabledBusinessIds.flatMap((businessId) =>
      practitioners.map((practitioner) => ({ businessId, practitionerId: linkedId(practitioner) })).filter((item) => item.practitionerId)
    );
    const dailyAvailabilityPages = practitionerAvailabilityFilters.length
      ? await Promise.all(practitionerAvailabilityFilters.map(({ businessId, practitionerId }) =>
        listResource(practitionerDailyAvailabilityPath(practitionerId, businessId), "daily_availabilities")
      ))
      : [];
    const dailyAvailabilities = [...new Map(dailyAvailabilityPages.flat().map((availability) => [linkedId(availability), availability])).values()];
    const workingHoursSync = syncClinikoWorkingHours(db, dailyAvailabilities, {
      practitionerIds: practitioners.map((practitioner) => linkedId(practitioner)).filter(Boolean)
    });

    const enabledPractitionerIds = enabledClinikoPractitionerIds(db);
    const syncStartIso = appointmentSyncStartIso();
    const appointmentFilters = enabledBusinessIds.flatMap((businessId) =>
      enabledPractitionerIds.map((practitionerId) => ({ businessId, practitionerId }))
    );
    const [appointmentPages, unavailableBlockPages] = appointmentFilters.length
      ? await Promise.all([
        Promise.all(appointmentFilters.map(({ businessId, practitionerId }) =>
          listResource(appointmentSyncPath(businessId, practitionerId), "individual_appointments")
        )),
        Promise.all(appointmentFilters.map(({ businessId, practitionerId }) =>
          listOptionalResource(unavailableBlockSyncPath(businessId, practitionerId), "unavailable_blocks")
        ))
      ])
      : [[], []];
    const appointments = [...new Map(appointmentPages.flat().map((appointment) => [linkedId(appointment), appointment])).values()];
    const unavailableBlocks = [...new Map(unavailableBlockPages.flat().map((block) => [linkedId(block), block])).values()];
    const patientIds = [...new Set(appointments.map((appointment) => linkedIdFromRecord(appointment, "patient")).filter(Boolean))];
    const patients = patientIds.length
      ? await Promise.all(patientIds.map((patientId) => clinikoFetch(`/patients/${encodeURIComponent(patientId)}`)))
      : [];
    mergeByExternalId(db.clients, patients.map(mapClinikoPatient), "clinikoPatientId");
    const incomingAppointments = appointments
      .map((appointment) => mapClinikoAppointment(appointment, db))
      .filter(Boolean);
    mergeByExternalId(db.appointments, incomingAppointments, "clinikoId");
    const incomingUnavailableBlocks = unavailableBlocks
      .map((block) => mapClinikoUnavailableBlock(block, db))
      .filter(Boolean);
    mergeByExternalId(db.unavailableBlocks, incomingUnavailableBlocks, "clinikoUnavailableBlockId");
    const removedUnavailableBlocksNotReturned = removeMissingClinikoUnavailableBlocks(
      db,
      unavailableBlocks.map((block) => linkedId(block)).filter(Boolean),
      enabledBusinessIds,
      enabledPractitionerIds
    );
    const staleAppointmentsNotReturned = markMissingClinikoAppointmentsOutOfScope(
      db,
      appointments.map((appointment) => linkedId(appointment)).filter(Boolean),
      enabledBusinessIds,
      enabledPractitionerIds
    );
    const prunedBeforeStart = pruneClinikoRecordsBeforeStart(db, syncStartIso);
    const skippedAppointments = appointments.length - incomingAppointments.length;

    const sync = {
      status: "connected",
      startedAt,
      lastSyncAt: new Date().toISOString(),
      mode: "read_only",
      counts: {
        patients: patients.length,
        practitioners: practitioners.length,
        appointmentTypes: appointmentTypes.length,
        locations: businesses.length,
        enabledLocations: enabledBusinessIds.length,
        enabledPractitioners: enabledPractitionerIds.length,
        practitionersWithWorkingHours: workingHoursSync.withHours,
        practitionersCheckedForWorkingHours: workingHoursSync.updated,
        appointments: incomingAppointments.length,
        unavailableBlocks: incomingUnavailableBlocks.length,
        unavailableBlockTypes: unavailableBlockTypes.length,
        removedUnavailableBlocksNotReturned,
        skippedAppointments,
        staleAppointmentsNotReturned,
        prunedAppointmentsBeforeStart: prunedBeforeStart.appointments,
        prunedPatientsBeforeStart: prunedBeforeStart.clients,
        prunedUnavailableBlocksBeforeStart: prunedBeforeStart.unavailableBlocks
      },
      message: appointmentFilters.length
        ? `Read-only sync imported ${patients.length} appointment-linked patients, ${practitioners.length} practitioners, ${appointmentTypes.length} appointment types, ${businesses.length} locations, ${workingHoursSync.withHours} Cliniko working-hour schedule${workingHoursSync.withHours === 1 ? "" : "s"}, ${incomingAppointments.length} appointments, and ${incomingUnavailableBlocks.length} unavailable block${incomingUnavailableBlocks.length === 1 ? "" : "s"} from ${enabledBusinessIds.length} enabled Cliniko location${enabledBusinessIds.length === 1 ? "" : "s"} and ${enabledPractitionerIds.length} enabled practitioner${enabledPractitionerIds.length === 1 ? "" : "s"}${config().syncStartDate ? ` from ${config().syncStartDate}` : ""}${skippedAppointments ? ` (${skippedAppointments} skipped because patient or practitioner links were missing)` : ""}${staleAppointmentsNotReturned ? ` (${staleAppointmentsNotReturned} synced appointment${staleAppointmentsNotReturned === 1 ? "" : "s"} no longer returned by Cliniko marked out of scope)` : ""}${removedUnavailableBlocksNotReturned ? ` (${removedUnavailableBlocksNotReturned} unavailable block${removedUnavailableBlocksNotReturned === 1 ? "" : "s"} removed because Cliniko no longer returned them)` : ""}${prunedBeforeStart.appointments ? ` (${prunedBeforeStart.appointments} older synced appointment${prunedBeforeStart.appointments === 1 ? "" : "s"} removed)` : ""}${prunedBeforeStart.unavailableBlocks ? ` (${prunedBeforeStart.unavailableBlocks} older unavailable block${prunedBeforeStart.unavailableBlocks === 1 ? "" : "s"} removed)` : ""}.`
        : enabledBusinessIds.length
        ? `Setup sync imported ${practitioners.length} practitioner${practitioners.length === 1 ? "" : "s"} from the selected Cliniko location, ${workingHoursSync.withHours} Cliniko working-hour schedule${workingHoursSync.withHours === 1 ? "" : "s"}, and ${appointmentTypes.length} appointment types. Choose one Cliniko practitioner, then run Sync Now again before patient appointments are imported.`
        : `Setup sync imported ${appointmentTypes.length} appointment types and ${businesses.length} locations. Choose one Cliniko location, then run Sync Now again to import practitioners for that location.`
    };
    syncLog(db, { status: "synced", operation: "read_sync", message: sync.message });
    return { db, sync };
  } catch (error) {
    const message = recordSyncError(db, "cliniko", "sync", error, "read_sync");
    return {
      db,
      sync: {
        status: "failed",
        startedAt,
        lastSyncAt: new Date().toISOString(),
        message
      }
    };
  }
}

export function reportPdfFilename(patientName, reportType, appointmentDate, practitionerName) {
  return `${patientName} - ${reportType} - ${appointmentDate} - ${practitionerName}.pdf`
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function treatmentNotePdfFilename(appointmentDate, patientName) {
  return `${appointmentDate} - notes - ${patientName}.pdf`
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export async function createClinikoAppointmentFromApp(db, appointment) {
  ensureCollections(db);
  const current = config();
  if (!appointment) return { status: "failed", message: "Appointment is missing." };
  if (appointment.clinikoId) return { skipped: true, status: "synced", message: "Appointment is already linked to Cliniko." };
  if (!current.appointmentCreateEnabled) {
    appointment.syncStatus = appointment.syncStatus || "pending";
    appointment.clinikoStatus = appointment.clinikoStatus || "pending_push";
    return { skipped: true, status: "not_enabled", message: "Cliniko appointment creation is disabled." };
  }
  if (!current.apiKey) {
    const message = "CLINIKO_API_KEY is not configured.";
    appointment.syncStatus = "failed";
    appointment.syncError = message;
    recordSyncError(db, "appointment", appointment.id, new ClinikoApiError(message), "appointment_create");
    return { status: "failed", message };
  }

  try {
    const client = db.clients.find((item) => item.id === appointment.clientId);
    const contractor = db.users.find((user) => user.id === appointment.contractorId);
    if (!client) return markAppointmentCreateFailed(db, appointment, "Client not found.");
    if (!contractor?.clinikoPractitionerId) return markAppointmentCreateFailed(db, appointment, "Practitioner is not linked to a Cliniko practitioner.");
    if (!clinikoPractitionerIsEnabledForWrites(db, contractor)) {
      return markAppointmentCreateFailed(
        db,
        appointment,
        `${contractor.name || "This practitioner"} is not enabled for Cliniko sync. Switch to an enabled Cliniko practitioner or enable this practitioner in Admin > Cliniko before booking from this app.`
      );
    }

    const patient = await ensureClinikoPatientForClient(db, client);
    if (patient.status !== "synced") return markAppointmentCreateFailed(db, appointment, patient.message || "Cliniko patient creation failed.");

    const payload = buildClinikoAppointmentCreatePayload(db, appointment, client, contractor);
    if (payload.error) return markAppointmentCreateFailed(db, appointment, payload.error);

    appointment.syncStatus = "pending";
    appointment.syncError = "";
    appointment.clinikoStatus = "pending_push";
    const created = await clinikoFetch("/individual_appointments", {
      method: "POST",
      body: JSON.stringify(payload.body)
    });
    applyClinikoCreatedAppointment(db, appointment, created, payload.body);
    syncLog(db, {
      status: "synced",
      operation: "appointment_create",
      entityType: "appointment",
      entityId: appointment.id,
      message: "Appointment created in Cliniko."
    });
    return { status: "synced", appointment };
  } catch (error) {
    const message = recordSyncError(db, "appointment", appointment.id, error, "appointment_create");
    appointment.syncStatus = "failed";
    appointment.syncError = message;
    appointment.clinikoStatus = "create_failed";
    return { status: "failed", message };
  }
}

function clinikoPractitionerIsEnabledForWrites(db, contractor) {
  const practitionerId = String(contractor?.clinikoPractitionerId || "").trim();
  if (!practitionerId) return false;
  return enabledClinikoPractitionerIds(db).includes(practitionerId);
}

async function ensureClinikoPatientForClient(db, client) {
  const existingPatientId = String(client?.clinikoPatientId || "").trim();
  if (existingPatientId) {
    const existing = await verifyExistingClinikoPatientLink(db, client, existingPatientId);
    if (existing.status === "synced" || existing.status === "failed") return existing;
  }

  const current = config();
  if (!current.patientCreateEnabled) {
    return { status: "not_enabled", message: "Client is not linked to Cliniko and Cliniko patient creation is disabled." };
  }

  const payload = buildClinikoPatientCreatePayload(client);
  try {
    client.syncStatus = "pending";
    client.syncError = "";
    const created = await clinikoFetch("/patients", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const patientId = linkedId(created);
    if (!patientId) {
      throw new ClinikoApiError("Cliniko created a patient but did not return an ID.");
    }
    client.clinikoPatientId = patientId;
    client.clinikoUpdatedAt = created.updated_at || client.clinikoUpdatedAt || "";
    client.syncStatus = "synced";
    client.syncError = "";
    client.syncSource = client.syncSource || "cliniko";
    syncLog(db, {
      status: "synced",
      operation: "patient_create",
      entityType: "client",
      entityId: client.id,
      message: "Patient created in Cliniko for app booking."
    });
    return { status: "synced", patientId, client };
  } catch (error) {
    const message = recordSyncError(db, "client", client.id, error, "patient_create");
    client.syncStatus = "failed";
    client.syncError = message;
    return { status: "failed", message };
  }
}

async function verifyExistingClinikoPatientLink(db, client, patientId) {
  try {
    await clinikoFetch(`/patients/${encodeURIComponent(patientId)}`);
    client.syncStatus = client.syncStatus === "failed" ? "synced" : client.syncStatus || "synced";
    client.syncError = "";
    return { status: "synced", patientId, client };
  } catch (error) {
    if (error?.status !== 404) {
      const message = recordSyncError(db, "client", client.id, error, "patient_link_check");
      client.syncStatus = "failed";
      client.syncError = message;
      return { status: "failed", message, client };
    }

    const message = `Cliniko patient ${patientId} was not found in the active Cliniko account. Check the Cliniko region/API key, or let the app create a new test patient.`;
    client.staleClinikoPatientId = patientId;
    client.clinikoPatientId = "";
    client.syncStatus = "failed";
    client.syncError = message;
    syncLog(db, {
      status: "failed",
      operation: "patient_link_check",
      entityType: "client",
      entityId: client.id,
      message
    });

    if (client.syncSource === "cliniko" || client.id === `client-cliniko-${patientId}`) {
      return { status: "failed", message, client };
    }

    return { status: "stale_local", message, client };
  }
}

function buildClinikoPatientCreatePayload(client) {
  const { firstName, lastName } = splitPatientName(client?.name || "New Patient");
  const body = {
    first_name: firstName,
    last_name: lastName,
    old_reference_id: client?.id || ""
  };
  if (client?.email) body.email = client.email;
  if (client?.address) body.address_1 = client.address;
  if (client?.suburb) body.city = client.suburb;
  if (client?.phone) {
    body.patient_phone_numbers = [
      {
        phone_type: "Mobile",
        number: client.phone
      }
    ];
  }
  return body;
}

function splitPatientName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "New", lastName: "Patient" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Patient" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1)
  };
}

function buildClinikoAppointmentCreatePayload(db, appointment, client, contractor) {
  const businessId = appointment.clinikoBusinessId || enabledClinikoBusinessIds(db)[0] || "";
  const appointmentTypeId = resolveClinikoAppointmentTypeId(db, appointment, appointment);
  if (!businessId) return { error: "Choose one active Cliniko location before booking from this app." };
  if (!client?.clinikoPatientId) return { error: "Client is not linked to a Cliniko patient." };
  if (!contractor?.clinikoPractitionerId) return { error: "Practitioner is not linked to a Cliniko practitioner." };
  if (!appointmentTypeId) return { error: "Selected appointment type is not linked to a Cliniko appointment type." };
  if (!appointment.startsAt || !appointment.endsAt) return { error: "Appointment start and end times are required." };

  const body = {
    appointment_type_id: String(appointmentTypeId),
    business_id: String(businessId),
    patient_id: String(client.clinikoPatientId),
    practitioner_id: String(contractor.clinikoPractitionerId),
    starts_at: appointment.startsAt,
    ends_at: appointment.endsAt
  };
  if (appointment.reasonForReferral || appointment.rebookReason) {
    body.notes = String(appointment.reasonForReferral || appointment.rebookReason).slice(0, 5000);
  }
  return { body };
}

function markAppointmentCreateFailed(db, appointment, message) {
  appointment.syncStatus = "failed";
  appointment.syncError = message;
  appointment.clinikoStatus = "create_failed";
  recordSyncError(db, "appointment", appointment.id, new ClinikoApiError(message), "appointment_create");
  return { status: "failed", message };
}

function applyClinikoCreatedAppointment(db, appointment, created, payload) {
  const clinikoId = linkedId(created);
  const typeId = linkedIdFromRecord(created, "appointment_type") || payload.appointment_type_id || "";
  const businessId = linkedIdFromRecord(created, "business") || payload.business_id || "";
  const patientId = linkedIdFromRecord(created, "patient") || payload.patient_id || "";
  const practitionerId = linkedIdFromRecord(created, "practitioner") || payload.practitioner_id || "";
  const appointmentType = db.appointmentTypes.find((item) => String(item.clinikoAppointmentTypeId || "") === String(typeId));
  const location = db.clinikoLocations.find((item) => String(item.clinikoBusinessId || "") === String(businessId));

  appointment.clinikoId = clinikoId;
  appointment.clinikoAppointmentTypeId = String(typeId || "");
  appointment.clinikoBusinessId = String(businessId || "");
  appointment.clinikoLocationId = location?.id || appointment.clinikoLocationId || "";
  appointment.clinikoPatientId = String(patientId || "");
  appointment.clinikoPractitionerId = String(practitionerId || "");
  appointment.clinikoUpdatedAt = created.updated_at || appointment.clinikoUpdatedAt || "";
  appointment.clinikoStatus = created.cancelled_at ? "cancelled_in_cliniko" : "synced";
  appointment.syncSource = "cliniko";
  appointment.syncStatus = "synced";
  appointment.syncError = "";
  appointment.startsAt = created.starts_at || payload.starts_at || appointment.startsAt;
  appointment.endsAt = created.ends_at || payload.ends_at || appointment.endsAt;
  appointment.appointmentType = appointmentType?.name || appointment.appointmentType || "";
  appointment.recurrence = appointmentType?.name || appointment.recurrence || appointment.appointmentType || "";
}

export async function updateClinikoAppointmentFromApp(db, appointment, changes = {}) {
  ensureCollections(db);
  const current = config();
  if (!appointment?.clinikoId) return { skipped: true, status: "local_only", message: "Appointment is not linked to Cliniko." };
  if (!current.appointmentWriteEnabled) {
    appointment.syncStatus = appointment.syncStatus || "synced";
    return { skipped: true, status: "not_enabled", message: "Cliniko appointment write-back is disabled." };
  }
  if (!current.apiKey) {
    const message = "CLINIKO_API_KEY is not configured.";
    appointment.syncStatus = "failed";
    appointment.syncError = message;
    recordSyncError(db, "appointment", appointment.id, new ClinikoApiError(message), "appointment_write");
    return { status: "failed", message };
  }

  try {
    const latest = await clinikoFetch(`/individual_appointments/${encodeURIComponent(appointment.clinikoId)}`);
    if (appointment.clinikoUpdatedAt && latest.updated_at && latest.updated_at !== appointment.clinikoUpdatedAt) {
      const message = "Cliniko appointment changed since the last sync. Run Sync Now, review the appointment, then try again.";
      appointment.syncStatus = "conflict";
      appointment.syncError = message;
      appointment.clinikoStatus = "conflict";
      recordSyncError(db, "appointment", appointment.id, new ClinikoApiError(message, { status: 409 }), "appointment_write");
      return { status: "conflict", message };
    }

    const payload = buildClinikoAppointmentUpdatePayload(db, appointment, changes);
    if (payload.error) {
      appointment.syncStatus = "failed";
      appointment.syncError = payload.error;
      recordSyncError(db, "appointment", appointment.id, new ClinikoApiError(payload.error), "appointment_write");
      return { status: "failed", message: payload.error };
    }

    if (!Object.keys(payload.body).length && !payload.attendance) {
      return { skipped: true, status: "no_changes", message: "No Cliniko appointment changes to save." };
    }

    appointment.syncStatus = "pending";
    appointment.syncError = "";
    let updated = latest;
    if (Object.keys(payload.body).length) {
      updated = await clinikoFetch(`/individual_appointments/${encodeURIComponent(appointment.clinikoId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload.body)
      });
    }
    if (payload.attendance) {
      await updateClinikoAppointmentAttendance(appointment, payload.attendance);
      updated = await clinikoFetch(`/individual_appointments/${encodeURIComponent(appointment.clinikoId)}`);
    }
    applyClinikoAppointmentUpdate(db, appointment, updated, {
      ...payload.body,
      ...clinikoAttendanceSnapshot(payload.attendance)
    });
    syncLog(db, {
      status: "synced",
      operation: "appointment_write",
      entityType: "appointment",
      entityId: appointment.id,
      message: "Appointment updated in Cliniko."
    });
    return { status: "synced", appointment };
  } catch (error) {
    const message = recordSyncError(db, "appointment", appointment.id, error, "appointment_write");
    appointment.syncStatus = "failed";
    appointment.syncError = message;
    return { status: "failed", message };
  }
}

function buildClinikoAppointmentUpdatePayload(db, appointment, changes) {
  const body = {};
  let attendance = null;
  if (Object.hasOwn(changes, "startsAt") && changes.startsAt !== appointment.startsAt) body.starts_at = changes.startsAt;
  if (Object.hasOwn(changes, "endsAt") && changes.endsAt !== appointment.endsAt) body.ends_at = changes.endsAt;
  if (Object.hasOwn(changes, "status") && changes.status !== appointment.status) {
    attendance = clinikoAttendanceFields(changes.status, appointment.status);
  }

  const wantsTypeChange = Object.hasOwn(changes, "appointmentType")
    || Object.hasOwn(changes, "recurrence")
    || Object.hasOwn(changes, "clinikoAppointmentTypeId");
  if (wantsTypeChange) {
    const appointmentTypeId = resolveClinikoAppointmentTypeId(db, appointment, changes);
    if (!appointmentTypeId) {
      return { error: "Selected appointment type is not linked to a Cliniko appointment type." };
    }
    if (String(appointmentTypeId) !== String(appointment.clinikoAppointmentTypeId || "")) {
      body.appointment_type_id = String(appointmentTypeId);
    }
  }

  return { body, attendance };
}

function clinikoAttendanceFields(nextStatus, previousStatus = "") {
  if (nextStatus === "completed") return { arrived: true };
  if (nextStatus === "no-show") return { arrived: false };
  if (nextStatus === "booked" && ["completed", "no-show"].includes(previousStatus)) {
    return { arrived: null };
  }
  return null;
}

function clinikoAttendanceSnapshot(attendance) {
  if (!attendance) return {};
  if (attendance.arrived === true) return { patient_arrived: true, did_not_arrive: false };
  if (attendance.arrived === false) return { patient_arrived: false, did_not_arrive: true };
  return { patient_arrived: false, did_not_arrive: false };
}

async function updateClinikoAppointmentAttendance(appointment, attendance) {
  const attendee = await findClinikoAppointmentAttendee(appointment);
  const attendeeId = linkedId(attendee);
  if (!attendeeId) {
    throw new ClinikoApiError("Cliniko appointment attendee could not be found for attendance write-back.");
  }
  return clinikoFetch(`/attendees/${encodeURIComponent(attendeeId)}`, {
    method: "PATCH",
    body: JSON.stringify({ arrived: attendance.arrived })
  });
}

async function findClinikoAppointmentAttendee(appointment) {
  const attendees = await listResource(
    `/individual_appointments/${encodeURIComponent(appointment.clinikoId)}/attendees?per_page=100`,
    "attendees",
    1
  );
  const activeAttendees = attendees.filter((attendee) => !attendee.archived_at && !attendee.deleted_at);
  const patientId = String(appointment.clinikoPatientId || "").trim();
  return activeAttendees.find((attendee) => String(linkedIdFromRecord(attendee, "patient")) === patientId)
    || activeAttendees[0]
    || null;
}

function resolveClinikoAppointmentTypeId(db, appointment, changes) {
  if (changes.clinikoAppointmentTypeId) return String(changes.clinikoAppointmentTypeId);
  const selectedName = String(changes.appointmentType || changes.recurrence || appointment.appointmentType || appointment.recurrence || "").trim();
  if (!selectedName) return appointment.clinikoAppointmentTypeId || "";
  const type = (db.appointmentTypes || []).find((item) =>
    appointmentTypeNamesMatch(item.name, selectedName)
  );
  if (type?.clinikoAppointmentTypeId) return type.clinikoAppointmentTypeId;
  const currentName = String(appointment.appointmentType || appointment.recurrence || "").trim();
  return appointmentTypeNamesMatch(selectedName, currentName) ? appointment.clinikoAppointmentTypeId || "" : "";
}

function appointmentTypeNamesMatch(left, right) {
  const leftKey = appointmentTypeMatchKey(left);
  const rightKey = appointmentTypeMatchKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function appointmentTypeMatchKey(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/physiotherapy/g, "physio")
    .replace(/appoitment/g, "appointment")
    .replace(/assessment/g, "")
    .replace(/appointment/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  const stage = tokens.includes("initial") ? "initial" : tokens.includes("subsequent") ? "subsequent" : "";
  const funding = tokens.includes("sah") ? "sah" : tokens.includes("chsp") ? "chsp" : "";
  if (tokens.includes("equipment") && tokens.includes("trial")) return "equipment-trial";
  if (stage && tokens.includes("physio") && funding) return `${stage}-physio-${funding}`;
  return tokens.join("-");
}

function applyClinikoAppointmentUpdate(db, appointment, updated, payload) {
  const typeId = linkedIdFromRecord(updated, "appointment_type") || payload.appointment_type_id || appointment.clinikoAppointmentTypeId || "";
  const appointmentType = db.appointmentTypes.find((item) => String(item.clinikoAppointmentTypeId || "") === String(typeId));
  const previousClinikoAppointmentNote = appointment.clinikoAppointmentNote || "";
  const nextClinikoAppointmentNote = typeof updated.notes === "string" ? updated.notes : previousClinikoAppointmentNote;
  const patientArrived = typeof updated.patient_arrived === "boolean" ? updated.patient_arrived : payload.patient_arrived;
  const didNotArrive = typeof updated.did_not_arrive === "boolean" ? updated.did_not_arrive : payload.did_not_arrive;
  const attendanceWasUpdated = Object.hasOwn(payload, "patient_arrived") || Object.hasOwn(payload, "did_not_arrive");
  appointment.startsAt = updated.starts_at || payload.starts_at || appointment.startsAt;
  appointment.endsAt = updated.ends_at || payload.ends_at || appointment.endsAt;
  appointment.clinikoAppointmentTypeId = String(typeId || "");
  appointment.appointmentType = appointmentType?.name || appointment.appointmentType || "";
  appointment.recurrence = appointmentType?.name || appointment.recurrence || appointment.appointmentType || "";
  appointment.clinikoAppointmentNote = nextClinikoAppointmentNote;
  if (!appointment.reasonForReferral || appointment.reasonForReferral === previousClinikoAppointmentNote) {
    appointment.reasonForReferral = nextClinikoAppointmentNote;
  }
  appointment.clinikoUpdatedAt = updated.updated_at || appointment.clinikoUpdatedAt || "";
  appointment.clinikoStatus = updated.cancelled_at ? "cancelled_in_cliniko" : "synced";
  appointment.status = updated.cancelled_at
    ? "cancelled"
    : didNotArrive
    ? "no-show"
    : patientArrived
    ? "completed"
    : attendanceWasUpdated
    ? "booked"
    : appointment.status || "booked";
  appointment.syncStatus = "synced";
  appointment.syncError = "";
}

export async function uploadReportPdfToCliniko(db, report, pdfBuffer, filename) {
  ensureCollections(db);
  const current = config();
  if (!current.reportUploadEnabled) {
    report.clinikoUploadStatus = report.clinikoUploadStatus || "not_enabled";
    report.clinikoUploadError = "";
    return { skipped: true, status: "not_enabled", message: "Cliniko report upload is disabled." };
  }

  if (!current.apiKey) {
    report.clinikoUploadStatus = "failed";
    report.clinikoUploadError = "CLINIKO_API_KEY is not configured.";
    recordSyncError(db, "report", report.id, new ClinikoApiError(report.clinikoUploadError), "report_upload");
    return { skipped: true, status: "failed", message: report.clinikoUploadError };
  }

  if (!["ready_for_admin", "final"].includes(report.status) || !isReportUploadType(report.type)) {
    report.clinikoUploadStatus = report.clinikoUploadStatus || "not_required";
    report.clinikoUploadError = "";
    return { skipped: true, status: "not_required", message: "Only completed initial and equipment trial reports upload to Cliniko." };
  }

  if (report.clinikoAttachmentId && report.clinikoUploadStatus === "synced" && report.clinikoAttachmentProcessingCompleted) {
    return { skipped: true, status: "synced", message: "Report was already uploaded to Cliniko.", attachmentId: report.clinikoAttachmentId };
  }

  const client = (db.clients || []).find((item) => item.id === report.clientId);
  const appointment = (db.appointments || []).find((item) => item.id === report.appointmentId);
  const patient = client
    ? await ensureClinikoPatientForClient(db, client)
    : { status: report.clinikoPatientId ? "synced" : "failed", patientId: String(report.clinikoPatientId || ""), message: "Client is not linked to a Cliniko patient." };
  const patientId = String(patient.patientId || "").trim();
  if (patient.status !== "synced" || !patientId) {
    const message = patient.message || "Client is not linked to a Cliniko patient.";
    report.clinikoUploadStatus = "failed";
    report.clinikoUploadError = message;
    recordSyncError(db, "report", report.id, new ClinikoApiError(message), "report_upload");
    return { skipped: true, status: "failed", message };
  }
  report.clinikoPatientId = patientId;
  if (appointment) appointment.clinikoPatientId = patientId;

  const safeFilename = String(filename || report.clinikoAttachmentFilename || "report.pdf").slice(0, 255);
  const description = String(`Refine Physio Mobile report: ${report.type || "Report"}`).slice(0, 255);
  report.clinikoUploadStatus = "pending";
  report.clinikoUploadError = "";
  report.clinikoAttachmentFilename = safeFilename;

  try {
    const existing = await findExistingPatientAttachment(patientId, safeFilename);
    if (existing) {
      markReportUploaded(report, existing, safeFilename, "duplicate_prevented");
      syncLog(db, {
        status: "synced",
        operation: "report_upload",
        entityType: "report",
        entityId: report.id,
        message: "Report upload skipped because matching Cliniko patient attachment already exists."
      });
      return { skipped: true, status: "synced", duplicate: true, attachment: existing };
    }

    const presigned = await clinikoFetch(`/patients/${encodeURIComponent(patientId)}/attachment_presigned_post`);
    const s3Upload = await uploadFileToPresignedPost(presigned, pdfBuffer, safeFilename);
    const attachment = await clinikoFetch("/patient_attachments", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patientId,
        description,
        upload_url: s3Upload.uploadUrl,
        filename: safeFilename
      })
    });

    markReportUploaded(report, attachment, safeFilename, "uploaded");
    syncLog(db, {
      status: "synced",
      operation: "report_upload",
      entityType: "report",
      entityId: report.id,
      message: "Report PDF uploaded to Cliniko patient files."
    });
    return { skipped: false, status: "synced", attachment };
  } catch (error) {
    const message = recordSyncError(db, "report", report.id, error, "report_upload");
    report.clinikoUploadStatus = "failed";
    report.clinikoUploadError = message;
    return { skipped: false, status: "failed", message };
  }
}

export async function uploadTreatmentNotePdfToCliniko(db, note, pdfBuffer, filename) {
  ensureCollections(db);
  const current = config();
  if (!current.noteUploadEnabled) {
    note.clinikoUploadStatus = note.clinikoUploadStatus || "not_enabled";
    note.clinikoUploadError = "";
    return { skipped: true, status: "not_enabled", message: "Cliniko note file upload is disabled." };
  }

  if (!current.apiKey) {
    note.clinikoUploadStatus = "failed";
    note.clinikoUploadError = "CLINIKO_API_KEY is not configured.";
    recordSyncError(db, "treatmentNote", note.id, new ClinikoApiError(note.clinikoUploadError), "note_file_upload");
    return { skipped: true, status: "failed", message: note.clinikoUploadError };
  }

  if (note.status !== "signed") {
    note.clinikoUploadStatus = note.clinikoUploadStatus || "not_required";
    note.clinikoUploadError = "";
    return { skipped: true, status: "not_required", message: "Only completed treatment notes upload to Cliniko files." };
  }

  if (note.clinikoAttachmentId && note.clinikoUploadStatus === "synced" && note.clinikoAttachmentProcessingCompleted) {
    return { skipped: true, status: "synced", message: "Treatment note was already uploaded to Cliniko.", attachmentId: note.clinikoAttachmentId };
  }

  const appointment = (db.appointments || []).find((item) => item.id === note.appointmentId);
  const client = (db.clients || []).find((item) => item.id === note.clientId || item.id === appointment?.clientId);
  const patient = client
    ? await ensureClinikoPatientForClient(db, client)
    : { status: note.clinikoPatientId ? "synced" : "failed", patientId: String(note.clinikoPatientId || appointment?.clinikoPatientId || ""), message: "Client is not linked to a Cliniko patient." };
  const patientId = String(patient.patientId || "").trim();
  if (patient.status !== "synced" || !patientId) {
    const message = patient.message || "Client is not linked to a Cliniko patient.";
    note.clinikoUploadStatus = "failed";
    note.clinikoUploadError = message;
    recordSyncError(db, "treatmentNote", note.id, new ClinikoApiError(message), "note_file_upload");
    return { skipped: true, status: "failed", message };
  }
  note.clinikoPatientId = patientId;
  if (appointment) appointment.clinikoPatientId = patientId;

  const safeFilename = String(filename || note.clinikoAttachmentFilename || "treatment-note.pdf").slice(0, 255);
  const appointmentDate = appointment?.startsAt ? appointment.startsAt.slice(0, 10) : "";
  const description = String(`Refine Physio Mobile treatment note${appointmentDate ? `: ${appointmentDate}` : ""}`).slice(0, 255);
  note.clinikoUploadStatus = "pending";
  note.clinikoUploadError = "";
  note.clinikoAttachmentFilename = safeFilename;

  try {
    const existing = await findExistingPatientAttachment(patientId, safeFilename);
    if (existing) {
      markTreatmentNoteUploaded(note, existing, safeFilename, "duplicate_prevented");
      syncLog(db, {
        status: "synced",
        operation: "note_file_upload",
        entityType: "treatmentNote",
        entityId: note.id,
        message: "Treatment note upload skipped because matching Cliniko patient attachment already exists."
      });
      return { skipped: true, status: "synced", duplicate: true, attachment: existing };
    }

    const presigned = await clinikoFetch(`/patients/${encodeURIComponent(patientId)}/attachment_presigned_post`);
    const s3Upload = await uploadFileToPresignedPost(presigned, pdfBuffer, safeFilename);
    const attachment = await clinikoFetch("/patient_attachments", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patientId,
        description,
        upload_url: s3Upload.uploadUrl,
        filename: safeFilename
      })
    });

    markTreatmentNoteUploaded(note, attachment, safeFilename, "uploaded");
    syncLog(db, {
      status: "synced",
      operation: "note_file_upload",
      entityType: "treatmentNote",
      entityId: note.id,
      message: "Treatment note PDF uploaded to Cliniko patient files."
    });
    return { skipped: false, status: "synced", attachment };
  } catch (error) {
    const message = recordSyncError(db, "treatmentNote", note.id, error, "note_file_upload");
    note.clinikoUploadStatus = "failed";
    note.clinikoUploadError = message;
    return { skipped: false, status: "failed", message };
  }
}

function isReportUploadType(type) {
  return ["Initial Physiotherapy Assessment Report", "Equipment Trial Report"].includes(type);
}

async function findExistingPatientAttachment(patientId, filename) {
  const params = new URLSearchParams({ per_page: "100", sort: "created_at:desc" });
  params.append("q[]", `patient_id:=${patientId}`);
  params.append("q[]", `filename:=${filename}`);
  const attachments = await listResource(`/patient_attachments?${params.toString()}`, "patient_attachments", 1);
  return attachments.find((attachment) =>
    String(attachment.filename || "") === filename
    && !attachment.archived_at
    && attachment.processing_completed
  ) || null;
}

async function uploadFileToPresignedPost(presigned, fileBuffer, filename) {
  if (!presigned?.url || !presigned?.fields) {
    throw new ClinikoApiError("Cliniko did not return a valid patient attachment upload URL.");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(presigned.fields)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  const storageFilename = storageSafeFilename(filename);
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), storageFilename);

  const response = await fetch(presigned.url, {
    method: "POST",
    body: form
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ClinikoApiError(`Cliniko S3 upload failed with ${response.status}`, {
      status: response.status,
      payload: text.slice(0, 500)
    });
  }

  const key = extractXmlValue(text, "Key") || String(presigned.fields.key || "").replace("${filename}", storageFilename);
  const uploadUrl = combinePresignedUrlAndKey(presigned.url, key);
  return { key, uploadUrl };
}

function storageSafeFilename(filename) {
  const safe = String(filename || "attachment.pdf")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180)
    || "attachment.pdf";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function combinePresignedUrlAndKey(baseUrl, key) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(key || "").replace(/^\/+/, "")}`;
}

function extractXmlValue(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXmlText(match[1]) : "";
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function markReportUploaded(report, attachment, filename, source) {
  report.clinikoAttachmentId = String(attachment?.id || report.clinikoAttachmentId || "");
  report.clinikoAttachmentFilename = filename;
  report.clinikoAttachmentUploadedAt = new Date().toISOString();
  report.clinikoUploadStatus = "synced";
  report.clinikoUploadError = "";
  report.clinikoAttachmentProcessingCompleted = Boolean(attachment?.processing_completed);
  report.clinikoUploadSource = source;
}

function markTreatmentNoteUploaded(note, attachment, filename, source) {
  note.clinikoAttachmentId = String(attachment?.id || note.clinikoAttachmentId || "");
  note.clinikoAttachmentFilename = filename;
  note.clinikoAttachmentUploadedAt = new Date().toISOString();
  note.clinikoUploadStatus = "synced";
  note.clinikoUploadError = "";
  note.clinikoAttachmentProcessingCompleted = Boolean(attachment?.processing_completed);
  note.clinikoUploadSource = source;
}
