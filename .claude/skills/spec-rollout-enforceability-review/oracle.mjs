// spec-rollout-enforceability oracle (-419d / pending-question Q-002) — mechanical
// check that every structured Rollout prerequisite binds to an enforcement-type AC.
// A missing / dangling / non-enforcing `enforced-by` is a concrete artifact (the
// row, the unresolved id, the wrong kind), so it BLOCKs under the oracle-binding
// contract; a precondition left in free prose is ADVISORY (judgment may advise but
// never block — two LLMs agree on hallucinations). The structured field IS the oracle.

// Checker config (tier-dial:read-path): this checker's floor/ceiling/mandatory come
// from the tier dial at .claude/hooks/lib/tier-dial.mjs via resolveCheckerThreshold('spec-rollout').
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';
import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';

const CHECKER = 'spec-rollout';
const ENFORCEMENT_KINDS = new Set(['preflight', 'smoke', 'error-mapping']);
const PREREQ_CUE = /\b(pre-?requisite|pre-?condition)\b/i;

// The lines of a `## <name>` section: from its heading to the next `## ` heading.
function sectionLines(spec, name) {
  const lines = spec.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${name}\\b`).test(l));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

// Split a markdown table row into trimmed cells (drop the leading/trailing empties).
function cells(row) {
  return row.split('|').slice(1, -1).map((c) => c.trim());
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isSeparatorRow(line) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

// The `### Prerequisites` table rows under `## Rollout`: { n, text, enforcedBy }.
function parsePrerequisites(spec) {
  const rollout = sectionLines(spec, 'Rollout');
  const subStart = rollout.findIndex((l) => /^###\s+Prerequisites\b/.test(l));
  if (subStart === -1) return [];

  const rows = [];
  let header = null;
  for (const line of rollout.slice(subStart + 1)) {
    if (/^#{1,3}\s/.test(line)) break;
    if (!isTableRow(line)) continue;
    if (isSeparatorRow(line)) continue;
    const c = cells(line);
    if (!header) { header = c.map((h) => h.toLowerCase()); continue; }
    const idx = header.indexOf('enforced-by');
    const enforcedCell = idx >= 0 ? (c[idx] || '') : '';
    const acMatch = /AC-\d+/i.exec(enforcedCell);
    rows.push({
      n: c[0] || String(rows.length + 1),
      text: c[1] || '',
      enforcedBy: acMatch ? acMatch[0].toUpperCase() : '',
    });
  }
  return rows;
}

// The `## Acceptance criteria` table as a Map<AC-id, kind-lowercased>.
function parseAcKinds(spec) {
  const ac = sectionLines(spec, 'Acceptance criteria');
  const map = new Map();
  let kindIdx = -1;
  for (const line of ac) {
    if (!isTableRow(line) || isSeparatorRow(line)) continue;
    const c = cells(line);
    if (kindIdx === -1) {
      kindIdx = c.findIndex((h) => h.toLowerCase() === 'kind');
      continue;
    }
    const idMatch = /AC-\d+/i.exec(c[0] || '');
    if (!idMatch || kindIdx < 0) continue;
    map.set(idMatch[0].toUpperCase(), (c[kindIdx] || '').toLowerCase());
  }
  return map;
}

// A free-prose precondition lives in a Rollout line carrying a prerequisite cue.
function hasFreeprosePrerequisite(spec) {
  return sectionLines(spec, 'Rollout')
    .filter((l) => !/^###\s/.test(l))
    .some((l) => PREREQ_CUE.test(l));
}

export function runRolloutOracle({ specContent }, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];

  const rows = parsePrerequisites(specContent);
  const acKinds = parseAcKinds(specContent);

  for (const row of rows) {
    const base = { file: null, line: null, artifact: { kind: 'rollout-prereq', locus: `prerequisite ${row.n}` } };
    if (!row.enforcedBy) {
      findings.push(normalizeFinding({
        ...base,
        check: 'missing_enforced_by',
        evidence: `prerequisite ${row.n} has no enforced-by`,
        message: `Rollout prerequisite ${row.n} ("${row.text}") has no enforced-by pointer.`,
        suggested_fix: 'Add an enforced-by: AC-NNN pointing to a preflight/smoke/error-mapping AC.',
      }, { mandatory }));
      continue;
    }
    if (!acKinds.has(row.enforcedBy)) {
      findings.push(normalizeFinding({
        ...base,
        check: 'dangling_enforced_by',
        evidence: `${row.enforcedBy} not found in the Acceptance criteria table`,
        message: `Rollout prerequisite ${row.n} points at ${row.enforcedBy}, which is not a real AC.`,
        suggested_fix: `Point enforced-by at an existing enforcement-type AC, or add ${row.enforcedBy}.`,
      }, { mandatory }));
      continue;
    }
    const kind = acKinds.get(row.enforcedBy);
    if (!ENFORCEMENT_KINDS.has(kind)) {
      findings.push(normalizeFinding({
        ...base,
        check: 'non_enforcement_kind',
        evidence: `${row.enforcedBy} has Kind "${kind || '(none)'}"`,
        message: `Rollout prerequisite ${row.n} points at ${row.enforcedBy}, whose Kind is not an enforcement kind.`,
        suggested_fix: `Point at an AC whose Kind is one of: ${[...ENFORCEMENT_KINDS].join(', ')}.`,
      }, { mandatory }));
    }
  }

  if (rows.length === 0 && hasFreeprosePrerequisite(specContent)) {
    findings.push(normalizeFinding({
      check: 'freeprose_prerequisite',
      file: null,
      line: null,
      evidence: 'a Rollout prose line names a prerequisite with no structured row',
      message: 'A Rollout prerequisite lives in free prose; move it into the ### Prerequisites table to make it enforceable.',
      suggested_fix: 'Add a ### Prerequisites row with an enforced-by pointer.',
      artifact: null,
    }, { mandatory }));
  }

  return { findings };
}
