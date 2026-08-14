---
key: globtoregex-is-copied-nine-times-and-four-copies-backtrack-7a3e
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-14
verified-at: 33953da
last-touched: 2026-08-14
governs: .claude/hooks/spec_design_calls_guard.mjs, .claude/hooks/lib/common.mjs, .claude/skills/triage/governance-class.mjs, .claude/skills/harness/rightsize-gate.mjs, .claude/skills/spec-lint/lint.mjs
superseded-at: 2026-08-14
---

> The same catastrophic backtracking is reachable today through at least four more live copies of `globToRegex`. Not introduced by that workflow and not fixed by it; fixing four modules across three subsystems inside a cleanup pass is the scope expansion the `/simplify` guardrail refuses.

- **The work.** Hoist `globToRegex` into one shared foundation module and delete the copies, or apply the run-collapse to each. Prefer hoisting: nine copies of a matcher is nine chances for this to come back.
- **The defect.** Each copy emits per star (`c === '*'` with a single-lookahead `i++`), so a run of N stars compiles to adjacent unbounded groups (`.*[^/]*.*…`) and backtracks catastrophically. `write-set-profile.mjs` was fixed on 2026-08-14 by consuming the whole run and emitting once; the rest were not.
- **Measured, not assumed.** `harness/rightsize-gate.mjs` exports `matchesAnyGlob` at line 55; a probe against a 300-character path with a 60-star pattern timed out at 25 s where the fixed module returns in 0.45 ms. The other three match the same source shape. `spec-lint/lint.mjs:155` differs and needs reading before it is called safe or unsafe. The four `impeccable/` copies are vendored third-party and were not reviewed.
- **Why it matters most in rightsize-gate.** That copy runs on every post-`tdd` gate against `project.json → tdd.test_globs`. A pathological glob there hangs the harness. Input is repo-local config rather than user text, so severity is MEDIUM: a self-inflicted denial of the developer's own session, not a remote-reachable DoS.
- **What a hoist has to answer.** The hook-lib self-containment convention exists deliberately — a hook lib importing another hook lib is the thing it forbids. See [[claude-hooks-lib-governed-memory-mjs-51]] for the two-vocabularies-one-code-path precedent. A hoist that ignores that convention will be reverted by the next person who reads it.
- **How it was found.** `/simplify` on the T11 workflow, not `/security`. The security pass named the pre-existing exposure but scoped it to one module's two callers and never asked whether the function was duplicated. A finding about a copied helper is incomplete until the copies are counted. Full analysis: `docs/archive/2026-08-14/epic6-t11-landmark-scope-rehome/security.md`.
- Instance of [[one-rule-two-copies-one-on-a-write-path]] at nine copies rather than two.
