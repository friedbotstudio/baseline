# Add `/memory-flush` as workflow Phase 10.6 (end-of-workflow memory curation)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

`.claude/memory/_pending.md` currently holds 19 candidates that have never been flushed to canonical memory. They span four prior sessions (timestamps from 2026-05-15T20:49Z to 2026-05-16T06:20Z), and every block is the same low-signal shape — "file X touched N times this session, suggested role: <fill in from session context>". Every candidate is from files touched during a recently-shipped design-ui workflow; none of them describe stable architectural seams worth promoting as landmarks. Mass discard is the right call, but nobody has run `/memory-flush` to make that call.

The current activation model is two-pronged: the `memory_session_start` hook surfaces the count at session start, and CLAUDE.md Article III.4 binds Claude with "SHALL invoke `/memory-flush` before any workflow phase work." In practice, both prongs fail. Session-start nags compete with whatever question the user just typed — the user wants their question answered, not a memory-triage detour. Article III.4's "SHALL" is easy to defer past on the model side because the obligation has no structural enforcement (no hook blocks workflow-phase writes when `_pending.md` is non-empty). The result is monotonic candidate accumulation across sessions, and canonical memory that drifts further from project reality with every workflow that ships.

The deeper structural issue: candidates are highest signal-to-noise immediately after the work that touched them. Triaging in the next session means triaging *cold*, without the conversation context that knew why a file was touched 3 times or which library query was a passing curiosity vs. a load-bearing reference. Cold triage looks like guessing, so the curator discards almost everything — which is correct, but means the whole pipeline is producing noise.

## Goal

`/memory-flush` becomes a mandatory workflow phase (Phase 10.6) slotted between `/archive` (Phase 10.5) and `/grant-commit` + `/commit` (Phase 11), so candidate triage happens with full workflow context, canonical memory writes ship in the same commit as the work that motivated them, and the working tree is pristine at end-of-task.

## Non-goals

- Re-tuning the `memory_stop.sh` extractor's signal threshold (the noise-floor question is a separate follow-up; this change is about *when* triage runs, not about *what* gets candidate-extracted).
- Changing the `_pending.md` storage format or its gitignored-body convention.
- Adding Phase 10.6 to `/rca` (the out-of-band postmortem track) — `/rca` doesn't accumulate workflow-scoped pending state.
- Replacing the SessionStart hook's `MEMORY.md` index injection — that capability stays. Only the "K candidates pending" nag's behavior changes.
- Modifying the `/memory-flush` skill's internal contract (Step 0 sweeps, Step 1–5 triage, Step 6 report). The skill stays the same; only its invocation context changes.

## Success metrics

- After any completed workflow (`intake` → ... → `commit` or `chore` → `commit`), `_pending.md` body is empty (skeleton-only). Baseline: 19 candidates carried across 4 sessions. Target: 0 candidates carried beyond a completed workflow. Measured via: `python3 -c "import re; print(len(re.findall(r'^## CANDIDATE:', open('.claude/memory/_pending.md').read(), re.M)))"` immediately after `/commit`.
- For 5 consecutive completed workflows, mean stale-candidates-carried-forward = 0. Baseline: current state (debt accumulates indefinitely). Target: 0. Measured via: candidate-count of `_pending.md` at session start of the workflow following each completion.
- Audit-baseline exits 0 PASS after the change. Baseline: 0 PASS today. Target: 0 PASS post-change. Measured via: `bash .claude/skills/audit-baseline/audit.sh; echo $?`.
- This workflow itself ends with a clean `git status`. Baseline: N/A (new requirement). Target: clean tree after `/commit`. Measured via: `git status --porcelain | wc -l` → 0.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner).
- **Reviewer**: Tushar Srivastava (no separate review pipeline in this baseline; the gate-A `/approve-spec` token is the structural review checkpoint).
- **Operator**: every future `/harness` invocation in this repository, plus every project bootstrapped via `npx @friedbotstudio/create-baseline` once the template ships the new phase.

## Constraints

- **Meta-bootstrap.** This workflow itself must demonstrate the new phase. Task #12 in the seeded TaskList is `Run /memory-flush for memory-flush-phase`. The change cannot ship without the closing workflow exercising it.
- **Pristine tree at end-of-task.** After `/commit` closes this workflow, `git status` must report clean. Canonical memory writes (`.claude/memory/*.md` updates produced by Phase 10.6's curation) ride in the same commit as the work that motivated them. The `_pending.md` body reset is part of that commit.
- **Article XI mirror invariant.** `src/CLAUDE.template.md` Article XI mirrors CLAUDE.md Article XI byte-equal. This change touches Articles III/IV/V, not XI, but full-file mirror conventions still apply.
- **No track_guard regression.** `/memory-flush` writes to `.claude/memory/*.md`, which are not workflow artifacts (not slug-scoped under `docs/`). track_guard should not need to learn about Phase 10.6, but a verification step confirms it. If track_guard's phase-order list is consulted at any point, it must learn the new ordering.
- **Idempotent on empty pending.** If a workflow accumulates zero candidates, Phase 10.6 must complete as a fast no-op success without prompting the user — otherwise every clean workflow eats an unnecessary 5–10 tool calls.
- **Backward-compatible nag.** The `memory_session_start` hook's existing index injection (the `MEMORY.md`-derived summary block) stays. The "K candidates pending — run `/memory-flush`" sub-message changes from "before any workflow phase work" framing to "carried over from a prior workflow" framing, fires only when `workflow.json` is absent (no active workflow) and K > 0.
- **Resolves Q-001 in `pending-questions.md`.** This change is the canonical resolution. The closing commit deletes the Q-001 entry (auto-close mechanism — add `resolved-at: <ISO>` field, let the next memory-flush sweep clean it up; or close inline in this commit's memory-flush invocation).

## Acceptance criteria

1. **Phase ordering — runtime.** Given a workflow with `entry_phase=intake` (or any entry phase that doesn't except `memory-flush`), when the harness loop completes `/archive`, the next pending TaskList task is `Run /memory-flush for <slug>` (blockedBy the archive task, blocking the grant-commit task), and `Skill(harness)` invokes `Skill(memory-flush)` before yielding at the grant-commit gate.

2. **Idempotent no-op on empty pending.** Given a workflow where `_pending.md` body contains zero `## CANDIDATE:` blocks when Phase 10.6 fires, when `Skill(memory-flush)` is invoked, it completes with `success: true` in ≤ 3 tool calls (read pending, recognize empty, append `"memory-flush"` to `workflow.json → completed`), surfaces a one-line "no candidates to triage" report, and does not prompt the user.

3. **Full triage on populated pending.** Given a workflow where `_pending.md` body contains N≥1 candidates when Phase 10.6 fires, when `Skill(memory-flush)` is invoked, it executes Step 0 (auto-close + prose-scan + stale-sweep modes of `sweep.py`), Steps 1–5 (read canonical, decide per candidate, verify, write, reset), and Step 6 (report). At the end, `_pending.md` body matches the skeleton-only shape (no `## CANDIDATE:` blocks remain).

4. **Co-located commit.** Given a workflow that completes through `/commit`, when `git show --name-only HEAD` is run immediately after, then any `.claude/memory/<canonical>.md` files modified by Phase 10.6 appear in the same commit as the workflow's primary changes. `_pending.md` body content does not appear in the diff (it's gitignored content below the second `---` separator); only the skeleton header is committed.

5. **Pristine tree.** Given a workflow that completes through `/commit`, when `git status --porcelain` is run immediately after, then the output is empty.

6. **Triage seeding.** Given `/triage` for any new workflow with `entry_phase ∈ {intake, spec, tdd}` on a git project, when the TaskList is seeded, then exactly one task with `metadata.phase == "memory-flush"` exists in the chain, addBlockedBy the `/archive` task and addBlocks the `Wait for /grant-commit` task.

7. **Debt-mode nag — fires on prior-workflow debt.** Given a session start where `_pending.md` body has K≥1 candidates AND `.claude/state/workflow.json` is absent, when the `memory_session_start` hook fires, the additional-context block includes a line of the form "K pending memory candidates carried over from a prior workflow — run `/memory-flush` to clear before starting new work" (not the current "before any workflow phase work" framing).

8. **Debt-mode nag — silent when clean.** Given a session start where `_pending.md` body has zero candidates, when the `memory_session_start` hook fires, no "pending candidates" line appears in its additional-context block.

9. **Debt-mode nag — silent during active workflow.** Given a session start where `_pending.md` body has K≥1 candidates AND `workflow.json` exists (active workflow), when the hook fires, no "pending candidates" line appears (the active workflow's Phase 10.6 will handle them; the nag would be redundant).

10. **Constitution + mirror consistency.** Given the post-change tree, when CLAUDE.md, `src/CLAUDE.template.md`, `docs/init/seed.md`, `src/seed.template.md`, `.claude/skills/harness/SKILL.md`, and `.claude/skills/triage/SKILL.md` are scanned for phase-ordering enumerations, then every enumeration consistently names Phase 10.6 as `memory-flush` slotted between Phase 10.5 (`archive`) and Phase 11 (`commit`).

11. **Commit prereq gate.** Given the `commit` skill, when invoked with `workflow.json → completed` containing `archive` but NOT `memory-flush` (and `memory-flush` not in `exceptions`), then commit refuses with an error naming the missing prereq. When `memory-flush` is in `completed`, commit proceeds.

12. **Audit-baseline passes.** Given the post-change tree, when `bash .claude/skills/audit-baseline/audit.sh` is run, then exit status is 0 (PASS) with no new FAIL lines introduced relative to the pre-change baseline.

13. **Q-001 resolution committed.** Given the post-change tree, when `.claude/memory/pending-questions.md` is read, then Q-001 is either absent (deleted by auto-close) or carries a `Resolution:` line referencing this workflow's spec at `docs/specs/memory-flush-phase.md`.

## Open questions

- Should the chore track also include Phase 10.6? Chore can produce memory candidates (e.g., a dependency bump that the extractor flags as a library candidate). Default-yes recommendation: chore runs memory-flush too, with the same idempotent-no-op shape on empty pending. Decision to be confirmed in `/spec` phase.
- Where does Q-001's closing entry land in `pending-questions.md` — inline auto-close in the closing commit, or via the Phase 10.6 invocation that runs as part of this workflow? Default: Phase 10.6 invocation handles it (the workflow demonstrates the new flow end-to-end). Confirm in `/spec`.
- Does the harness's integrate-failure auto-loop need to be aware of memory-flush? Default-no: integrate failures happen before memory-flush in the phase order; the auto-loop replays `/tdd` + `/integrate` only, so memory-flush is unreachable from an integrate-failure path. Confirm in `/spec`.
