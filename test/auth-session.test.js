import assert from "node:assert/strict";
import test from "node:test";
import { mergeSessionRecords } from "../server/services/auth.js";

test("session merge preserves phone login sessions during stale background writes", () => {
  const olderReadSessions = [
    {
      id: "session-existing",
      tokenHash: "existing-token",
      userId: "user-admin",
      createdAt: "2026-05-31T00:00:00.000Z",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
      expiresAt: "2026-05-31T12:00:00.000Z",
      revokedAt: ""
    }
  ];
  const latestDiskSessions = [
    ...olderReadSessions,
    {
      id: "session-phone",
      tokenHash: "phone-token",
      userId: "user-admin",
      createdAt: "2026-05-31T00:01:00.000Z",
      lastSeenAt: "2026-05-31T00:01:00.000Z",
      expiresAt: "2026-05-31T12:01:00.000Z",
      revokedAt: ""
    }
  ];

  const merged = mergeSessionRecords(latestDiskSessions, olderReadSessions);

  assert.equal(merged.length, 2);
  assert.ok(merged.some((session) => session.tokenHash === "phone-token"));
});

test("session merge keeps revocations when a stale writer still has the old active session", () => {
  const staleActive = [
    {
      id: "session-existing",
      tokenHash: "existing-token",
      userId: "user-admin",
      createdAt: "2026-05-31T00:00:00.000Z",
      lastSeenAt: "2026-05-31T00:02:00.000Z",
      expiresAt: "2026-05-31T12:00:00.000Z",
      revokedAt: ""
    }
  ];
  const latestRevoked = [
    {
      id: "session-existing",
      tokenHash: "existing-token",
      userId: "user-admin",
      createdAt: "2026-05-31T00:00:00.000Z",
      lastSeenAt: "2026-05-31T00:01:00.000Z",
      expiresAt: "2026-05-31T12:00:00.000Z",
      revokedAt: "2026-05-31T00:01:30.000Z"
    }
  ];

  const [merged] = mergeSessionRecords(latestRevoked, staleActive);

  assert.equal(merged.revokedAt, "2026-05-31T00:01:30.000Z");
  assert.equal(merged.lastSeenAt, "2026-05-31T00:02:00.000Z");
});
