// Domain — what a spec DECLARES it changes about the standing model.
//
// A spec states its design intent against `docs/system/` in a `## System delta`
// table; this module turns that prose into records. It is deliberately pure and
// total: no filesystem, no config, and it never throws. A malformed row is data
// (`errors[]`), not an exception, because the caller is a preflight check that must
// report every offending row rather than die on the first one.
//
// Verification of those records against a landed diff is NOT here — that is
// `verifyDelta`/`applyDelta`, which archive owns. Declaring and proving are
// separate concerns and separate slices.
//
// The verbs are the corpus's existing op vocabulary, not a new one
// (`conflicts-are-reported-never-auto-resolved-2026-08-04`).

const SECTION_RE = /^##\s+System\s+delta\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im;
const NONE_RE = /^\*?\(?\s*none\s*\)?\*?$/i;
const SEPARATOR_RE = /^\|?[\s:|-]+\|?$/;

const VERBS = new Set(['add', 'change', 'remove']);
const COLUMNS = ['verb', 'elementId', 'anchor', 'concept', 'kind'];

function sectionBody(specText) {
  const match = SECTION_RE.exec(String(specText == null ? '' : specText));
  return match ? match[1].trim() : null;
}

function splitCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function isTableLine(line) {
  return line.trim().startsWith('|');
}

// The header and its separator carry no data. Dropping them by shape rather than by
// position keeps a table readable when an author adds a blank line between them.
function isHeaderOrSeparator(cells, line) {
  return SEPARATOR_RE.test(line.trim()) || cells[0].toLowerCase() === 'verb';
}

function rowFrom(cells) {
  return COLUMNS.reduce((row, name, i) => ({ ...row, [name]: cells[i] }), {});
}

function defectIn(cells, lineNumber) {
  if (cells.length !== COLUMNS.length) {
    return `row ${lineNumber}: expected ${COLUMNS.length} cells (${COLUMNS.join(' | ')}), got ${cells.length}`;
  }
  const [verb] = cells;
  if (!VERBS.has(verb.toLowerCase())) {
    return `row ${lineNumber}: unknown verb ${JSON.stringify(verb)} (expected add, change or remove)`;
  }
  const blank = COLUMNS.filter((name, i) => !cells[i]);
  if (blank.length) {
    return `row ${lineNumber}: empty ${blank.join(', ')}`;
  }
  return null;
}

export function parseDelta(specText) {
  const body = sectionBody(specText);
  if (body === null) return { rows: [], errors: [], empty: false };
  if (NONE_RE.test(body)) return { rows: [], errors: [], empty: true };

  const rows = [];
  const errors = [];
  body.split('\n').forEach((line, index) => {
    if (!isTableLine(line)) return;
    const cells = splitCells(line);
    if (isHeaderOrSeparator(cells, line)) return;
    const defect = defectIn(cells, index + 1);
    if (defect) errors.push(defect);
    else rows.push(rowFrom(cells));
  });

  return { rows, errors, empty: false };
}
