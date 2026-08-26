// Foundation — the memory decay predicate, declared once.
//
// Two readers judge staleness: `sweep.mjs`, which offers entries for re-verification,
// and `memory_session_start.mjs`, which reports the count. Each keeps its own parsing
// and its own git call; both ask this module the question. The rule lives in one
// module because the copies drifted before — at 1b2b0c7 the sweep called 287 entries
// stale where the hook called 248 — and `tests/sweep-staleness-parity.test.mjs` exists
// to catch that. With one predicate behind both callers the parity holds by
// construction rather than by coincidence.
//
// The witness replaced a commit-distance leg. Counting commits measures how fast the
// repository moves, not whether an entry drifted: at 132 commits in 30 days a
// 30-commit threshold expired an entry after four days, and 259 of 291 non-exempt
// entries read stale while only 33 were older than a month.

import { STALE_EXEMPT, SUPERSESSION_DRIVEN } from '../../skills/memory-index/categories.mjs';
import { matchesAnyGlob } from './glob-match.mjs';

export const STALE_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A git short SHA and nothing else. The stamp is interpolated into a git argv, and
// git reads a leading `-` as an option rather than a revision: measured 2026-08-23,
// `verified-at: --output=<path>` made `git diff --name-only --output=<path>..HEAD`
// write that file and exit 0, so an arbitrary write succeeded while the predicate
// reported a normal verdict. A `--` terminator does not help, because the injected
// text is the revision argument itself. Callers treat a rejected stamp exactly as an
// unresolvable one.
const GIT_SHA = /^[0-9a-f]{7,40}$/;

export function usableStamp(stamp) {
  return typeof stamp === 'string' && GIT_SHA.test(stamp.trim());
}

function daysSince(stamp, today) {
  if (typeof stamp !== 'string' || !ISO_DATE.test(stamp.trim())) return null;
  const then = Date.parse(`${stamp.trim()}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((today.getTime() - then) / 86400000);
}

// Multi-value frontmatter round-trips through a comma-joined string, so every
// caller would otherwise split it itself. It lives here for the same reason the
// predicate does.
export function splitList(value) {
  if (typeof value !== 'string') return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

// true = a governed path moved, false = none did, null = the question could not be
// answered. The three are distinct on purpose: glob-match refuses an uncompilable glob
// with a RangeError so its other callers can tell refusal from no-match, and collapsing
// refusal into `false` here would report an entry fresh at any age on the strength of a
// comparison that never ran.
function witness(governs, changedPaths) {
  if (!Array.isArray(governs) || governs.length === 0) return null;
  if (!Array.isArray(changedPaths)) return null;
  try {
    return changedPaths.some((p) => typeof p === 'string' && matchesAnyGlob(p, governs));
  } catch {
    return null;
  }
}

// The boolean face of the same question, for callers that only need "did it match".
export function governsMatches(governs, changedPaths) {
  return witness(governs, changedPaths) === true;
}

// The four false cases mirror the four early returns below, so an entry meeting
// one gets the same verdict whether `changedPaths` is computed or null. The two
// statements of that condition must not drift;
// `test_when_needs_changed_set_is_false_then_verdict_matches_a_computed_changed_set`
// is what holds them equal.
export function needsChangedSet({ category, hasClosure = false, governs = [] } = {}) {
  if (STALE_EXEMPT.has(category)) return false;
  if (hasClosure) return false;
  if (SUPERSESSION_DRIVEN.has(category)) return false;
  return Array.isArray(governs) && governs.length > 0;
}

/**
 * `changedPaths` is null whenever the caller could not resolve a changed set —
 * `verified-at: HEAD`, a non-git project, a failed git call. Null falls through to
 * the date leg rather than reading as "nothing moved", so a failed probe never
 * renders as fresh.
 */
export function isStaleFromFields({
  category,
  hasClosure = false,
  governs = [],
  lastTouched = '',
  changedPaths = null,
  today = new Date(),
} = {}) {
  if (STALE_EXEMPT.has(category)) return false;
  if (hasClosure) return false;
  if (SUPERSESSION_DRIVEN.has(category)) return false;

  const moved = witness(governs, changedPaths);
  if (moved !== null) return moved;

  const days = daysSince(lastTouched, today);
  return days !== null && days >= STALE_DAYS;
}
