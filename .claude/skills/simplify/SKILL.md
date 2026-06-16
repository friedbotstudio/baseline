---
name: simplify
owner: baseline
description: Workflow Phase 7 — Mechanical cleanup pass over the branch diff, followed by a `code-structure` review pass and a `verify` re-stamp. Shadows the global `simplify` skill at project scope; the cleanup pass is performed inline rather than via Skill self-call.
---

> Checker config (tier-dial:read-path): this checker's floor/ceiling come from the tier dial at `.claude/hooks/lib/tier-dial.mjs` via `resolveCheckerThreshold('review')`. Advisory only this slice (v1 piece 2); blocking is piece 5.

# Prereq

`tdd` in `completed` AND `.claude/state/last_test_result` line 1 is `PASS`.

# Note on shadowing

This skill **shadows** the global `simplify` skill (same name, project scope wins). To avoid invoking itself, the cleanup pass is performed inline below — do **not** invoke `simplify` via the Skill tool from inside this file.

# Steps

## 1. Verify prereq

Read `.claude/state/last_test_result`; line 1 must be `PASS`.

## 2. Mechanical cleanup pass over the diff

Across the diff of this branch — **delete, don't comment out**:

- Dead code (unreferenced functions, unused imports, unreachable branches).
- Duplication that can collapse without harming readability.
- Over-abstraction (premature factories, single-implementation interfaces).
- Commented-out code — seed.md forbids it.
- `TODO` / `FIXME` / `HACK` / `XXX` — resolve or remove; seed.md forbids them in source.
- Stubs, `raise NotImplementedError`, "not implemented" placeholders.

## 3. `code-structure` review pass

Invoke `Skill(code-structure)` and apply its Detection Rules to every file the branch touches:

- Orchestration files leaking raw primitives or inline business logic.
- Siblings at mixed abstraction levels (named call next to raw primitive).
- Loop bodies carrying more than one abstraction level.
- Domain modules reaching directly for raw infrastructure.
- Files longer than ~80 lines of substantive code — split along layer lines.

Fixes here are in scope. Refactors that go beyond layering (new design patterns, interface changes) are **out of scope** — flag them and leave for a follow-up spec.

## 4. Scope guardrails

- Do not add features.
- Do not refactor scope beyond cleanup.
- Do not change public APIs. If a public API needs changing, surface it and stop — that belongs in a new spec.

## 5. Re-verify (inlined)

Inline the four mechanical operations from `.claude/skills/verify/SKILL.md` (the contract doc):

- Read `.claude/project.json` → `test.cmd`. If absent or empty, the verdict is `FAIL` with reason "project.json not configured" and step 5 stops with that verdict.
- Run the command via Bash from the project root. Capture stdout, stderr, exit code. Do not retry.
- Apply verdict rules: `PASS` iff exit code 0 AND at least one test executed AND no failed/errored test; otherwise `FAIL`.
- Atomically write `.claude/state/last_test_result` with the canonical four-line format (`<PASS|FAIL>\n<ISO-8601 UTC timestamp>\n<exact command>\n<exit code>\n`). The `verify_pass_guard` hook reads line 1 as the binding verdict.

## 6. Decide + write harness_state

- **Still PASS** → append `"simplify"` to `completed`. Marker FIRST: `echo "<slug>" > .claude/state/.harness_active` (refresh the active marker). Then write `.claude/state/harness_state` with `{state: "continue", slug, reason: "simplify clean; next: security or integrate"}` — exactly three keys; no `written_at`, no `tick_count`. Tell the user: "Cleanup done, tests green. Next: `/security` (optional) or `/integrate`."
- **FAIL** → revert the cleanup changes and surface exactly what broke (test name + first assertion). Marker FIRST: `rm -f .claude/state/.harness_active`. Then write `harness_state` with `{state: "yielded", slug, reason: "simplify FAIL after cleanup; reverted; needs user review"}`.

# Constraints

- **Never invoke the global `simplify` via the Skill tool from this file.** Name shadowing makes that a self-call.
- **Cleanup is mechanical.** If you find yourself reasoning about a refactor's design implications, stop — that's outside this phase's scope.
