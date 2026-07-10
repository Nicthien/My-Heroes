import { strict as assert } from "node:assert";
import {
  evaluateEphemeralGameCleanup,
  GUEST_GAME_INACTIVITY_MS,
  GUEST_PRESENCE_TIMEOUT_MS,
} from "../src/lib/game/server/guest-game-policy";

const nowMs = Date.parse("2026-07-10T12:00:00.000Z");
const isoBefore = (durationMs: number) => new Date(nowMs - durationMs).toISOString();
const isoAfter = (durationMs: number) => new Date(nowMs + durationMs).toISOString();

const live = evaluateEphemeralGameCleanup({
  nowMs,
  createdAt: isoBefore(60 * 60_000),
  eventUpdatedAt: isoBefore(10 * 60_000),
  presences: [{ lastSeenAt: isoBefore(30_000), leftAt: null }],
});
assert.equal(live.shouldDelete, false);
assert.equal(live.hasLivePresence, true);

const stale = evaluateEphemeralGameCleanup({
  nowMs,
  createdAt: isoBefore(GUEST_PRESENCE_TIMEOUT_MS + 1),
  eventUpdatedAt: isoBefore(60_000),
  presences: [{ lastSeenAt: isoBefore(GUEST_PRESENCE_TIMEOUT_MS + 1), leftAt: null }],
});
assert.equal(stale.reason, "empty");

const explicitLeave = evaluateEphemeralGameCleanup({
  nowMs,
  createdAt: isoBefore(60 * 60_000),
  eventUpdatedAt: isoBefore(60_000),
  presences: [{ lastSeenAt: isoBefore(5_000), leftAt: isoBefore(1_000) }],
});
assert.equal(explicitLeave.reason, "empty");

const pendingConversion = evaluateEphemeralGameCleanup({
  nowMs,
  createdAt: isoBefore(60 * 60_000),
  eventUpdatedAt: isoBefore(60 * 60_000),
  preservationPendingUntil: isoAfter(60 * 60_000),
  presences: [],
});
assert.equal(pendingConversion.shouldDelete, false);

const inactive = evaluateEphemeralGameCleanup({
  nowMs,
  createdAt: isoBefore(GUEST_GAME_INACTIVITY_MS + 1),
  eventUpdatedAt: isoBefore(GUEST_GAME_INACTIVITY_MS + 1),
  preservationPendingUntil: isoAfter(60 * 60_000),
  presences: [],
});
assert.equal(inactive.reason, "inactive");

const recentCreation = evaluateEphemeralGameCleanup({
  nowMs,
  createdAt: isoBefore(GUEST_PRESENCE_TIMEOUT_MS - 1),
  eventUpdatedAt: null,
  presences: [],
});
assert.equal(recentCreation.shouldDelete, false);

console.log("GUEST_GAME_POLICY ok");
