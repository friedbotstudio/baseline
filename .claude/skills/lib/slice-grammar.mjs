// Foundation — the epic spec's `## Slice <id>` grammar, declared once.
//
// Three readers parse this section and used to declare it three times:
// pinned-spec.mjs accepted a titled heading, spec-lint required the heading to
// end at the id, and drift_check probed for presence. Every epic spec on disk
// writes a titled heading, so spec-lint's two epic checks had never passed on a
// real epic. seed.md §18.9 publishes the grammar this module implements.
//
// One source compiled at two anchors, the epic-heading.mjs shape: the id-bound
// pattern needs the heading position, the presence probe needs only "some slice
// heading exists". A single entry point with an optional id would let a caller
// scanning for presence match a body line.

const SLICE_HEADING_PREFIX = String.raw`^##\s+Slice\s+`;

// `(?![\w-])` is what keeps `B1` off `## Slice B10`. `[^\n]*` is what accepts
// the title every epic spec on disk writes after the id.
const ID_TAIL = String.raw`(?![\w-])[^\n]*$`;
const SECTION_BODY = String.raw`([\s\S]*?)(?=^##\s|$(?![\s\S]))`;

// The AC list is one bold-labelled line, bullet optional, under either label.
// Non-global on purpose: a shared /g regex used with .test() or .exec()
// advances lastIndex and answers differently on alternate calls
// (landmine a-global-regex-with-test-fails-open-on-alternate-calls).
const AC_LABEL_RE = /^[-*]?\s*\*\*(?:ACs?|Acceptance criteria)\*\*\s*:\s*(.+)$/im;
const AC_ID_RE = /AC-\d+/g;

// Presence only. Non-global for the same reason as AC_LABEL_RE.
const ANY_SLICE_HEADING_RE = new RegExp(`${SLICE_HEADING_PREFIX}\\S`, 'm');

const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;

function escapeForPattern(value) {
  return String(value).replace(REGEX_META_RE, '\\$&');
}

/**
 * The `## Slice <id>` body, bounded by the next `##` heading.
 * Returns null when the spec carries no such section, so a caller can tell
 * "scoped to nothing" from "scoped to an empty slice".
 */
export function sliceSection(specText, sliceId) {
  if (!sliceId) return null;
  const pattern = new RegExp(
    `${SLICE_HEADING_PREFIX}${escapeForPattern(sliceId)}${ID_TAIL}${SECTION_BODY}`,
    'im',
  );
  return pattern.exec(String(specText ?? ''))?.[1] ?? null;
}

/**
 * The AC ids a slice section claims, deduped, in source order.
 * Only the bold-labelled line supplies ids — an `AC-NNN` elsewhere in the body
 * is prose. Scraping the whole body is how spec-lint came to claim an AC a
 * slice merely referred to.
 */
export function sliceAcIds(sectionText) {
  const label = AC_LABEL_RE.exec(String(sectionText ?? ''));
  if (!label) return [];
  return [...new Set(label[1].match(AC_ID_RE) ?? [])];
}

/**
 * Every slice id the spec declares, in document order.
 * A fresh global regex per call: a hoisted /g regex carries lastIndex between
 * calls and would skip half the headings on the second call.
 */
export function sliceIds(specText) {
  const scanner = new RegExp(`${SLICE_HEADING_PREFIX}(\\S+)`, 'gim');
  return [...String(specText ?? '').matchAll(scanner)].map((m) => m[1]);
}

/** Whether the spec carries any slice section at all. */
export function sliceHeadingPresent(specText) {
  return ANY_SLICE_HEADING_RE.test(String(specText ?? ''));
}

/**
 * Reject a slice id that would forge spec structure once interpolated into a
 * heading or an error message. A newline forges a whole heading; a `#` forges a
 * heading marker; a backtick closes the code span the drift report's messages
 * wrap it in, letting a crafted id continue in running markdown and read as a
 * clean verdict. Mirrors epic-heading.mjs → assertInert (CWE-74).
 *
 * Rejects; never repairs. A stripped id would silently name a different slice.
 */
export function assertInertSliceId(value, field) {
  const text = String(value ?? '');
  if (/[\r\n]/.test(text)) throw new Error(`slice-grammar: ${field} must not contain a newline`);
  if (text.includes('#')) throw new Error(`slice-grammar: ${field} must not contain a heading marker`);
  if (text.includes('`')) throw new Error(`slice-grammar: ${field} must not contain a backtick`);
}

export { SLICE_HEADING_PREFIX };
