# Harden the swarm subsystem by closing the five remaining first-run defects (D1, D2, D4, D5, D7)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Sourced from docs/brief/swarm-first-run-hardening.md.
-->

## Problem

The baseline's first real swarm-mode dispatch (workflow `-424f`: 7 tasks, 3 waves, shared isolation) surfaced five unresolved defects. Each one forced manual main-context rescue or per-wave hand diff-audits to land the work — the swarm path is not yet trustworthy for unattended baseline-on-baseline development. Concretely, in that single run:

- **D1 (HIGH) — worktree multi-wave is broken.** Agent `isolation:worktree` forked each worktree from a stale base (the last-release commit `64d8a55`, 17 commits behind HEAD), and `swarm_merge.mjs` `git apply`s wave output to the working tree *without committing*. So wave-N+1 worktrees branch from a base lacking wave-N output → cross-wave deps fail. `swarm-dispatch` also sets `baseline_ref: HEAD`, which mismatches the worktree's real base, so the merge-audit would flag every uncommitted file.
- **D2 (MED-HIGH) — shared-mode boundary is blind to baseline self-dev.** `swarm.exempt_path_prefixes` includes `.claude/`, so `swarm_boundary_guard` does NOT enforce write_sets under `.claude/skills/**` — exactly where baseline-on-baseline work lives. Shared mode's only safety mechanism is blind to its dominant use case; the run relied on manual `git status` diff-audits per wave.
- **D4 (MED) — workers rest after scenario undetected.** 2 of 7 workers stopped after `Skill(scenario)` ("Ready for implement") without running `Skill(implement)`, and their final message lacked the required `{task_id,status}` JSON line. `swarm-dispatch` had no detection and `SendMessage` to resume was unavailable, so main context completed implement from their RED tests.
- **D5 (MED) — swarm-plan assumes every task is worker-safe.** It placed live-code migrations + wiring (carrying design decisions, touching live gate-A `checker-fanout`) into worker waves, which then needed mid-build pull-back to main context — an ad-hoc deviation from the approved plan.
- **D7 (LOW) — spec API-surface was incomplete pre-dispatch.** `plan-store`'s versioned-tasklist API had no slot for the consumers' round-trips/verdicts; the `artifacts` channel was added mid-build. The spec did not pin the exact API surface each migration needed.

D3 and D6 were already closed (`swarm-d3d6-hardening`).

## Goal

Make swarm dispatch safe and reliable enough to run without ad-hoc main-context rescue, by closing D1, D2, D4, D5, and D7 with mechanical, unit-tested safeguards.

## Non-goals

- **D3 and D6** — already shipped (`swarm-d3d6-hardening`).
- The following were considered and **deliberately left open** as potential goals (NOT excluded — research/spec have latitude to pull them in): the v1 multi-agent maker/checker RALPH machinery (epic `-9d4c`); flipping the `swarm.isolation` project default; redesigning the broader `swarm-worker` subagent contract beyond D4's dispatch-side detection; gating "done" on a live swarm validation run.

## Success metrics

- Open `-e3f2` defects closed by this workflow: baseline 0/5 (D1,D2,D4,D5,D7 open), target 5/5, measured via: shipped + unit-tested safeguards and the backlog entry's defect ledger.
- Manual main-context interventions required by a shared-mode wave with an out-of-bounds write: baseline "undetected" (D2), target "detected and failed by a mechanical audit", measured via: a unit test exercising an out-of-union-write_set change.
- Worker results missing the `{task_id,status}` line that pass silently: baseline 1 (D4, silent), target 0 (flagged incomplete), measured via: a unit test on the dispatch result parser.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer, razieldecarte@gmail.com).
- **Reviewer**: Tushar Srivastava (gate-A spec approval, gate-C commit consent).
- **Operator** (who runs it): Claude Code executing swarm-mode workflows on this baseline.

## Constraints

- This workflow itself will **not** dogfood swarm-mode to build these fixes (building swarm with broken swarm is circular). Definition of done is therefore unit-tested safeguard *existence*, not a live swarm run.
- Edits land on baseline-owned shipped files (`.claude/skills/**`, `.claude/hooks/**`, `.claude/agents/**`, possibly `seed.md`/`CLAUDE.md`), so they incur the `build-template.sh` manifest-rebuild + `audit-baseline` tax (landmine `baseline-skill-edit-needs-manifest-rebuild`). New shipped helpers must be `.sh` or `.mjs`/`.js` (no new Python helpers).
- Any constitutional change (e.g. a new guard behavior, a worker-template imperative) requires the seed.md-first amendment path (Article I.4) and propagation to `src/*.template.md` mirrors.
- D1's resolution shape is **deferred to research** — code-fix vs documented-constraint is decided by the root-cause classification, not pre-committed.

## Acceptance criteria

1. **(D1)** Given the research phase has classified D1's root cause (Agent-tool constraint vs baseline-controllable bug), the spec SHALL pin exactly one resolution path with rationale, and the chosen path SHALL ship a mechanical, unit-tested safeguard — either **(a)** a multi-wave worktree dispatch produces wave-N+1 worktrees whose base includes wave-N output (`baseline_ref` derived from the worktree's real `merge-base`, not literal `HEAD`), or **(b)** `swarm-dispatch` detects a multi-wave plan under worktree isolation and fails-fast / steers it to shared mode, with the "worktree = single-wave only" constraint documented.
2. **(D2)** Given a shared-isolation swarm wave that writes under `.claude/skills/**`, when the wave completes, then `swarm-dispatch` runs a post-wave diff-audit comparing changed paths against the union of the wave's task `write_set`s and fails the wave when a change falls outside that union. A unit test SHALL show an out-of-union write is detected.
3. **(D4)** Given a worker returns a final message lacking a parseable `{task_id,status}` JSON line, when `swarm-dispatch` processes the result, then it classifies the task incomplete (never silently passed) and routes it to resume-or-main-context completion. A unit test SHALL show a result missing the JSON line is flagged incomplete.
4. **(D5)** Given `swarm-plan` decomposes an approved spec, when it emits the plan, then each task carries an explicit `worker-safe` vs `needs-main-context` classification (pure + fully-specified ⇒ worker; design-laden / touches live shipped code / depends on a not-yet-shipped API ⇒ main-context), surfaced in the gate-B plan. A unit test SHALL show a design-laden / live-shipped-code task classifies as `needs-main-context`.
5. **(D7)** Given a spec that will be swarm-decomposed, when it is authored, then spec-authoring guidance requires pinning the exact API surface each migration/consumer needs so the decomposition is complete pre-dispatch, and this is checkable (guidance present + a spec lacking pinned API surface is surfaced by spec-lint / a checker).
6. Every shipped safeguard above (AC1's chosen path, AC2–AC5) SHALL be covered by a unit test, and the full suite SHALL pass at `/integrate`. Live swarm validation is explicitly NOT a gating criterion for this workflow.

## Open questions

- **D1 root cause** — is the worktree multi-wave stale-base an Agent-tool constraint or a baseline-controllable bug? Resolved in the research phase; the answer decides whether D1 ships as a code fix (AC1a) or a documented constraint (AC1b). This blocks the spec's D1 section.
