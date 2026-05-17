# Auto-resume the harness after consent gates

<!-- Intake document. Produced by the `intake` skill. -->

> verbatim (user, 2026-05-17):
> after each consent gate if the harness is armed we shouldn't ask the user to run harness again or ask them to continue...

## Problem

Today, every workflow that crosses a consent gate (`/approve-spec`, `/approve-swarm`, `/grant-commit`) requires two user prompts at the gate: one to run the consent slash command, and a second to type `/harness` to resume. The audit-empty-memory-files chore (just shipped at `db0221b`) exercised this gap at `/grant-commit` — the user wrote the consent token, then the harness terminal message ended with "Run /harness to autopilot the final /commit task", forcing a second prompt.

For a full intake-track workflow this happens at least twice (after `/approve-spec` and after `/grant-commit`), three times if a swarm path is taken (`/approve-swarm` added). The friction is small per gate but compounds across multi-gate workflows, and the "run harness again" instruction is a UX smell — the system already knows the workflow is mid-flight (workflow.json on disk), already knows the gate is satisfied (consent token freshly written), and already knows what the next phase is (lowest-id pending task). Asking the user to bridge that gap by typing `/harness` is forcing the user to be the orchestrator.

The Stop hook (`harness_continuation`) covers the *interrupted-mid-loop* case but is deliberately silent on the *gracefully-yielded-at-gate* case (state is `yielded`, marker is removed). The gracefully-yielded case is where the auto-resume gap lives.

## Goal

When a workflow is armed and the user runs a consent slash command that satisfies the current gate, the harness resumes automatically in the same turn — no second user prompt typing `/harness`.

## Non-goals

- Not removing the consent gates themselves. Gates A (`/approve-spec`), B (`/approve-swarm`), and C (`/grant-commit`) are structural per CLAUDE.md Article IV; the user-typed slash command is the load-bearing safety mechanism and remains mandatory.
- Not auto-fabricating consent. The `consent_gate_grant` UserPromptSubmit hook (which runs *outside* Claude's tool boundary) still owns the gate marker writes. Claude continues to be unable to forge a consent.
- Not changing the gate token format (`spec_approvals/<slug>.approval`, `swarm_approvals/<slug>.approval`, `commit_consent`, `push_consent`).
- Not affecting non-gate yields. Phase-skill failures and integrate-failure-needs-spec-change still surface and require a user decision; auto-resume applies only to gate-yields.
- Not altering the Stop hook's three-rung gate (`stop_hook_active` absent → `.harness_active` marker present → `state == continue`). The auto-resume path is additive, not a rewrite of the safety net.
- Not removing the manual `/harness` invocation. The user can always type it; the auto-resume must be idempotent with an explicit manual invoke.

## Success metrics

- **Gate-resume friction**: count of "user's literal next message after a consent slash command is `/harness`" drops from baseline (every gate today) to zero in armed-workflow cases. Measured via `.claude/state/harness/<slug>.log` inspection across 3+ test workflows post-fix.
- **Time-to-resume**: latency between consent-token-on-disk and next phase-skill invocation drops from "next user turn" (manual) to "current user turn" (auto). Measured via `harness/<slug>.log` timestamps.
- **No safety-net regression**: the existing test `tests/harness-continuation.test.mjs` (and any sibling tests covering state=continue+marker re-entry) continues to pass. Mid-loop-interruption recovery behavior is unchanged.
- **No consent-forge regression**: a test asserts Claude cannot trigger auto-resume without the `consent_gate_grant` UserPromptSubmit hook having fired (i.e., Claude writing the consent token via Write tool does not by itself trigger auto-resume; the user-typed slash command path must be involved).

## Stakeholders

- **Requester**: project owner (razieldecarte@gmail.com)
- **Reviewer**: same — single-maintainer project
- **Operator**: every harness user (anyone running workflows in projects that installed this baseline)

## Constraints

- **Article IV unchanged.** Consent gates are commands typed by the user. The user-typing requirement is the constitutional substrate.
- **`consent_gate_grant` runs outside Claude's tool boundary** (UserPromptSubmit hook). Auto-resume must compose with that boundary, not bypass it.
- **`stop_hook_active` semantic.** Claude Code bounds Stop-hook block-decisions to one per turn (the `stop_hook_active` flag prevents infinite loops). If option (b) is chosen, the auto-resume can fire at most once per turn — which is exactly what's needed, but the constraint must be respected.
- **`.harness_active` marker semantics.** The marker is removed when the harness yields (`state: yielded`/`done`). Auto-resume cannot rely on the marker being present at the moment of consent-token write — by then the marker is gone.
- **All 4 consent commands** (`/approve-spec`, `/approve-swarm`, `/grant-commit`, `/grant-push`) should behave uniformly under whatever mechanism is chosen. `/grant-push` is special: it's a Bash-time consent for `git push` on a protected branch, not a workflow phase gate. Treatment for it needs research (Q4).
- **Engineering rules (Article VI)**: no stubs; full implementation of whatever path is chosen; no TODO/FIXME left in source; tests drive correctness.

## Acceptance criteria

1. Given an armed workflow (workflow.json on disk) yielded at `/approve-spec`, when the user runs `/approve-spec docs/specs/<slug>.md`, then within the same user turn the harness invokes `Skill(harness)` and proceeds to the next non-gated phase without a second user prompt.
2. Given an armed workflow yielded at `/approve-swarm`, when the user runs `/approve-swarm <slug>`, then within the same user turn the harness auto-resumes to `/swarm-dispatch`.
3. Given an armed workflow yielded at `/grant-commit`, when the user runs `/grant-commit`, then within the same user turn the harness auto-resumes to `/commit`.
4. Given the harness is NOT armed (no workflow.json on disk), when the user runs any consent slash command, then the consent command behaves identically to today (writes its token, prints its confirmation, and the turn ends). No auto-resume fires.
5. Given an armed workflow yielded at gate X, when the user runs a consent command for a different gate Y (e.g. `/grant-commit` while yielded at `/approve-spec`), then the existing gate-mismatch validation rejects the command and no auto-resume fires.
6. Given the auto-resume mechanism, when the user explicitly types `/harness` as the next message after a consent slash command, then the harness invocation is idempotent — it detects the gate is already satisfied and proceeds normally (no double-fire, no error).
7. The `harness_continuation` Stop hook's three-rung gate (`stop_hook_active` absent AND `.harness_active` marker present AND `state == continue`) continues to fire only under those conditions. Auto-resume does NOT change the Stop hook's logic.
8. The `consent_gate_grant` UserPromptSubmit hook remains the only writer of gate markers (`.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`, `.push_consent_grant`). Claude continues to be unable to forge these markers via any tool.
9. The `audit-baseline` self-check continues to pass after the change (hook wiring, count claims, skill-ownership hashes all green).

## Open questions

- **Q1.** Which architectural surface to take?
  - (a) Each consent slash command body, after writing its token, additionally invokes `Skill(harness)` directly.
  - (b) The `harness_continuation` Stop hook's gate is extended with a fourth rung: "OR (workflow.json present AND a gate consent token was written this turn AND `harness_state.state == yielded`)".
  - (c) The `consent_gate_grant` UserPromptSubmit hook arms a second short-lived marker (`.harness_resume_pending`) that another lifecycle hook reads to re-invoke harness.
  - Research must compare these on: blast radius, alignment with `stop_hook_active` bound, testability, ease of reversal if the design proves wrong.

- **Q2.** Does the auto-resume path collide with Claude Code's `stop_hook_active` one-block-per-turn semantic? If option (b) is chosen, does the extended Stop-hook gate still stay within that bound when the consent token was written by Claude in the same turn (because the user typed the slash command, the command body wrote the token, then the turn ended → Stop fires)?

- **Q3.** For option (a) — slash-command body chains `Skill(harness)` — is this mechanically possible from every consent command body? The slash-command body is markdown instructions to Claude; does invoking `Skill(harness)` from inside that body have the same semantics as the user typing `/harness`? Specifically: are the workflow.json + harness_state reads at the start of `Skill(harness)` valid in that context?

- **Q4.** Should `/grant-push` participate in auto-resume? It's a Bash-time consent for `git push` on a protected branch, not a workflow phase gate. If a workflow is mid-flight and the user runs `/grant-push` to allow a push, the "next harness step" isn't well-defined (push isn't a workflow phase). Two sub-options: (4a) `/grant-push` never auto-resumes (it's outside the workflow phase model); (4b) `/grant-push` only auto-resumes if `workflow.json` is in a specific state (e.g., `commit` already in `completed`). Research/spec should pick.

- **Q5.** How does auto-resume interact with workflow-failure cases? If the prior phase stamped `FAIL` in `last_test_result` and the harness yielded at `/grant-commit` *anyway* (which today it wouldn't — `/commit` refuses), should auto-resume still fire? Probably yes (auto-resume invokes harness; harness re-enters preflight; preflight sees the FAIL and yields again with an informative reason). Spec should confirm.

- **Q6.** Test coverage: how do we test "the harness auto-resumed within the same turn"? The session-bound TaskList tracks per-task state; the durable signal is `workflow.json → completed` growing within one turn. A test fixture probably needs to drive the consent_gate_grant hook end-to-end (UserPromptSubmit payload simulation) and assert workflow.json was updated by a single subsequent harness step.
