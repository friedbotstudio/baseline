# Port the ten portable governance/harness improvements from the erp install back into the baseline

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The maintainer runs a consumer install of this baseline at `../erp` and made a series of deliberate constitutional and harness amendments there (ten governance-shaped commits from `db3f9b8` through `03697dd`). Those changes were proven live — an RCA in that repo (`docs/rca/harness-over-ceremony.md`) documents a ~2-day pattern-copy slice trending toward ~20 days under the unamended baseline defaults, and the amendments fixed it. The baseline itself (HEAD `7d1af61`) still carries the older behavior: subagent policy bans all judgment delegation (blocking useful read-only advisory fan-out), nothing stops a workflow from starting on a release branch under a PR model, gate C always yields even on disposable feature branches, `/triage` defaults to the heaviest track, brainstorm fires on fully-framed requests with a probe cap of 5, spec-committed scope can be silently deferred under a YAGNI reading, and `lint_runner`/`test_runner` fire their full commands on writes outside their configured `file_globs`. Every improvement already has a reference implementation in `../erp`; the baseline just doesn't have them.

## Goal

The ten portable erp improvements are adopted in the baseline — constitution (seed.md → CLAUDE.md + mirror) and implementation — landing as ten separately-reviewed epic-child commits, with erp's defaults adopted where policies flip.

## Non-goals

- ERP-specific governance content does not port: the five domain guardians and the `governance-review` phase, the `.claude/governance/` charter (U1–U12 invariants, seven-layer role fleet), the platform/solution `boundary-guard.sh`/`bash-boundary-guard.sh` hooks, `record-review`/`record-verification` scope-hash tokens, the communicator voice register (erp XI.6), the Golden Rule (erp XI.7), and where-things-live (erp XI.11).
- erp's org-track deferral does not port — the baseline keeps its live, selectable `org` track (porting the deferral would be a regression against `7d1af61`).
- No changes to the consent-gate handshake itself (markers, TTLs, `consent_gate_grant`) beyond making the grant-commit node conditional on branch protection; gate C remains binding on protected branches.
- No new subagents — the advisory-subagent amendment permits read-only advisers; the writing-subagent count stays at 1 (`swarm-worker`).

## Success metrics

- Hook count — baseline: 25, target: 26 (`branch_guard`), measured via: `audit-baseline` PASS with the reconciled roster.
- CLAUDE.md size — baseline: near cap, target: ≤ 40,000 chars with all ten amendments present (detail relocated to the annex), measured via: `audit-baseline` size check.
- Brainstorm probe cap — baseline: 5, target: 2, measured via: `probe-loop.mjs` unit test.
- Runner scoping — baseline: `lint_runner`/`test_runner` fire on any write, target: writes outside `file_globs` are skipped, measured via: hook regression test.
- Autonomous landing — baseline: gate C always yields, target: on a non-protected feature branch under `github-flow` the harness commits, pushes, and opens a PR without yielding, measured via: `isAutonomousFeatureLanding()` unit tests + workflow-track materializer test for the omitted consent node.
- All ten slices land as separate commits, each passing `/integrate` and the full test suite, measured via: `npm test` (or the configured `test.cmd`) green per child.

## Stakeholders

- **Requester**: Tushar Srivastava (maintainer, sole owner of both repos).
- **Reviewer**: Tushar Srivastava — gate A (`/approve-spec`) covers all ten slices at once; gate C per child commit.
- **Operator**: Tushar Srivastava — the baseline ships to consumer installs via `create-baseline`; consumers receive the changes on their next upgrade.

## Constraints

- **Amendment precedence (Art. I.4)**: every constitutional change amends `docs/init/seed.md` FIRST, then `CLAUDE.md`, then implementation; `src/CLAUDE.template.md` must stay byte-equal to `CLAUDE.md`.
- **40,000-char hard cap** on `CLAUDE.md` (enforced by `audit-baseline`); erp hit 39,982/40,000 — amendment detail must relocate to `.claude/CONSTITUTION.md` annex §5.x entries.
- **Count reconciliation**: adding `branch_guard` (25→26) touches seed §4.1, CLAUDE.md Article VIII + preamble + Article III greeting, the annex, `audit-baseline`'s expected roster (`expected-baseline.mjs`), `obj/template` manifest, and README/docs-site counts.
- **Hook changes require a seed.md §4.1 amendment + explicit user approval** (Art. VIII) — covered by gate A on the sliced spec.
- **Byte-equal template mirrors**: changes to shipped skills/hooks must flow through `src/`→`obj/template` build (`scripts/build-template.sh`) and re-hash the manifest.
- **Reference implementation is read-only**: `../erp` is consulted but never modified; erp-specific naming/config (CI check contexts, `owner: user` skills) must be generalized, not copied.
- **erp defaults adopted** where policies flip: brainstorm becomes opt-in (skip unless genuinely ambiguous AND answers change the build), probe cap 2, leanest safe track is the triage default with `track_reason` required for heavier tracks.
- **Backward compatibility**: `requires_commit_consent` conditional node must be additive to the §18 track schema (I6 static declaration preserved; I11 extended to resolve node conditions) so existing `workflows.jsonl` files stay valid.

## Acceptance criteria

1. **(A — advisory subagents)** Given the amended Article II, when a phase needs read-only gathering/advice (scout/research fan-out, oracle-bound checkers), then read-only advisory subagents are permitted while any binding decision or production write stays in main context; seed.md §4.2 carries the amendment and `scout`/`research` SKILL.md delegate gathering only.
2. **(B — branch_guard)** Given `git.workflow_model: "github-flow"` and the current branch matching a release branch, when a Write/Edit/MultiEdit would CREATE `.claude/state/workflow.json`, then `branch_guard.mjs` blocks with a named reason; given any ambiguity (non-git, `configured: false`, other models, linked worktree, detached HEAD, existing-file edit) it fails open. Hook count 26 is reconciled everywhere `audit-baseline` checks.
3. **(C — branch-aware gate C)** Given a non-protected feature branch under `github-flow`, when the harness reaches the landing boundary, then `isAutonomousFeatureLanding()` returns true, the triage materializer omits the grant-commit node per the schema's `requires_commit_consent` predicate, and the commit skill pushes and opens a PR; given a protected branch, `ask`/`direct-to-main` model, non-git tree, detached HEAD, or linked worktree, the predicate returns false and gate C yields as today.
4. **(D — leanest-track triage)** Given any triaged request, when `/triage` classifies it, then a novelty tier (`pattern-copy`/`spec-derived`/`novel`/`ambiguous`) with cited evidence is recorded in `workflow.json → novelty`, the leanest safe track is selected by default, and choosing a heavier track requires a named `track_reason`.
5. **(E — opt-in brainstorm)** Given a request derived from a spec chapter, roadmap/backlog item, or approved epic, or one carrying complete framing, when an entry phase runs, then `/triage` has written `skip_brainstorm: true` explicitly and brainstorm does not fire; given a genuinely ambiguous, build-changing request it fires with derivation-first Stage 1 and a probe cap of 2; given an `AskUserQuestion` timeout inside a phase skill, the recommended option is adopted as a recorded assumption surfaced at the next consent gate.
6. **(F — decision economy)** Given a routine engineering choice inside a phase, when the phase would otherwise ask, then the choice is decided in main context and recorded in the spec's `## Decisions` section (`owner: engineer`) for gate-A review; only human's-call forks (per the annex category list) may surface as questions; consent gates still block.
7. **(G — faithful scope)** Given a spec AC row that defers spec-committed scope, when `spec-traceability-review` runs, then a deferral tagged with a reason from the closed list `dependency|risk|cost|human-directed` passes and an untagged or YAGNI-tagged deferral is a Critical BLOCKER at gate A; VI.4 carries the floor/ceiling note.
8. **(H — runner scoping)** Given a write to a file outside `lint.file_globs`/`test.file_globs`, when `lint_runner`/`test_runner` fire, then they skip without running the configured command; given a matching file they run as today.
9. **(I — new skills)** Given the baseline skill set, when the port lands, then `commit-planner` and `retrospective` exist as baseline-owned skills (generalized from erp, `owner: baseline`), counted and hashed in the manifest, listed in annex Appendix B.
10. **(J — CI/secrets posture)** Given a commit attempt with the gitleaks binary absent, when the repo's pre-commit hook runs, then it hard-fails via a unit-testable check script; branch-protection lives as config-as-code with an applier; the low-risk auto-merge classifier NEVER covers enforcement hooks, control plane, dependency manifests, licence/SBOM files, or governance docs.
11. **(epic-wide)** `audit-baseline` exits 0 after every child commit; `CLAUDE.md` and `src/CLAUDE.template.md` are byte-equal and ≤ 40,000 chars throughout.
12. **(J2 — consumer shipping)** Given a consumer install or upgrade, when `init-project`/`upgrade-project` runs, then the CI/secrets posture artifacts ship from the template gated by an opt-out knob: default installs receive them, an opted-out project receives none, and an upgrade respects the existing choice. (Maintainer decision 2026-07-03: "ship with a flag to skip in cli … the init-project and upgrade-project commands can handle this ship logic".)
13. **(K — read-before-write)** Given any Write/Edit to an existing file (state files especially), when the operation is about to run, then the file has been Read in the same session first — the harness preflight reads `harness_state` and `workflow.json` once up front, and the state-write discipline mandates read-before-write so no tool call fails on the read-first requirement. (Maintainer request 2026-07-03.)

## Open questions

- (J) The erp branch-protection config pins its own CI check contexts (`gradle check (Temurin 21)`, SBOM, ADR-presence). Which check contexts should the baseline's config-as-code pin — this repo's own CI checks, or should the shipped artifact be a template consumers fill in? (Settle at `/spec`.)
- (J) Should the gitleaks hard-fail ship in the baseline's own `.githooks/` only, or also into `obj/template` for consumer installs? (erp kept it repo-local; shipping it changes consumer behavior.)
- (I) `retrospective` and `commit-planner` in erp are `owner: user` and reference erp's standup/roadmap conventions — confirm the generalized versions' triggers (retrospective pairs with `standup`; commit-planner overlaps the existing `commit` skill's staging step) so we don't ship overlapping skills.
