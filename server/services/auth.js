import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const DEFAULT_SESSION_HOURS = 12;

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function hashPassword(password) {
  const text = String(password || "");
  if (text.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(text, salt, KEY_LENGTH);
  return `${PASSWORD_PREFIX}$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== PASSWORD_PREFIX) return false;

  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scrypt(String(password || ""), salt, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

export function createSession(db, user, options = {}) {
  db.sessions ||= [];
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + sessionTtlHours(options) * 60 * 60 * 1000).toISOString();
  const session = {
    id: `session-${randomBytes(12).toString("hex")}`,
    tokenHash: sessionTokenHash(token),
    userId: user.id,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt,
    revokedAt: ""
  };

  db.sessions.push(session);
  pruneExpiredSessions(db);
  return { token, session };
}

export function authenticateSession(db, token) {
  if (!token) return null;
  db.sessions ||= [];
  const tokenHash = sessionTokenHash(token);
  const now = Date.now();
  const session = db.sessions.find((item) =>
    item.tokenHash === tokenHash
    && !item.revokedAt
    && new Date(item.expiresAt || 0).getTime() > now
  );
  if (!session) return null;

  const user = (db.users || []).find((item) => item.id === session.userId && item.isActive !== false);
  if (!user) return null;

  session.lastSeenAt = new Date().toISOString();
  return { session, user };
}

export function revokeSession(db, token) {
  if (!token) return false;
  const tokenHash = sessionTokenHash(token);
  const session = (db.sessions || []).find((item) => item.tokenHash === tokenHash && !item.revokedAt);
  if (!session) return false;
  session.revokedAt = new Date().toISOString();
  return true;
}

export function pruneExpiredSessions(db) {
  db.sessions ||= [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  db.sessions = db.sessions.filter((session) => {
    if (!session.expiresAt) return false;
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return false;
    if (!session.revokedAt) return expiresAt > cutoff;
    return new Date(session.revokedAt).getTime() > cutoff;
  });
}

export function mergeSessionRecords(...sessionLists) {
  const merged = new Map();
  for (const sessions of sessionLists) {
    for (const session of sessions || []) {
      if (!session || typeof session !== "object") continue;
      const key = session.tokenHash || session.id;
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...session });
        continue;
      }

      const next = { ...existing, ...session };
      next.createdAt = earliestIso(existing.createdAt, session.createdAt);
      next.lastSeenAt = latestIso(existing.lastSeenAt, session.lastSeenAt);
      next.expiresAt = earliestIso(existing.expiresAt, session.expiresAt);
      next.revokedAt = earliestTruthyIso(existing.revokedAt, session.revokedAt);
      merged.set(key, next);
    }
  }
  return [...merged.values()];
}

export function sessionCookie(token, options = {}) {
  const secure = options.secure || process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
  const maxAge = Math.max(1, sessionTtlHours(options)) * 60 * 60;
  return [
    `refine_session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
  return [
    "refine_session=",
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

export function cookieValue(cookieHeader, name) {
  const cookies = String(cookieHeader || "").split(";").map((item) => item.trim()).filter(Boolean);
  for (const cookie of cookies) {
    const index = cookie.indexOf("=");
    if (index === -1) continue;
    const key = cookie.slice(0, index);
    if (key === name) return decodeURIComponent(cookie.slice(index + 1));
  }
  return "";
}

export function publicUser(user, options = {}) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || "",
    name: user.name || "",
    role: user.role || "contractor",
    discipline: user.discipline || "",
    phone: user.phone || "",
    baseSuburb: user.baseSuburb || "",
    workingStart: user.workingStart || "09:00",
    workingEnd: user.workingEnd || "17:00",
    clinikoPractitionerId: user.clinikoPractitionerId || "",
    clinikoSyncEnabled: Boolean(user.clinikoSyncEnabled),
    syncSource: user.syncSource || "",
    syncStatus: user.syncStatus || "",
    isOwner: Boolean(user.isOwner),
    requiresLoginSetup: Boolean(user.requiresLoginSetup),
    hasPassword: hasPassword(user),
    hasSignature: Boolean(user.signatureDataUrl),
    signatureDataUrl: options.includeSignature ? user.signatureDataUrl || "" : "",
    signatureUpdatedAt: user.signatureUpdatedAt || "",
    isActive: user.isActive !== false,
    lastLoginAt: user.lastLoginAt || ""
  };
}

export function hasPassword(user) {
  return Boolean(user?.passwordHash || user?.password_hash);
}

function sessionTokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function sessionTtlHours(options = {}) {
  const hours = Number(options.hours || process.env.SESSION_TTL_HOURS || DEFAULT_SESSION_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_SESSION_HOURS;
}

function earliestIso(first, second) {
  if (!first) return second || "";
  if (!second) return first || "";
  const firstMs = isoTime(first);
  const secondMs = isoTime(second);
  if (!Number.isFinite(firstMs)) return second || "";
  if (!Number.isFinite(secondMs)) return first || "";
  return firstMs <= secondMs ? first : second;
}

function latestIso(first, second) {
  if (!first) return second || "";
  if (!second) return first || "";
  const firstMs = isoTime(first);
  const secondMs = isoTime(second);
  if (!Number.isFinite(firstMs)) return second || "";
  if (!Number.isFinite(secondMs)) return first || "";
  return firstMs >= secondMs ? first : second;
}

function earliestTruthyIso(first, second) {
  if (!first) return second || "";
  if (!second) return first || "";
  return earliestIso(first, second);
}

function isoTime(value) {
  return new Date(value || 0).getTime();
}
