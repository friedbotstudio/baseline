// Foundation: the task vocabulary the channel coordinates over.
//
// Two facts live here because both the handlers and the server need them and a
// second copy of either would drift.
//
// The status set widens from {pending, claimed, done}. `in_progress` exists
// because a claimed task and a task actually being worked are different facts,
// and merging them leaves a lead unable to tell a stalled claim from live work.
// `cancelled` exists because the only way to retire a task used to be marking it
// `done`, which lies to every dependent: they unblock as though the work happened.
//
// The channel id resolves an absent `sprint_id` to a per-repository default, so
// the task tools are usable by a solo session with org mode off. The id becomes a
// path component, so resolution validates rather than trusting the default to be
// safe — a convenience that skipped the guard would be a new hole, not a shortcut.

import { isSafeId } from './safe-id.mjs';

export const TASK_STATUSES = Object.freeze(['pending', 'claimed', 'in_progress', 'done', 'cancelled']);

export const DEFAULT_CHANNEL_ID = 'default';

/**
 * @param {unknown} status
 * @returns {boolean} whether the value is one of the five declared statuses
 */
export function isValidStatus(status) {
  return typeof status === 'string' && TASK_STATUSES.includes(status);
}

/**
 * Only a pending task may be claimed. A cancelled one is retired, not available.
 *
 * @param {unknown} status
 * @returns {boolean}
 */
export function isClaimable(status) {
  return status === 'pending';
}

/**
 * A dependency stops blocking when it is finished OR retired. Cancelled counts
 * because the work will never happen — leaving it blocking would strand every
 * dependent, and marking it done to unstick them would falsify the record.
 *
 * @param {unknown} status
 * @returns {boolean}
 */
export function satisfiesDependency(status) {
  return status === 'done' || status === 'cancelled';
}

/**
 * Resolve the channel a call operates on.
 *
 * @param {unknown} sprintId - an explicit channel id, or nothing for the default.
 * @returns {string} the resolved channel id
 * @throws {Error} when an explicit id is not path-safe
 */
export function resolveChannelId(sprintId) {
  if (sprintId === undefined || sprintId === null) return DEFAULT_CHANNEL_ID;
  if (typeof sprintId !== 'string') throw new Error(`invalid channel id: ${String(sprintId)}`);
  const trimmed = sprintId.trim();
  if (trimmed === '') return DEFAULT_CHANNEL_ID;
  if (!isSafeId(trimmed)) throw new Error(`invalid channel id: ${trimmed}`);
  return trimmed;
}
