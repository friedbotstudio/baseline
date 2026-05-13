# Harness auto-continuation across non-yield workflow phases

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The 11-phase workflow stops mid-flight on every parent→child Skill invocation, forcing the user to type "continue" between phases that have no human-input gate. Two distinct user reports point to the same root cause; the second was reproduced and verified against the session transcript on 2026-05-12.

Concrete reproduction:

- Slug `design-ui-orchestrator`, mid-`/integrate`.
- Integrate's SOP Step 2 invoked `Skill(verify)`.
- Verify ran the test command, stamped `.claude/state/last_test_result` with `PASS`, and rendered its inline PASS report as a TEXT block (verify SOP's terminal step: "Return the verdict report inline").
- The turn ended at the verify report. No further tool use.
- Integrate's Steps 3–5 (read line 1 of `last_test_result`, optional cross-engine smoke, append to `workflow.json → completed`, tell the user "Next: `/document`") never fired.
- The user typed "mark this unexpected pause, and then continue" to resume.

The pause is not a runtime cutoff. The runtime ends a turn when the model stops issuing tool calls. The model stopped because the active SOP — `verify/SKILL.md`, loaded by `Skill(verify)` — completed its instructions, and the parent `integrate/SKILL.md` body sat several screens of bash output up in conversation history. There is no skill-call stack; the parent's remaining steps are not automatically re-attended-to.

Scope of the same pattern across the workflow: an audit of every parent→child Skill invocation in `.claude/skills/` (2026-05-12, in-session) found at least 13 risky call sites, including `simplify→verify`, `chore→verify`/`archive`/conditional phases, `tdd→scenario`/`implement`/`verify`/`design-ui`, `document→prose`/`documentation`/`technical-tutorials`, and `harness→every-phase-skill`. The integrate→verify case is the cleanest reproduction; the others share the structural property that the parent's post-Skill instruction is descriptive rather than a forced tool call.

Verbatim user reports recorded in `pending-questions.md` Q-003:

> our harness stops when it need not to

> mark this unexpected pause, and then continue

## Goal

The workflow advances autonomously through every non-gated phase. The user types nothing between `/scout → /research → /spec`, between `/simplify → /security → /integrate → /document → /archive`, or between any two phases whose progression does not require a human decision. Consent gates (`/approve-spec`, `/approve-swarm`, `/grant-commit`) and integrate-failure-needs-spec-change decisions remain the only places the workflow stops for a user.

## Non-goals

- **Not changing the meaning of consent gates.** Articles IV gate A/B/C remain structurally un-forge-able. The new auto-continuation mechanism MUST NOT auto-fire across a consent gate.
- **Not editing vendored skills.** `impeccable`, `humanizer`, `code-structure`, `documentation`, `technical-tutorials`, `copywriting`, `claude-automation-recommender` are Apache 2.0 vendored per Article IX. They stay byte-identical.
- **Not adding a new subagent.** Article II reserves subagents for `/swarm-dispatch` only. Auto-continuation runs in main context.
- **Not redesigning the swarm dispatch worker model.** The `swarm-worker` subagent already has its own turn-loop; it does not exhibit the parent-SOP-resume pause.
- **Not introducing a polling loop or sleep.** Auto-continuation is event-driven (Stop hook + harness re-fire), not interval-driven.
- **Not changing the `.claude/state/last_test_result` file format.** The `verify_pass_guard` hook reads line 1 of this file as the single source of truth; the byte-level format stays identical so the guard does not need updating.

## Success metrics

- **User keystrokes per workflow run** — baseline: one "continue" per autonomous phase boundary (≥ 4 per spec-track run: post-scout, post-research, post-spec/post-approval, post-simplify, post-integrate, post-document; minimum 4 forced continues in a typical run). Target: 0 between non-gated phases. Measured via: count of user prompts in the session transcript between `/approve-spec` and `/archive` for a representative slug — should be 0 prompts (excluding any optional review/inspection prompts the user volunteers).
- **Audit pass rate** — baseline: `bash .claude/skills/audit-baseline/audit.sh` exits 0 on `main`. Target: exits 0 after the refactor lands. Measured via: `/verify` (or its inlined equivalent) at `/integrate` time.
- **Test count** — baseline: 104/104 root tests pass + audit-baseline PASS as of the most recent integrate (2026-05-12). Target: the post-refactor counts remain ≥ that baseline (allowing for new tests added for the new behavior).
- **Pause regression check** — baseline: at least 13 parent→child Skill sites can pause within a single phase. Target: 0 within-phase pauses across the canonical spec-track happy path, measured via a representative end-to-end dry-run after the refactor.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner; raised both Q-003 verbatim instances).
- **Reviewer**: razieldecarte@gmail.com (sole reviewer at present; same person).
- **Operator** (who runs it in prod): razieldecarte@gmail.com on this machine; downstream operators are any future user of the `create-baseline` shipped harness once the change propagates into `src/`.

## Constraints

- **Non-git project.** This repo is not a git work tree; `grant-commit` and `commit` are auto-excepted at triage. The workflow ends after `/archive`. The auto-continuation mechanism must work cleanly in the non-git case and the git case alike.
- **Hook execution model.** `.claude/hooks/` are Bash + python3, no jq (per `.claude/hooks/lib/common.sh` convention). The new Stop hook MUST follow the same shape and source `lib/common.sh` for shared helpers.
- **`verify_pass_guard` immutability.** The hook reads line 1 of `.claude/state/last_test_result`. The new inlined-or-helper verify path MUST preserve that file's format byte-for-byte.
- **Article II.** Decisions stay in main context. The auto-continuation mechanism cannot delegate decision-making to a subagent.
- **Article IV consent gates.** `consent_gate_grant.sh` (UserPromptSubmit) writes the gate marker before Claude sees the prompt; the marker is single-use. Auto-continuation MUST NOT bypass this. The Stop hook MUST check for pending consent and stay silent when a gate is due.
- **Article IX vendoring.** No edits to vendored skills. Sub-skills like `humanizer` that are called *inside* a single phase remain Skill-invokable in the current model; the user reports do not include a pause attributable to vendored sub-skills, and re-architecting around them is out of scope here.
- **Audit-baseline counts.** Adding a new Stop hook bumps the hook count from 21 → 22. The `EXPECTED_HOOK_COUNT` (or equivalent) in `audit-baseline/audit.sh`, plus CLAUDE.md Article VIII's hook table, plus seed.md §4.1, plus README.md surface — all must update in lockstep.
- **CLAUDE.md Article V wording change.** Article V currently states `/harness` is "user-only" and that Claude "may **suggest** `/harness` in conversation but cannot trigger it." This wording, the matching `disable-model-invocation: true` frontmatter on `harness/SKILL.md`, and the matching "Resume after yield: the user re-invokes `/harness`" paragraph in the same file all need a coordinated rewrite.
- **TDD phase decomposition risk.** `/tdd` currently nests `Skill(scenario)`, `Skill(implement)`, `Skill(verify)`, and `Skill(design-ui)`. Decomposing `/tdd` into a thin coordinator that hands state to the harness for separate-tick invocation is the largest scope item and must preserve every Article VI engineering rule and the RALPH-loop cap.
- **No new dependencies.** No NPM packages, no new MCP servers. The change is local to `.claude/`, `CLAUDE.md`, `docs/init/seed.md`, `src/` templates, and `README.md`.

## Acceptance criteria

1. **AC-001 — Cross-phase auto-continuation (happy path).** Given an open workflow at any non-gated, non-excepted phase, when that phase's skill stamps its completion (appends to `workflow.json → completed` and writes its `state == "continue"` signal), then the next user prompt is NOT required for the workflow to advance to the next pending phase. The next phase begins on the immediately-following turn, triggered by the new Stop hook re-firing `Skill(harness)`. Test: end-to-end run from `/intake` through `/archive` on a representative slug, with the user typing nothing between `/intake` and `/scout` (and every other non-gated transition). Pass iff the harness log records each phase transition with no intervening user prompt.

2. **AC-002 — Gate yield is honored.** Given a phase whose completion lands on a consent-gate task (`needs_user: true` in TaskList metadata) or on the integrate-failure-needs-spec-change path, when the phase ends, then harness writes `state == "yielded"` to `.claude/state/harness_state` and the Stop hook DOES NOT re-fire. Test: drive the workflow to the post-`/spec` boundary; assert that the Stop hook output for that turn is silent (no additionalContext re-firing harness) and that the next user prompt is the only thing that resumes the workflow. Repeat for the post-`/archive` boundary on a git project (post-`/archive` on non-git terminates the workflow, asserted in AC-005).

3. **AC-003 — Harness frontmatter is model-invokable.** `.claude/skills/harness/SKILL.md` no longer carries `disable-model-invocation: true`; CLAUDE.md Article V's "user-only" wording is rewritten to match the new contract ("auto-continued by Stop hook between non-gated phases; user invokes manually for fresh starts and resume-after-yield"). Test: grep for `disable-model-invocation` in `harness/SKILL.md` returns no match; CLAUDE.md Article V no longer contains the literal phrase "user-only" in reference to `/harness`.

4. **AC-004 — TDD phase decomposes into per-worker harness ticks.** `/tdd` no longer invokes `Skill(scenario)`, `Skill(implement)`, `Skill(verify)`, or `Skill(design-ui)` from within its own SOP. Instead, `/tdd` writes a recipe + contract state file at a known path; the harness's next ticks invoke each worker as its own phase. The four workers each surface as their own task in the TaskList. Test: grep for `Skill(scenario|implement|verify|design-ui)` in `tdd/SKILL.md` returns no match; a `/tdd` run on a fixture spec produces ≥ 4 harness-log entries (one per worker), and the TaskList shows the workers as discrete entries created mid-workflow.

5. **AC-005 — Verify mechanical work is inlined; statefile format unchanged.** The 3 mechanical operations of `verify` (read `project.json → test.cmd`, run it via Bash, write `.claude/state/last_test_result` with `<PASS|FAIL>\n<ISO timestamp>\n<exact command>\n<exit code>\n`) are inlined into each caller that previously did `Skill(verify)`. `verify/SKILL.md` becomes a contract-only document describing the statefile format. Test: byte-diff a `last_test_result` produced by the post-refactor caller against the format spec in `verify/SKILL.md` — exact match required. `verify_pass_guard.sh` continues to read line 1 unchanged.

6. **AC-006 — Consent gates remain structurally un-forge-able.** `consent_gate_grant.sh` (UserPromptSubmit), `spec_approval_guard.sh`, `swarm_approval_guard.sh`, and `git_commit_guard.sh` continue to enforce the marker-validation pattern. The new Stop hook MUST NOT write any of the three `.spec_approval_grant` / `.swarm_approval_grant` / `.commit_consent_grant` markers. Test: grep for `_approval_grant\|commit_consent_grant` in the new Stop hook returns no match; an attempted forge via the Stop hook path (a regression test) is rejected by the existing guards.

7. **AC-007 — Audit-baseline passes.** `bash .claude/skills/audit-baseline/audit.sh` exits 0 after the refactor. The script's `EXPECTED_*` counts (hooks, skills, commands, agents) and CLAUDE.md Article VIII's hook table reflect the new Stop hook. `seed.md §4.1` lists the new hook with its Article mapping. Test: the integrate phase's verify stamp reads PASS.

8. **AC-008 — Test suite passes; no regression.** Existing tests (104/104 root + audit-baseline) continue to pass. New tests cover the Stop-hook re-fire decision, the `harness_state` write protocol, and the gate-yield silence behavior. Test: `node --test --test-reporter=spec tests/*.test.mjs` plus the audit script — both pass.

9. **AC-009 — Within-phase pause regression check.** A canonical happy-path dry-run (intake → scout → research → spec → approve-spec → tdd → simplify → security → integrate → document → archive) shows zero within-phase mid-SOP pauses on a representative slug; every transition is logged with no intervening user prompt other than the consent-gate prompts themselves. Test: end-to-end run on a fixture slug; harness log analysis confirms zero "continue" prompts from user between turns inside any phase.

10. **AC-010 — Stop hook idempotence.** The new Stop hook fires on every turn end (Claude Code's normal behavior). It MUST be safe to fire when no harness work is in progress: silent return if `.claude/state/harness_state` is missing, malformed, stale (older than configurable TTL), or absent of a recent `Skill(harness)` tool call in the last assistant turn. Test: unit test the hook script with fixture inputs covering each silent case; assert no additionalContext emitted.

## Open questions

- **OQ-1 — Stop-hook re-fire mechanism.** Two plausible mechanisms for "re-fire `/harness` from a Stop hook": (a) emit `additionalContext` telling Claude to invoke `Skill(harness)` on the next turn (passive — depends on Claude reading the context and choosing to invoke); (b) return `decision: "block"` with a reason that keeps the same turn open (active — but inherits the parent-SOP-resume problem). Research phase will validate which of these Claude Code's Stop hook contract actually supports and is reliable. If neither cleanly works, an alternative is a programmatic injection via the slash command channel — needs investigation.

- **OQ-2 — `harness_state` file shape.** Proposed: `{state: "continue" | "yielded" | "done", reason: "<text>", written_at: <epoch>, slug: "<slug>"}`. Open whether a slug field is needed (a single workflow is open at a time per project) and whether a TTL field should be carried inline or kept in `project.json → harness.state_ttl_seconds`. Research phase decides.

- **OQ-3 — Detecting "last tool call was `Skill(harness)`".** The Stop hook needs to distinguish "harness ran this turn → safe to re-fire" from "user did unrelated work this turn → leave alone." The mechanism could be (a) reading the latest assistant message's tool_use blocks from the live session JSONL; (b) the harness writing a per-tick marker the Stop hook reads and clears; (c) something else. Research phase picks the cleanest read.

- **OQ-4 — Hoisted-worker task creation timing.** When `/tdd` decomposes into per-worker harness ticks, who creates the worker tasks in the TaskList — the `/tdd` coordinator itself, or the harness on the next tick after reading `/tdd`'s state file? Either works; consistency with the existing triage-seeds-tasks pattern argues for `/tdd` creating them.

- **OQ-5 — Phase ordering for the new workers.** If scenario / implement / verify / design-ui each become a phase tick, do they get appended to `workflow.json → completed` individually? The phase-ordering enforcement (`track_guard.sh`) currently expects discrete phase names. Whether to add `scenario` / `implement` etc. as recognized phase names, or to keep them as sub-phases of `tdd` in workflow.json, is a design decision for spec.

- **OQ-6 — Backward-compat with existing skills calling `Skill(verify)`.** Inlining verify into each caller means several files change in lockstep. Whether to keep `verify/SKILL.md` as a callable shim (returning a friendly "verify is inlined; see docs" message) or delete the SKILL invocation path entirely affects how the audit-baseline counts adjust and whether `/init-project` template overlays change. Spec decides.

- **OQ-7 — Eat-your-own-dogfood test.** The strongest validation is to run this very workflow (`harness-auto-continuation`) under the new auto-continuation mechanism after implementation. Plan that as the final integrate-time validation, but capture the test plan now so the spec can name it as AC-001's evidence.
