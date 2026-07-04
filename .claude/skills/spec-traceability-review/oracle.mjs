// spec-traceability-review oracle (-d186) — mechanical trace check: every upstream
// (intake/BRD) acceptance criterion must be referenced by at least one spec AC row.
// A dropped upstream AC is an artifact (the missing number), so it can BLOCK under
// the oracle-binding contract; severity is gated by the tier dial's `mandatory`.

import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';
import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';

const CHECKER = 'spec-traceability';

/** Numbered ACs under the upstream's "## Acceptance criteria" heading: "1. ...". */
function extractUpstreamAcNumbers(intake) {
  const nums = new Set();
  let inAcs = false;
  for (const line of intake.split(/\r?\n/)) {
    if (/^##\s+Acceptance criteria/i.test(line)) { inAcs = true; continue; }
    if (inAcs && /^##\s/.test(line)) break;
    const m = /^\s*(\d+)\.\s+\S/.exec(line);
    if (inAcs && m) nums.add(Number(m[1]));
  }
  return nums;
}

/**
 * "intake AC N" references in the spec's Upstream column. Accepts the real-world
 * separators specs actually use: "intake AC 1", "intake AC-1", "intake AC1", and
 * zero-padded "intake AC-001" — a space-only regex false-flagged every hyphenated
 * reference as a dropped AC (caught by a governed round-trip on a real spec).
 */
function extractReferencedAcNumbers(spec) {
  const refs = new Set();
  const re = /intake\s+AC[\s-]?0*(\d+)/gi;
  let m;
  while ((m = re.exec(spec)) !== null) refs.add(Number(m[1]));
  return refs;
}

const DEFERRAL_REASONS_RE = /deferred:\s*(dependency|risk|cost|human-directed)\b/i;
const DEFERRAL_RE = /\bdeferred\b/i;

/**
 * AC-table rows inside "## Acceptance criteria" that defer spec-committed scope
 * (VI.4 two-sided faithful scope, erp-portables slice G). Row convention:
 * `deferred: <reason>` in the Criterion cell, reason from the closed list
 * dependency|risk|cost|human-directed. An untagged or YAGNI-tagged deferral is
 * a Critical BLOCKER — YAGNI never authorizes deferring committed scope.
 */
function extractUntaggedDeferrals(spec) {
  const offenders = [];
  let inAcs = false;
  for (const line of spec.split(/\r?\n/)) {
    if (/^##\s+Acceptance criteria/i.test(line)) { inAcs = true; continue; }
    if (inAcs && /^##\s/.test(line)) break;
    if (!inAcs || !line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const criterion = cells[2] || '';
    if (!DEFERRAL_RE.test(criterion)) continue;
    if (DEFERRAL_REASONS_RE.test(criterion)) continue;
    offenders.push({ id: cells[1] || '(unnamed row)', criterion });
  }
  return offenders;
}

export function runTraceabilityOracle({ spec, intake }, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];

  const upstream = extractUpstreamAcNumbers(intake);
  const referenced = extractReferencedAcNumbers(spec);
  const dropped = [...upstream].filter((n) => !referenced.has(n)).sort((a, b) => a - b);

  for (const n of dropped) {
    findings.push(normalizeFinding({
      check: 'upstream_ac_traced',
      file: null,
      line: null,
      evidence: `intake AC ${n} has no spec AC referencing it`,
      message: `Upstream intake AC ${n} is silently dropped — no spec AC traces to it.`,
      suggested_fix: `Add a spec AC row with "intake AC ${n}" in its Upstream column, or record the drop explicitly.`,
      artifact: { kind: 'trace-gap', locus: `intake AC ${n}` },
    }, { mandatory }));
  }

  for (const { id, criterion } of extractUntaggedDeferrals(spec)) {
    findings.push(normalizeFinding({
      check: 'deferral_tagged',
      file: null,
      line: null,
      evidence: `${id} Criterion: "${criterion}"`,
      message: `${id} defers spec-committed scope without a sanctioned reason tag — YAGNI never authorizes deferring committed scope (CLAUDE.md VI.4).`,
      suggested_fix: `Tag the row \`deferred: dependency|risk|cost|human-directed\` in the Criterion cell, or build the scope now.`,
      artifact: { kind: 'deferral', locus: id },
    }, { mandatory }));
  }

  return { findings };
}
