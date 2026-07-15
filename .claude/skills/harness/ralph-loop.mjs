// ralph-loop — the bounded maker/checker RALPH round machine (C3, piece 5).
//
// Drives rounds up to the checker's tier-dial ceiling and returns one terminal state:
//   CONVERGED — the checker went CLEAN within budget.
//   STOPPED   — only ungrounded (advisory) findings remain; they cannot block.
//   RED       — a grounded finding persists below the floor (ceiling reached, or the
//               maker is stuck with no progress). RED yields to a human — it is never a
//               silent advisory downgrade and never a PASS (D3, mirroring verify_pass_guard).
//
// Arbitration is mechanical grounding (D4): only a finding with a concrete artifact may
// drive RED. An ungrounded checker finding degrades to advisory — EXCEPT `code-structure`,
// whose ungrounded readability findings escalate to the human reviewer (D6). Fail-CLOSED:
// a missing or broken dependency yields RED, never a silent PASS.

import { appendRoundTrip } from './evidence-ledger.mjs';

function red(reason, rounds = 0, escalated = false) {
  return { state: 'RED', rounds, reason, escalated };
}

function findingKey(finding) {
  return `${finding.check || ''}|${finding.artifact ? JSON.stringify(finding.artifact) : ''}`;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export async function runRalph({ checker, ctx, deps }) {
  if (!deps || typeof deps.runChecker !== 'function' || typeof deps.resolveThreshold !== 'function') {
    return red('fail-closed: missing or broken deps');
  }
  let threshold;
  try {
    threshold = deps.resolveThreshold();
  } catch (err) {
    return red(`fail-closed: threshold resolution failed (${err.message})`);
  }
  const ceiling = Number.isInteger(threshold?.ceiling) && threshold.ceiling > 0 ? threshold.ceiling : 1;

  let prevKeys = null;
  for (let round = 1; round <= ceiling; round++) {
    let findings;
    try {
      const result = deps.runChecker(ctx);
      findings = result && Array.isArray(result.findings) ? result.findings : [];
    } catch (err) {
      return red(`fail-closed: checker threw (${err.message})`, round);
    }
    if (deps.ledgerPath) {
      try {
        appendRoundTrip(deps.ledgerPath, { round, checker, findings_count: findings.length, false_positive_blocks: 0 });
      } catch { /* ledger mirror is best-effort; a write hiccup never changes the verdict */ }
    }

    if (findings.length === 0) return { state: 'CONVERGED', rounds: round, reason: 'checker clean' };

    const grounded = findings.filter((f) => f.artifact != null);
    if (grounded.length === 0) {
      if (checker === 'code-structure') {
        return red('code-structure readability findings require human review (D6)', round, true);
      }
      return { state: 'STOPPED', rounds: round, reason: 'only ungrounded advisory findings remain' };
    }

    const keys = new Set(findings.map(findingKey));
    const maker = typeof deps.runMaker === 'function' ? deps.runMaker(ctx) || {} : {};
    const dry = maker.changed !== true && prevKeys && setsEqual(prevKeys, keys);
    if (dry) return red('grounded findings persist with no maker progress', round, true);
    if (round === ceiling) return red('ceiling reached, still below floor', round, true);
    prevKeys = keys;
  }
  return red('ceiling reached, still below floor', ceiling, true);
}
