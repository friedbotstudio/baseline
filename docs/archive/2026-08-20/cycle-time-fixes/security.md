# Security reports — cycle-time-fixes

## cycle-time-fixes-2026-08-20.md

# Security Review — main (cycle-time-fixes) — 2026-08-20

## Summary

Overall risk: **LOW**. The diff is 13 files / 292 insertions across workflow instrumentation
(`.claude/hooks/lib/timing.mjs`), a phase-skip threshold (`.claude/skills/harness/rightsize-gate.mjs`),
one added track node (`.claude/workflows.jsonl`), and governance prose. It adds no dependency, no
network call, no filesystem path derived from new input, and no credential handling. One LOW
robustness finding is recorded below. Two areas that could plausibly have weakened an enforcement
boundary — the consent gates and the right-size skip envelope — were checked explicitly and hold.

## What was checked

- Secrets hygiene across every added line (key / token / password / private-key patterns). Only hits
  were the pre-existing identifier `approveTokenMs`; no literal secret is introduced.
- Every path-composition site in `timing.mjs`. The new `attempts` values reach a JSONL **value** and a
  dedup Set key; they never reach a path. `timingPath` and `approvalTokenPath` still derive solely
  from `wf.slug`, still behind `assertSafeSlug` / `isSafeSlug` (CWE-22 posture unchanged).
- Consent-gate integrity across all 11 tracks after the DAG edit: `approve-direction`, `approve-swarm`
  and `grant-commit` each still carry `needs_user: true`, and every `commit` node still declares
  `grant-commit` in `depends_on`.
- The right-size skip envelope against seed.md §450: the skip set is still a subset of
  `{simplify, document}`, `security` is still never auto-skipped, and the fail-open path is unchanged.
- New/updated dependencies: none. `package.json` is untouched.

## Findings

### [LOW] Attempt-label expansion is bounded per phase but not across phases
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-770 (Allocation Without Limits)
- **File**: `.claude/hooks/lib/timing.mjs:146`
- **Evidence**:
  ```js
  for (const [phase, count] of Object.entries(attempts)) {
    if (!phase || !Number.isSafeInteger(count) || count < 2) continue;
    for (let k = 2; k <= Math.min(count, MAX_ATTEMPTS); k += 1) labels.push(`${phase}:attempt-${k}`);
  }
  ```
- **Impact**: `MAX_ATTEMPTS` caps each phase at 99 labels, but the number of KEYS is unbounded. A
  `workflow.json` carrying a very large `attempts` object would expand to keys × 99 strings in memory
  during a PostToolUse hook. Reachability is the mitigating factor and the reason this is LOW rather
  than MEDIUM: `attempts` is written only by the harness with phase names drawn from the track DAG,
  the file is local trusted state, and the surrounding `try/catch` in `phase_timer.mjs` already
  prevents a throw from disturbing the workflow. There is no untrusted-input path to this field.
- **Recommendation**: Accept for now. If a cap is wanted later, bound the key count in the same guard
  rather than the label count — the phase roster is small and knowable from the track DAG.

## Dependencies

No packages added, removed, or version-changed in this diff.

## Out of scope / Noted

- `renderTable` interpolates a phase label into a markdown table cell. A label containing `|` would
  break the rendered table in `timing.md`. This is a cosmetic integrity issue in a local report, not a
  trust-boundary defect, and the labels are harness-authored. Noted, not filed.
- The widened right-size window (8 files / 200 lines, from 4 / 80) increases the share of diffs that
  skip `simplify` and `document`. Neither is a security control, and the `sensitive_surface_unreviewed`
  advisory still fires independently when `security` is not running.

