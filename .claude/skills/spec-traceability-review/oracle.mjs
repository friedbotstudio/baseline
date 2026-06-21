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

  return { findings };
}
