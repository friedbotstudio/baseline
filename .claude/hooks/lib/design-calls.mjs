// Foundation — `## Design calls` table parser + quality-floor validator.
//
// Single source of the populated-cell rule shared by:
//   - spec_design_calls_guard.mjs (write-boundary PreToolUse hook)
//   - spec-lint/lint.mjs           (preview checker)
// so the two can never disagree on what a UI spec's Design calls must carry.
//
// Roadmap B1: a UI-touching spec's Design calls rows must each declare a
// populated Reference target (the C4 design-judge's rubric anchor) AND at least
// one Quality criterion. Self-contained (stdlib-only): a hook lib never imports
// another hook.

const SECTION_RE = /^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im;
const NONE_RE = /^\s*-?\s*\*?\(?none\)?\*?\s*$/i;
const PLACEHOLDER_RE = /^\*?\(?\s*(?:—|-|none|tbd|n\/a)\s*\)?\*?$/i;
const REFERENCE_RE = /reference\s+target/i;
const QUALITY_RE = /quality/i;

const REFERENCE_LABEL = 'Reference target';
const QUALITY_LABEL = 'Quality criteria';

export function isPopulatedCell(text) {
  if (text == null) return false;
  const t = String(text).trim();
  if (!t) return false;
  return !PLACEHOLDER_RE.test(t);
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

function findColumn(headerCols, re) {
  return headerCols.findIndex((c) => re.test(c));
}

function buildRow(line, referenceCol, qualityCol) {
  const cells = splitRow(line);
  const at = (i) => (i >= 0 ? cells[i] || '' : '');
  return {
    slug: cells[0] || '',
    intent: cells[1] || '',
    targetFiles: cells[2] || '',
    writeSet: cells[3] || '',
    register: cells[4] || '',
    referenceTarget: at(referenceCol),
    qualityCriteria: at(qualityCol),
    cells,
  };
}

const EMPTY_SECTION = { isNone: false, headerCols: [], referenceCol: -1, qualityCol: -1, rows: [] };

export function parseDesignCalls(specContent) {
  try {
    const match = SECTION_RE.exec(String(specContent == null ? '' : specContent));
    if (!match) return { ...EMPTY_SECTION };

    const lines = match[1].split(/\r?\n/).map((l) => l.trimEnd());
    const tableLines = lines.filter((l) => /^\s*\|/.test(l));

    if (tableLines.length === 0) {
      const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
      if (nonEmpty.length > 0 && nonEmpty.every((l) => NONE_RE.test(l))) {
        return { isNone: true, headerCols: [], referenceCol: -1, qualityCol: -1, rows: [] };
      }
      return { ...EMPTY_SECTION };
    }

    const headerCols = splitRow(tableLines[0]);
    const referenceCol = findColumn(headerCols, REFERENCE_RE);
    const qualityCol = findColumn(headerCols, QUALITY_RE);
    const rows = tableLines
      .slice(1)
      .filter((l) => !isSeparatorRow(l))
      .map((l) => buildRow(l, referenceCol, qualityCol));

    return { isNone: false, headerCols, referenceCol, qualityCol, rows };
  } catch {
    return { ...EMPTY_SECTION };
  }
}

export function findRowDefects(section) {
  if (!section || section.isNone || !Array.isArray(section.rows)) return [];

  const columnMissing = [];
  if (section.referenceCol < 0) columnMissing.push(REFERENCE_LABEL);
  if (section.qualityCol < 0) columnMissing.push(QUALITY_LABEL);

  const defects = [];
  section.rows.forEach((row, rowIndex) => {
    const missing = columnMissing.length ? [...columnMissing] : [];
    if (!columnMissing.length) {
      if (!isPopulatedCell(row.referenceTarget)) missing.push(REFERENCE_LABEL);
      if (!isPopulatedCell(row.qualityCriteria)) missing.push(QUALITY_LABEL);
    }
    if (missing.length) defects.push({ rowIndex, slug: row.slug || '', missing });
  });
  return defects;
}
