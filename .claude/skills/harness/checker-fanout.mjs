// checker-fanout — deterministic merge of the read-only checkers' verdicts, and the
// clause-6 fan-out gate. Mechanical script fan-out is always allowed (parallel
// scripts are not subagents). LLM-AGENT fan-out is rejected until the oracle-bound
// checker amendment lands (seed.md §II.A clause 6).

/** Merge per-checker verdicts into one deterministic, order-independent result. */
export function mergeVerdicts(verdicts) {
  const checkers = verdicts.map((v) => v.checker).sort();
  const findings = verdicts
    .flatMap((v) => (v.findings || []).map((f) => ({ checker: v.checker, ...f })))
    .sort((a, b) =>
      (a.checker || '').localeCompare(b.checker || '')
      || (a.check || '').localeCompare(b.check || '')
      || (a.severity || '').localeCompare(b.severity || ''));
  const verdict = findings.some((f) => f.severity === 'BLOCKER') ? 'BLOCKED' : 'CLEAN';
  return { checkers, findings, verdict };
}

/** Enforce seed.md §II.A clause 6: no LLM-agent fan-out until the amendment lands. */
export function assertFanoutAllowed({ mode, amendmentPresent }) {
  if (mode === 'agents' && !amendmentPresent) {
    throw new Error('clause 6: fan-out not permitted — oracle-bound checker agent fan-out requires the §II.A amendment.');
  }
}
