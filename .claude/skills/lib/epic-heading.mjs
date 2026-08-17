// epic-heading — Foundation: the roadmap's epic-heading grammar, declared once.
//
// The plan encodes each epic as `## Epic 9 — Erp portables  🟡  (erp-portables)`.
// Three modules read that line from two different input positions: roadmap/parse.mjs
// receives it with the `## ` already stripped by splitSections, while sync.mjs and
// append.mjs scan raw lines. Hence one grammar source compiled at two anchors rather
// than one entry point with an optional prefix — an optional prefix would let a body
// line reading `Epic 3 — foo` match inside sync.mjs, which scans every line.

const PLANNED = '⬜';
const IN_PROGRESS = '🟡';
const DONE = '✅';

const STATUS_EMOJI_SOURCE = `${PLANNED}|${IN_PROGRESS}|${DONE}`;

// Non-global on purpose. `.test()` on a /g regex advances lastIndex and returns
// false on every second call, which would let assertInert accept a forged title
// half the time. Callers needing repeated scanning call statusEmojiScanner().
const STATUS_EMOJI = new RegExp(STATUS_EMOJI_SOURCE, 'u');

const STATUS_BY_EMOJI = Object.freeze([
  Object.freeze([DONE, 'done']),
  Object.freeze([IN_PROGRESS, 'in-progress']),
  Object.freeze([PLANNED, 'planned']),
]);

const EPIC_BODY_SOURCE = String.raw`Epic\s+(\d+)\s+—\s+(.+)`;
const LINE_RE = new RegExp(`^##\\s+${EPIC_BODY_SOURCE}$`, 'u');
const TEXT_RE = new RegExp(`^${EPIC_BODY_SOURCE}$`, 'u');

function match(re, value) {
  if (typeof value !== 'string') return null;
  const m = re.exec(value);
  return m ? { num: Number(m[1]), rest: m[2] } : null;
}

/** Match a raw roadmap line, `## ` prefix required. */
export function matchEpicHeadingLine(line) {
  return match(LINE_RE, line);
}

/** Match heading text whose `## ` prefix a caller already stripped. */
export function matchEpicHeadingText(text) {
  return match(TEXT_RE, text);
}

/** A fresh global scanner per call, so no lastIndex state crosses call sites. */
export function statusEmojiScanner() {
  return new RegExp(STATUS_EMOJI_SOURCE, 'gu');
}

/**
 * Reject a value that would forge roadmap structure once interpolated into a
 * heading. A status emoji wins the earliest-match status read, so a title
 * carrying one reports a planned epic as shipped; a newline forges a whole
 * heading. Security review 2026-08-15 (MEDIUM, CWE-74).
 */
export function assertInert(value, field) {
  const text = String(value ?? '');
  if (/[\r\n]/.test(text)) throw new Error(`roadmap-append: ${field} must not contain a newline`);
  if (STATUS_EMOJI.test(text)) throw new Error(`roadmap-append: ${field} must not contain a status emoji`);
}

export { PLANNED, IN_PROGRESS, DONE, STATUS_EMOJI_SOURCE, STATUS_EMOJI, STATUS_BY_EMOJI };
