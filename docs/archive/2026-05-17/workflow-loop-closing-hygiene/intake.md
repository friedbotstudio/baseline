# Close three loops in the workflow rails — fixture recapture, spec-to-impl drift analysis, backlog auto-flip on pickup

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Three independent loop-closure gaps in the baseline's workflow rails cause silent drift between what the system claims and what is true on disk. None of them are catastrophic alone; together they erode trust in the harness as a self-coherent system.

**Gap 1 — stale test fixture.** `.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` was captured pre-spec at 32 total memory entries (HEAD shown as `n/a`, landmarks=19). The live `.claude/memory/` tree has drifted to 67 total entries (landmarks=33) — a 35-entry gap accumulated across many prior commits. The AC008 byte-equality test in `.claude/hooks/tests/memory_session_start_test.sh` fails when invoked against the live tree; it currently rides as an advisory finding behind the binding `/integrate` verdict. The existing landmark for `memory_session_start_test.sh` already documents the re-capture obligation: *"if the live tree's entry count or stale count drifts, the fixture needs re-capture."*

**Gap 2 — no structural cross-check between approved spec and implementation.** `/integrate` runs the test suite; `/simplify` does code-structure review; neither verifies that *every* AC and `## Design calls` row in the approved spec was actually realized by the implementation diff. A spec can declare 8 ACs and a `## Design calls` row for a hero section; if the implementation lands only 7 ACs and the design row was never invoked, the workflow proceeds to commit without ever flagging the gap. The tests verify code correctness — they do not verify spec correctness, because tests are written against ACs the implementer already saw and decided to satisfy.

**Gap 3 — no automatic closure of source backlog entries on pickup.** When `/triage` accepts a request sourced from a backlog entry (the framing the recent `init-project-explicit-proceed-confirmation-7cb1` chore used, and the framing this workflow itself uses with three source keys), nothing in the workflow auto-flips that source entry's `status:` field from `open` → `picked-up` at triage time, nor stamps `superseded-at:` at commit time. The source entry stays `status: open` indefinitely until a human edits `backlog.md` by hand or runs `/memory-flush` ad-hoc and notices. This breaks the backlog's central invariant — that `status:` reflects whether the work has been taken.

## Goal

Close the three loops so the workflow leaves no silent drift behind it: test fixtures match what the hook actually emits, every approved spec AC traces to either a green test or a surfaced failure, and every backlog entry a workflow picks up gets its `status:` flipped and its closure stamp written automatically.

## Non-goals

- **NOT regenerating other stale fixtures across the repo.** Only `ac008_byte_equal_reference.txt` is in scope. Other fixtures (if drifted) are out of scope for this workflow.
- **NOT building a generalized "drift detection" framework.** The drift analysis covers exactly two artifact shapes: numbered ACs in the spec body and `## Design calls` rows. Any other kind of drift (architectural, dependency, documentation-vs-code) is out of scope.
- **NOT building the `/pm` skill or any backlog UI.** Auto-flip is plumbing for what already exists; it is not a backlog management surface.
- **NOT changing backlog status semantics.** The three allowed values (`open | picked-up | dropped`) stay as-is; this work only adds an automated transition from `open` to `picked-up`.
- **NOT retroactively migrating existing backlog entries.** Only entries named in `workflow.json → source_backlog_keys` going forward are affected. Past workflows that picked up entries without populating the field do not get backfilled.
- **NOT extending `/triage`'s natural-language parsing** to detect free-form `Source: backlog entry <key>` lines. The contract is the structured `source_backlog_keys: []` array in `workflow.json` (already used by this workflow); free-form parsing is out of scope.
- **NOT auto-looping the drift analysis on failure.** Unlike `/integrate`'s 3-retry auto-loop on mechanical bugs, drift failures signal either a missed AC or scope creep — both warrant stop-and-surface to a human, not an auto-retry.

## Success metrics

- **Fixture parity** — `bash .claude/hooks/tests/memory_session_start_test.sh` returns exit 0 with the AC008 case stamped PASS. Baseline: AC008 currently fails (32 vs 67 drift). Target: passes after the regenerated fixture lands. Measured via the test invocation in `/integrate`.
- **Drift-analysis coverage** — fraction of approved-spec ACs and `## Design calls` rows that resolve to a deterministic `resolved | unresolved | unknown` verdict against the implementation diff. Baseline: 0% (no analysis exists). Target: 100% of items get a verdict; the analysis terminates without an unverdicted row. Measured by the drift-analysis report shape itself (no `(none)` placeholders permitted).
- **Auto-flip coverage** — fraction of `workflow.json → source_backlog_keys` entries that are stamped `superseded-at:` after `/commit` completes. Baseline: 0%. Target: 100%. Measured by the dogfood AC on this very workflow (its three source keys must all be stamped on its own commit).

## Stakeholders

- **Requester**: razieldecarte@gmail.com — the user
- **Reviewer**: razieldecarte@gmail.com — sole maintainer; approves spec at gate A and commit at gate C
- **Operator**: the baseline harness on every workflow that names a source backlog key; the drift analysis surface on every spec-entry workflow; the ac008 test on every CI run that exercises the hook test suite

## Constraints

- **Article IX (memory) compliance.** Backlog entries are canonical memory; the auto-flip must respect the existing closure-stamp semantics. Specifically, `superseded-at:` already triggers `/memory-flush` Step 0a auto-deletion — Goal 3 must reuse that field, not introduce a new closure trigger. Existing `.claude/memory/backlog.md` frontmatter notes this contract: *"Entries use `superseded-at:` as the closure trigger (auto-delete on the next `/memory-flush` Step 0a sweep); the body `status:` field disambiguates whether the entry was `picked-up` (taken into a workflow) or `dropped` (decided not to do)."*
- **Article IV (workflow ordering) compliance.** Adding drift analysis cannot reorder existing phases. It either extends a phase (`/tdd` Step 7 or `/integrate`) or inserts as a new boundary between two existing phases (after `/tdd`, before `/simplify`). The Track Guard hook reads `workflow.phases` in `project.json`; any new phase must be wired there, and the harness loop must learn about it.
- **`/commit` ordering.** Goal 3's closure stamp must land *after* the commit succeeds — otherwise a failed commit leaves dangling stamps on backlog entries the workflow didn't actually pick up. If the stamp lives in `/commit` (option b), it must execute as a post-commit step. If it lives in `_pending.md` (option a), the candidate is emitted at commit-success and the next `/memory-flush` writes it.
- **Backward compatibility.** Workflows that did not populate `source_backlog_keys` (which is most prior workflows) must continue to commit successfully. Missing or empty `source_backlog_keys` is a no-op for Goal 3, not an error.
- **ac008 fixture byte-equality contract.** The regenerated fixture must remain byte-comparable with the live hook output for the SAME tree state at the SAME HEAD. The test compares header + table; any field the hook emits that the fixture does not capture (or vice versa) breaks the test contract. Re-capture should be deterministic and reproducible — running the hook twice against the same tree must produce identical bytes.
- **Article VI.4 (YAGNI).** Drift analysis covers ACs and `## Design calls` rows because those are the spec sections this workflow needs verified. Adding coverage for C4 components, dependency graph nodes, or class diagrams is hypothetical future use — out of scope unless an AC drives it.
- **Article XI (skill provenance).** If a new skill or phase is introduced for drift analysis, it must declare `owner: baseline` in its SKILL.md frontmatter and the build manifest must enumerate its files; otherwise audit-baseline fails.

## Acceptance criteria

1. **Given** `.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` exists at the start of the implementation, **when** the fixture-regeneration step runs against the live `.claude/memory/` tree at the implementation's commit, **then** the file contains the header + table block byte-equal to the hook's live output, and `bash .claude/hooks/tests/memory_session_start_test.sh` exits 0 with the AC008 case stamped PASS.

2. **Given** an approved spec at `docs/specs/<slug>.md` contains N numbered ACs and a `## Design calls` section with M rows, **when** the spec-to-implementation drift analysis runs against the implementation diff, **then** the analysis emits a report at a deterministic path (e.g. `.claude/state/drift/<slug>.md` — exact path decided in spec) tagging every AC and every design-call row as one of `resolved` (test or diff evidence found), `unresolved` (no evidence), or `unknown` (ambiguous evidence), with no item omitted.

3. **Given** the drift analysis finds ≥ 1 `unresolved` AC or `## Design calls` row, **when** the workflow reaches the next phase boundary, **then** the harness loop exits with `state: yielded` and `reason: "drift analysis: <N> unresolved items"`, surfacing the report path. The workflow SHALL NOT auto-loop to `/tdd` (constraint: stop-and-surface, not auto-retry).

4. **Given** the drift analysis finds zero `unresolved` items (all `resolved` or `unknown`), **when** the workflow proceeds, **then** any `unknown` items are surfaced as advisory in the next phase's report but do not block progression. (Exact "unknown" semantics — what counts as ambiguous evidence — decided in spec.)

5. **Given** `.claude/state/workflow.json` contains a non-empty `source_backlog_keys: [...]` array with each named entry present in `.claude/memory/backlog.md` at `status: open`, **when** `/commit` completes successfully (the commit lands in git history), **then** each named backlog entry is updated in place with `status: picked-up` and a `superseded-at: <ISO date>` field appended, written via the chosen surface (option a or b — decided in spec).

6. **Given** option (a) is chosen (route through `_pending.md`), **when** `/commit` runs, **then** it emits one `## CANDIDATE: backlog-closure → backlog.md` block per source key into `_pending.md`, and the next `/memory-flush` Step 0a sweep stamps the entries (or Step 1–4 promote-as-edit applies, per the chosen design). **Alternatively**, given option (b) is chosen (direct write), **when** `/commit` runs, **then** it writes `status: picked-up` and `superseded-at:` directly to `backlog.md` as a final post-commit step before workflow exit.

7. **Given** a backlog entry has been stamped `superseded-at:`, **when** the next `/memory-flush` Step 0a auto-close sweep runs (in any future workflow), **then** that entry is deleted from `backlog.md` per the existing `superseded-at:` closure semantics. (Reuses existing infrastructure; no new closure field.)

8. **Given** `.claude/state/workflow.json` has empty or missing `source_backlog_keys`, **when** `/commit` runs, **then** Goal 3's auto-flip step is a no-op and `/commit` proceeds without error. (Backward-compatibility for workflows that did not populate the field.)

9. **Given** this very workflow has three source backlog keys (`ac008-fixture-recapture-after-memory-drift-39cc`, `tdd-spec-implementation-drift-analysis-6086`, `backlog-status-not-auto-flipped-after-pickup-ac5d`) stashed in its `workflow.json → source_backlog_keys`, **when** this workflow's own `/commit` completes, **then** all three source entries are stamped with `superseded-at:` and `status: picked-up`. (Dogfood AC — this workflow proves Goal 3 by closing the loop on itself.)

10. **Given** the implementation lands on a workflow that did not populate `source_backlog_keys` (e.g., a pre-feature workflow on a different branch), **when** `/integrate` runs the full test suite, **then** no test regresses — the auto-flip code path is dormant when the field is absent.

11. **Given** drift analysis is wired as a new phase or as an extension of an existing phase, **when** `/triage` writes `workflow.json` for a new workflow, **then** the new phase (if added) is included in the canonical phase list (`project.json → workflow.phases`) and the `triage` skill's task-seeding templates name it correctly. The change must not break existing workflows whose `workflow.json` predates the addition.

## Open questions

- **Q1.** Where does the spec-to-implementation drift analysis live? Three candidates: (a) extend `/tdd` Step 7 (drift check before exiting TDD); (b) new dedicated phase `/drift` between `/tdd` and `/simplify`; (c) extend `/integrate` (run drift before the verify-pass binding stamp). Each has tradeoffs — (a) keeps TDD a closed loop but couples drift to the implementer's own context; (b) is structurally cleanest but adds a phase to the rails (project.json, triage templates, task-seeding); (c) bundles structural check with test execution but blurs the "tests = mechanical correctness; drift = scope correctness" semantic line. Resolve in research/spec.

- **Q2.** What is the surface for Goal 3's closure stamp? Two candidates: (a) `/triage` stashes `source_backlog_keys` (already done for this workflow), `/commit` emits `## CANDIDATE: backlog-closure → backlog.md` blocks into `_pending.md` at commit-success, next `/memory-flush` Step 0a writes the stamp; or (b) `/commit` reads `workflow.json → source_backlog_keys` and writes the stamp directly to `backlog.md` as a final post-commit step. Option (a) routes through the existing memory pipeline (consistent with the curator-not-writer pattern in Article IX); option (b) is faster but couples `/commit` to memory writes and creates a new direct-write boundary. Resolve in research/spec.

- **Q3.** What is the resolution semantic for an AC the drift analysis tags as `resolved`? Candidates: (i) the AC text appears in a test name or assertion docstring in the diff; (ii) the AC has at least one corresponding test that PASSes against the implementation; (iii) the AC's "given/when/then" components each appear in at least one test; (iv) the AC has a `traceability:` annotation pointing to test IDs. Each has tradeoffs in precision vs implementer effort. Resolve in spec.

- **Q4.** What is the resolution semantic for a `## Design calls` row tagged as `resolved`? The row names a target surface, intent, and acceptance check; resolution candidates: (i) the named surface file exists in the diff; (ii) `Skill(design-ui)` was invoked with the row's `task_brief` during `/tdd` (logged in `.claude/state/design/<slug>.json`); (iii) both (i) and (ii). Resolve in spec.

- **Q5.** What is the drift report's deterministic path? Candidates: `.claude/state/drift/<slug>.md`, `docs/drift/<slug>.md`, inline in `harness_state` reason, or extends the existing `.claude/state/last_test_result`. Resolve in spec.

- **Q6.** How does the ac008 fixture regeneration step run inside the workflow? Candidates: (i) a bash one-liner inside `/tdd` that captures `memory_session_start.sh` output and overwrites the fixture; (ii) a committed helper script at `.claude/hooks/tests/fixtures/regenerate-ac008.sh` invoked by `/tdd`; (iii) extend `memory_session_start_test.sh` itself to support a `--regenerate` mode. Resolve in spec; (ii) is likely cleanest because the script doubles as documentation.

- **Q7.** Does `/triage` need a new task-seeding template if Goal 2's drift analysis adds a new phase? If yes, the `triage` SKILL.md task templates need an entry for the new phase; existing workflows whose `workflow.json` was written before the addition need a migration path (probably: the harness loop skips the new phase if it is not in the workflow's recorded phase list). Resolve in spec.

- **Q8.** For the dogfood AC (AC#9), does the auto-flip execute on this workflow's commit, given that Goal 3 is *being implemented in this workflow*? Two semantics: (i) the auto-flip code path is dormant during the workflow that adds it (chicken-and-egg) and a follow-up workflow demonstrates the closure; (ii) the auto-flip is wired and exercised during this workflow's own `/commit`, proving the loop on its own implementation. (ii) is structurally cleaner — Goal 3 lands its code AND its first execution in the same commit — but requires the auto-flip step to be implemented before commit, not after. Resolve in spec.

- **Q9.** Should Goal 2's drift analysis run on workflows that have no spec (e.g., `chore` track)? The `chore` track skips `/spec`, so there is nothing to drift-check against. Drift analysis is probably a no-op on `chore`. Resolve in spec.
