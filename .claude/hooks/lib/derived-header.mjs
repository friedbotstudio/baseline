// derived-header (Foundation) — the "generated, do-not-edit" banner mechanism and
// the constitution-mirror exemption registry. Stdlib-free (pure string/set logic).
//
// Design call (spec debt-hardening-batch, Slice T3): the constitution mirrors are
// EXEMPT and must NOT carry this header. Their drift guard is byte-equality with a
// human-edited live source (`sync-constitution-mirror --check`); a header would both
// break that equality and dishonestly banner a source humans DO edit. audit-baseline
// enforces the exemption (a mirror carrying this header FAILs) so the two drift
// strategies — header for stamped files, byte-equality for mirrors — never collide.
// The stamp half is the ready mechanism; no committed file is stamped today (every
// derived file is either an exempt mirror or ephemeral gitignored build output).

export const DERIVED_HEADER_MARKER = 'GENERATED — do not edit';

// The constitution mirror pair and their built outputs, whose byte-equality with a
// human-edited source forbids a header. Paths are relative to the repo root.
export const EXEMPT_RELPATHS = new Set([
  'src/CLAUDE.template.md',
  'src/seed.template.md',
  'obj/template/CLAUDE.md',
  'obj/template/docs/init/seed.md',
]);

export function isExempt(relPath) {
  return EXEMPT_RELPATHS.has(relPath);
}

// A file carries the header when it opens with an HTML comment naming the marker.
// The 400-char window keeps a body that merely mentions the phrase from matching.
export function hasDerivedHeader(text) {
  return typeof text === 'string'
    && text.trimStart().startsWith('<!--')
    && text.slice(0, 400).includes(DERIVED_HEADER_MARKER);
}

function renderHeader(sourceRef) {
  return `<!-- ${DERIVED_HEADER_MARKER}; edit the source and rebuild. source: ${sourceRef} -->\n`;
}

// Idempotent: re-stamping an already-headed file returns it unchanged.
export function stampText(text, sourceRef) {
  if (hasDerivedHeader(text)) return text;
  return renderHeader(sourceRef) + text;
}
