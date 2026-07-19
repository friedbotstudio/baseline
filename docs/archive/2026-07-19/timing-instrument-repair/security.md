# Security reports — timing-instrument-repair

## timing-instrument-repair-2026-07-19.md

# Security Review — timing-instrument-repair — 2026-07-19

## Summary

Overall risk: **LOW**. The diff modifies a fail-open PostToolUse observability library
(`.claude/hooks/lib/timing.mjs`) that has no network surface, no authentication or
authorization logic, no cryptography, and no new dependencies. All added code operates on
integers already present in process memory. One **LOW** finding is recorded — a pre-existing
CWE-22 guard asymmetry against sibling modules — which this diff neither introduces nor worsens.

## Findings

### [LOW] Path builders lack the `assertSafeSlug` guard applied in sibling modules

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/hooks/lib/timing.mjs:50-51`
- **Evidence**:
  ```js
  const timingPath = (rootDir, slug) => join(rootDir, '.claude', 'state', 'timing', `${slug}.jsonl`);
  const approvalTokenPath = (rootDir, slug) =>
    join(rootDir, '.claude', 'state', 'spec_approvals', `${slug}.approval`);
  ```
  `slug` is `wf.slug`, read from `.claude/state/workflow.json`. `stampFromWorkflow` then
  reaches a real write primitive at line 180 (`appendFileSync(timingPath(...))`). By contrast
  `.claude/skills/harness/plan-store.mjs:42` calls `assertSafeSlug(slug)` inside `planPath`,
  throwing before any path is constructed.
- **Impact**: a `workflow.json` carrying a traversing slug (e.g. `../../../../tmp/x`) would
  append JSONL outside `.claude/state/timing/`. Reaching this requires the ability to write
  `workflow.json` — which already implies local filesystem write access to the repo, so the
  path builder is not the weakest link. Not remotely reachable: no network input, no CLI arg,
  no untrusted parsing feeds `slug`.
- **Recommendation**: import and call `assertSafeSlug` from `plan-store.mjs` at the top of
  `stampFromWorkflow` and `renderTable`, matching the plan-store pattern. Per landmine
  `slug-path-guards-must-reject-not-normalize-and-three-regex-traps`, this must **REJECT**,
  never normalize — do not route through `canonicalSlug` (a normalizer), which would mask a
  traversal by silently redirecting the write.
- **Scope note**: this diff does **not** touch either path builder (confirmed by
  `git diff | grep timingPath|approvalTokenPath` → no matches). The finding is pre-existing
  and recorded here for consistency with the guarded siblings, not as a regression. It is a
  legitimate follow-up ticket, not a blocker for this landing.

## Checked and clear

Enumerated explicitly rather than asserted:

- **`batch_id` content** — composed as `` `${ts}-${existing.length}` ``: an epoch-ms integer
  and a row count. No transcript text, no paths, no identifiers, no secrets.
- **No widening of data written to disk** — `sumTranscriptTokens` is unmodified by this diff.
  The three new fields (`wait_ms`, `batch_id`, `batch_size`) are all derived integers/strings;
  no transcript content, prompt text, or file contents reach the JSONL. Token capture remains
  aggregate counts only.
- **Never-throw preserved** — the only new dereference is
  `lastObservedTs`: `prior && Number.isFinite(prior.ts) ? prior.ts : 0` short-circuits on
  `undefined`, and `pendingRows[0]` is guaranteed populated on the `existing.length === 0`
  branch (the baseline row is pushed in that exact case). `createdMs ?? ts` cannot throw. No
  new `JSON.parse` or `readFileSync` outside the existing try/catch blocks. A throw here would
  be a DoS on the Edit/Write path, so this was checked as a correctness-critical property.
- **Idempotency preserved** — the early return on
  `freshCompleted.length === 0 && freshSub.length === 0` is unchanged; re-firing on an
  unchanged `workflow.json` still appends nothing (pinned by
  `test_when_refire_unchanged_then_no_new_line` and `test_when_stamp_runs_twice_then_idempotent`).
- **Secrets hygiene** — no hardcoded tokens, keys, or credentials added; no `.env` access.
- **Injection** — no shell, SQL, or template construction in the diff.
- **Dependencies** — no packages added; `npm audit --omit=dev` reports 0 vulnerabilities.
- **A09 logging** — the change *improves* observability integrity: `batch_size` makes an
  unobserved phase distinguishable from a genuinely zero-cost one, removing a class of
  silently misleading telemetry.

## Dependencies

None added. `git diff package.json` is empty; `npm audit --omit=dev` → 0 vulnerabilities.

## Out of scope / Noted

- The `spec_approvals/` directory name is legacy (the gate was renamed `approve-spec` →
  `approve-direction` in `b887f74`); the path itself is correct and unchanged. Cosmetic only,
  but a future rename would need to migrate existing tokens or dual-read.
- The two untracked `.claude/memory/` shards in the working tree are from an earlier
  `/memory-flush` and are not part of this diff; not reviewed here.

