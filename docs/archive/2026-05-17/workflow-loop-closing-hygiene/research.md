# Pattern Research — workflow-loop-closing-hygiene

Three design questions surfaced in the intake (Q1, Q2, Q6) and elaborated in the scout. This memo surfaces 2–3 candidate approaches per question, with honest tradeoffs. **No decision is made here** — the spec author picks one (or rejects them all and goes a fourth way).

## Library / API verification

This work is purely internal baseline plumbing — bash hooks, python helpers, markdown artifacts, JSON state files. There is no third-party library API to verify. No `context7` lookups required. If the spec ends up needing an external dependency (e.g., a markdown-AST parser for spec AC extraction in Target 1), the spec phase must run context7 against that library before declaring its API.

---

## Target 1 — Drift-analysis placement (intake Q1)

The spec-to-implementation drift analysis compares every approved-spec AC and `## Design calls` row against the implementation diff, emits a `resolved | unresolved | unknown` verdict per item, and stops the workflow on `≥ 1 unresolved`. The question is *where* in the 11-phase pipeline it runs.

### Candidate 1A — Extend `/tdd` Step 7 (worker chain)

- **Summary**: Insert a `drift-check-tick` worker between the last `design-ui-tick` (or `verify-tick`) and `tdd-finalize` in `/tdd`'s seeded task chain. The harness invokes it as one more tick in the same worker series.
- **API references**: internal only. `.claude/skills/tdd/SKILL.md:72-80` (worker-task seeding), `.claude/state/tdd/<slug>.json` (recipe + contract handoff), `.claude/state/last_test_result` (four-line verdict shape — drift produces a sibling file).
- **Fits**: yes — anchored to scout's *"Phase skills as orchestrators"* pattern. Drift is conceptually part of TDD ("does the impl match the spec we drove the tests from?") and `/tdd` already coordinates a worker chain.
- **Implementation footprint**: small. Update `tdd/SKILL.md` (one new worker step in the seeded chain); new tiny skill or inlined operations producing a drift report at `.claude/state/drift/<slug>.md` and a sibling verdict at `.claude/state/last_drift_result`. No `project.json → workflow.phases` edit; no `triage` template edit; no `harness/SKILL.md` phase-list edit; no `track_guard` impact.
- **Failure-mode handling**: drift fails → the drift worker leaves the task chain in `in_progress`, writes `harness_state: yielded` with `reason: "drift analysis: <N> unresolved items"`, the user investigates. Matches the integrate-failure stop-and-surface pattern (intake's explicit non-goal: no auto-loop on drift).
- **Blast radius if rolled back**: small. Revert `tdd/SKILL.md` + delete the drift skill/state files; the rest of the workflow is unaffected.
- **AC impact**: AC#2, #3, #4 directly satisfied. AC#11 partial — no new phase entry needed in `workflow.phases`; the `triage` templates do not need a new row.
- **Tradeoff (negative)**: drift runs on the post-TDD diff, *before* `/simplify` mechanically cleans up. `/simplify`'s scope guardrails (`.claude/skills/simplify/SKILL.md:44-48`) forbid feature addition / scope expansion, but a buggy cleanup could delete a function that satisfied an AC — drift would not catch that because it already ran. The intake's AC#10 (no test regresses for absent `source_backlog_keys`) and AC#11 are satisfied; the spec-to-impl mapping is not re-verified after cleanup. Mitigation: trust `/simplify`'s guardrails and the post-simplify re-verify (test re-run); if `/simplify` is buggy that's a separate landmine.

### Candidate 1B — New dedicated `/drift` phase between `/simplify` and `/integrate`

- **Summary**: Add `drift` as the 8th phase in `workflow.phases`, between `simplify` and `security` (or between `simplify` and `integrate` if security is also excepted). Ships as a new SKILL.md with `owner: baseline`.
- **API references**: internal. `.claude/project.json → workflow.phases` (line 93-106), `.claude/project.json → workflow.artifacts` (line 110-122), `.claude/skills/triage/SKILL.md:33-48` (four task-template variants), `.claude/skills/harness/SKILL.md:108` (phase-chain prose), `.claude/skills/harness/SKILL.md:153-160` (state-machine table), `obj/template/manifest.json → owners.skills` (per Article XI: new skill needs manifest entry + per-file hashes).
- **Fits**: yes for structural cleanliness — drift gets its own boundary, its own skill file, its own artifact. But less yes for footprint — the rails-amendment is heavy.
- **Implementation footprint**: large. New `.claude/skills/drift/SKILL.md`; update `project.json` workflow.phases + workflow.artifacts; update all four `triage` task templates (intake-entry / spec-entry / tdd-entry / chore — even chore needs the new phase explicitly excepted because chore tracks skip spec, so there's no spec to drift-check); update `harness/SKILL.md` phase chain + state-machine table; update the `audit-baseline` manifest with the new skill files and hashes; update `CLAUDE.md` Appendix B skill index (currently lists 36 skills with a documented per-category count — adding one shifts that count).
- **Failure-mode handling**: drift fails → harness writes `state: yielded` with the drift reason; user investigates and either fixes the impl gap or re-spec's the AC. Same yield semantics as 1A.
- **Blast radius if rolled back**: medium. Multiple files revert; `workflow.phases` index churn affects every phase listed after `drift` in `track_guard.sh`'s index arithmetic (but track_guard reads the list each call, so reverting the JSON suffices); manifest hashes need a refresh commit.
- **AC impact**: AC#11 explicitly satisfied — the new phase is named in canonical phase list, triage templates know it, harness loop invokes it as its own iteration.
- **Tradeoff (negative)**: large footprint for what is conceptually a single check. The `/chore` track must explicitly except drift (no spec → no drift check). The 36-skill governance count in CLAUDE.md Appendix B + the audit-baseline expected-skill set both shift. Drift becomes a "real phase" with its own consent surface and observability — overkill if drift is a 50-line python helper.

### Candidate 1C — Extend `/integrate`

- **Summary**: Insert drift between `/integrate` Step 2 (run tests) and Step 3 (read PASS/FAIL), or after PASS but before Step 4 (cross-engine smoke). The composite verdict either (i) folds drift into the binding line-1 PASS/FAIL or (ii) emits a parallel state file and includes both in the terminal message.
- **API references**: internal. `.claude/skills/integrate/SKILL.md:15-28` (step 2 verdict shape), `.claude/state/last_test_result` (four-line contract that `verify_pass_guard` reads).
- **Fits**: partial — drift is at the same "binding gate" altitude as `/integrate`, but mixing test correctness and spec coverage at one phase blurs the boundary the intake explicitly calls out as separate (intake Problem § Gap 2: *"tests verify code correctness — they do not verify spec correctness"*).
- **Implementation footprint**: small-to-medium. `integrate/SKILL.md` only. Decide between (i) folding drift into `last_test_result` line 1 (breaks the contract `verify_pass_guard` reads — high risk) and (ii) parallel state file (`last_drift_result` with its own four-line format). Option (ii) is cleaner.
- **Failure-mode handling**: same as 1A/1B — yield with `reason: "drift analysis: <N> unresolved items"`. If folded into line 1 (option i), `verify_pass_guard` would block downstream writes including `/document` — same blast radius but tighter coupling.
- **Blast radius if rolled back**: small. Revert `integrate/SKILL.md` and delete the drift state file.
- **AC impact**: AC#2, #3, #4 satisfied. AC#11 — no new phase entry needed (same as 1A).
- **Tradeoff (negative)**: `/integrate`'s singular role is *"run the binding test command and stamp the verdict"* (`.claude/skills/integrate/SKILL.md:15`). Adding drift makes integrate a two-verdict skill. Option (i) (fold into line 1) breaks the existing contract `verify_pass_guard` depends on; option (ii) (parallel state) preserves the contract but makes `/integrate`'s terminal message a composite report. Runs *after* `/simplify` and `/security`, so it sees the final-shape diff — good. But integrate is also the auto-loop point for `/tdd` (CLAUDE.md Article V's integrate-failure decision tree); folding drift into integrate complicates that decision tree (drift failures are never auto-loopable — they need spec or scope change, not mechanical bug-fixes).

### Recommendation — Target 1

**Candidate 1A (extend `/tdd` Step 7)**, with the caveat that drift runs against the post-TDD diff, *before* `/simplify`.

Why: smallest footprint; aligns with the scout's *"phase skills as orchestrators"* pattern; preserves `/integrate`'s singular verdict role; preserves `/simplify`'s singular cleanup role; no rails amendment (no `project.json` change, no `triage` template change, no `harness` state-machine change). Drift sits where the implementation context is freshest — the same skill that drove the tests can verify those tests cover the spec.

The "/simplify could mechanically break drift" risk is real but bounded:
- `/simplify`'s scope guardrails explicitly forbid feature addition or scope expansion.
- `/simplify` re-verifies via test re-run before marking complete; if cleanup deleted a function that satisfied an AC, at least one test should fail in re-verify, surfacing the regression there.
- Drift failures are surfaced to the user; a subsequent `/simplify` regression is a separate landmine the spec can address with a future workflow.

**What would flip the decision**:
- If the user wants drift to be the gate before `/document` *no matter what `/simplify` did*, Candidate 1B or 1C wins. 1B is the cleanest structural answer; 1C is the smallest footprint of those two.
- If the spec author finds that drift logic is non-trivial (> ~100 LOC of python) and warrants its own skill anyway, Candidate 1B becomes proportionally more attractive (the rails-amendment overhead is then less relative to the skill's complexity).
- If chore-track drift is desired (e.g., for vendored-skill-content updates that *should* trace to a spec AC, which currently chore-track work doesn't have), 1B is the only candidate that surfaces that requirement explicitly via the per-template exception.

---

## Target 2 — Backlog auto-flip fix surface (intake Q2)

`/triage` already supports `source_backlog_keys: []` (this workflow populates it manually). The question is *which skill* writes the closure stamp (`status: picked-up` + `superseded-at: <ISO>`) to `backlog.md`, and *when*.

### Candidate 2A — `/commit` emits `_pending.md` candidate; next workflow's `/memory-flush` Step 0a sweeps

- **Summary**: At commit-success, `/commit` reads `workflow.json → source_backlog_keys` and writes one `## CANDIDATE: backlog-closure → backlog.md` block per key to `_pending.md`. The next workflow's Phase 10.6 (`/memory-flush`) processes the candidates — Steps 1-5 promote-as-edit to set `status: picked-up` and append `superseded-at:`. The subsequent Step 0a auto-close (or the workflow after that) deletes the stamped entries.
- **API references**: internal. `.claude/skills/commit/SKILL.md` (new step after the `git commit`), `.claude/skills/memory-flush/SKILL.md` (curator review of a new candidate kind), `.claude/memory/_pending.md` (the `## CANDIDATE: backlog-closure` shape — new shape; the existing `## CANDIDATE: backlog → <key>` is for new entries, not closures).
- **Fits**: yes — most consistent with CLAUDE.md Article IX clause 3 (*"You SHALL NOT write directly into canonical memory files outside the natural byproduct of phase skills"*). The candidate-then-curator pattern is the established way.
- **Implementation footprint**: small-to-medium. New `/commit` step (post-git-commit, ~10 LOC bash to emit the candidate block). `/memory-flush` Step 2 logic needs to recognize the new candidate kind and route it to a "promote-as-edit" branch (~20 LOC python or bash logic). `_pending.md` shape gains a documented kind.
- **Timing semantics**: closure visible on the NEXT workflow's Phase 10.6. This-workflow `/commit` lands, source backlog entries STAY `status: open` until another workflow flushes. **Lag = 1 workflow cycle.** The dogfood AC (intake AC#9) does not pass in this workflow's commit; it passes in the next workflow's `/memory-flush`. AC#9 wording would need amendment in spec ("by the end of the *next* workflow after this one") or AC#9 fails.
- **Partial-write resilience**: ✓. If `/commit`'s git operation fails, no candidate is written. If the candidate is written but the next workflow never happens, the candidate stays in `_pending.md` until the next flush — no orphaned state. The candidate-emission write happens AFTER the git commit succeeds.
- **Article IX compliance**: ✓ pristine. The curator pattern is preserved end-to-end.
- **Tradeoff (negative)**: 1-workflow lag for visible closure. The dogfood AC fails unless re-worded. UX implication: a user inspecting `backlog.md` immediately after this workflow's commit still sees the source entries as `status: open`.

### Candidate 2B — `/commit` writes the closure directly to `backlog.md` post-commit

- **Summary**: At commit-success, `/commit` reads `workflow.json → source_backlog_keys` and writes `status: picked-up` + `superseded-at: <today>` directly to each named entry in `.claude/memory/backlog.md`. The next `/memory-flush` Step 0a auto-deletes the entries per the existing closure-trigger contract.
- **API references**: internal. `.claude/skills/commit/SKILL.md` (new step after `git commit`), `.claude/memory/backlog.md` (direct write target), `.claude/skills/memory-flush/sweep.py:104-118` (`update_field` / `_append_field` — could be reused if invoked as a sub-process by `/commit`, or duplicated in /commit's logic).
- **Fits**: partial — direct memory write from `/commit` introduces a new write boundary the curator pattern intentionally avoided. Scout flagged this as a constraint: *"adds a direct memory write from /commit (currently /commit only stages + commits, no memory writes)."* Article IX clause 3 says writes happen *"as a byproduct of phase skills doing their normal work"* — a closure stamp arguably qualifies (the commit IS the workflow closing the loop), but the spirit of the rule is "go through /memory-flush."
- **Implementation footprint**: small. ~15 LOC of python in `/commit` (read workflow.json, walk source_backlog_keys, edit backlog.md). No `/memory-flush` change. No `_pending.md` shape extension.
- **Timing semantics**: ✓ closure visible in this workflow's commit. The dogfood AC (intake AC#9) passes without re-wording.
- **Partial-write resilience**: requires careful ordering. /commit's git operation is Step 5 (`commit/SKILL.md:19`); the closure write MUST run AFTER step 5 succeeds. If step 5 fails (consent expired, hook denies), the closure write is skipped. If step 5 succeeds but the closure write fails (filesystem error), the commit is in git but the source entries stay `status: open` — recoverable manually or by next workflow's `/memory-flush`. The recoverability is acceptable; the failure is observable.
- **Article IX compliance**: technically OK (closure is a deterministic structural stamp with no judgment, arguably "byproduct of phase skill"), but conventionally less clean.
- **Tradeoff (negative)**: introduces a precedent ("`/commit` can write to canonical memory files") that future work may abuse. The dogfood AC passes only because the write happens during this workflow's commit — meaning the write code path exists before the commit lands, so step-5-fails-but-write-already-ran is impossible; the write must follow step 5.

### Candidate 2C — `/commit` invokes `sweep.py --mode stamp-closure` (a new sweep mode)

- **Summary**: Extend `sweep.py` with a new mode `--mode stamp-closure --backlog-keys k1,k2,k3`. `/commit` reads `workflow.json → source_backlog_keys` and invokes the mode at commit-success. The new mode does the deterministic stamp (`status:` field replace, append `superseded-at:`) using the existing `update_field` machinery in sweep.py. The subsequent `--mode auto-close` (next workflow's Phase 10.6) deletes the stamped entries.
- **API references**: internal. `.claude/skills/memory-flush/sweep.py` (new mode entry in `MODE_DISPATCH`), `.claude/skills/commit/SKILL.md` (post-commit invocation of sweep.py).
- **Fits**: yes — routes through `sweep.py`, which is *the* deterministic memory-mutation actuator the SKILL.md SOP already composes. `/commit` doesn't write to `backlog.md` directly; it calls the actuator the same way `/memory-flush` does.
- **Implementation footprint**: medium. New mode in sweep.py (~30 LOC: parse CLI flag for keys, walk backlog.md entries, apply `update_field` twice per matched key, emit JSON report). Tests at `.claude/skills/memory-flush/tests/run.sh` extended for the new mode. /commit invocation step (~5 LOC bash). Manifest hash bumps for sweep.py.
- **Timing semantics**: ✓ closure visible in this workflow's commit. Dogfood AC passes.
- **Partial-write resilience**: same as 2B — must run AFTER `git commit` succeeds.
- **Article IX compliance**: ✓ better than 2B. The actuator is owned by `/memory-flush`; `/commit` is just a caller. The "no direct canonical writes from non-memory-flush skills" spirit is preserved because `/commit` is invoking the memory-flush actuator, not writing directly.
- **Tradeoff (negative)**: extends sweep.py with one more mode (3 → 4). Slight YAGNI risk — the new mode has exactly one caller (/commit). But sweep.py's existing modes also each have one caller (`/memory-flush` Step 0a/0b/0c), so this is consistent. The bigger cost is the test coverage of the new mode; sweep.py's existing tests are thorough so the marginal extension is moderate.

### Recommendation — Target 2

**Candidate 2C (`/commit` invokes a new `sweep.py --mode stamp-closure` mode)**.

Why: best of both. Same-workflow closure visibility (passes the dogfood AC without re-wording); routes through the deterministic actuator (preserves Article IX spirit); modest implementation footprint; consistent with sweep.py's existing role.

**What would flip**:
- If the project owner views Article IX as absolute (*"all canonical writes go through `/memory-flush` invocations, period"*), **2A** wins — accept the 1-workflow lag and re-word AC#9 to specify lag explicitly.
- If extending sweep.py is judged YAGNI (the closure logic is 5 lines; a new mode adds 30 LOC + test cases), **2B** is acceptable — direct write from /commit with a doc note in README.md about the new boundary.
- If a user is uncomfortable with `/commit` ever invoking a memory-related process, none of the candidates work and we need a fourth approach (e.g., a Stop hook that detects `source_backlog_keys` + a recent commit and writes the closure outside the workflow's tool boundary).

---

## Target 3 — Fixture regen mechanism (intake Q6)

`.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` must be regenerated to match the live `.claude/memory/` tree. The question is *how* the regen happens, and how the `HEAD: \`<short-sha>\`` field is handled.

### Candidate 3A — Inline bash one-liner during implementation

- **Summary**: The implementer runs a one-liner like `CLAUDE_PROJECT_DIR="$PWD" bash .claude/hooks/memory_session_start.sh <<< '{}' | python3 -c '...extract block...' > .claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt`. The one-liner exists only in the implementer's session; the fixture file is committed.
- **Reproducibility**: ✗ the next regen requires reconstructing the one-liner from memory or the implementation commit message.
- **Drift recovery**: weak. The next time the fixture drifts (likely soon — every memory tree edit changes counts), someone must figure out what the one-liner was.
- **Coupling**: same as 3B/3C (the regen logic must extract the same block the test extracts).
- **Implementation footprint**: trivial.
- **Tradeoff (negative)**: drift is a recurring class of bug; not having a re-usable regen tool guarantees future re-discovery of the same problem.

### Candidate 3B — Committed helper script at `.claude/hooks/tests/fixtures/regenerate-ac008.sh`

- **Summary**: Ship a `regenerate-ac008.sh` script alongside the fixture. The script runs the hook, extracts the canonical block (matching the test's extraction range — `## Project memory` through `| \`pending-questions.md\``), normalizes the HEAD line to a fixed sentinel, and overwrites the fixture. Anyone can re-run it when the live tree drifts again.
- **Reproducibility**: ✓ running it twice against the same tree state produces identical bytes.
- **Drift recovery**: ✓ `bash .claude/hooks/tests/fixtures/regenerate-ac008.sh && git diff .claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` is the recovery loop.
- **Coupling**: tight with the test's extraction logic — both must use the same start/end anchors. Mitigation: factor the extraction into a shared function (bash or python) referenced by both the test and the script.
- **Implementation footprint**: small. ~20 LOC bash + a HEAD-normalization sed step. Add the script to the manifest if `audit-baseline` enumerates fixture-adjacent helpers (it likely doesn't — only enumerates skill files).
- **Bonus**: the script doubles as documentation. Future maintainers reading `.claude/hooks/tests/fixtures/` see *how* the fixture was produced, not just the result.

### Candidate 3C — Extend `memory_session_start_test.sh` with `--regenerate`

- **Summary**: The test runner gains a `--regenerate` flag. When invoked with it, the AC-008 test overwrites the fixture with the live capture instead of comparing.
- **Reproducibility**: ✓ deterministic if HEAD normalization is built in.
- **Drift recovery**: ✓ `bash .claude/hooks/tests/memory_session_start_test.sh --regenerate` is the recovery command.
- **Coupling**: tightest possible — extraction logic and regen logic live in the same file. Single source of truth.
- **Implementation footprint**: small. ~10 LOC bash inside the test runner, gated on the flag.
- **Tradeoff (negative)**: footgun. A test runner with a `--regenerate` flag invoked accidentally in CI or by an automation silently rewrites the fixture and masks real drift forever. Mitigation: require the flag value to be a specific magic word (`--regenerate=I-mean-it`); also, never invoke the test runner with arbitrary args.

### HEAD-field handling sub-question

Three positions, valid for any of 3A/3B/3C:

- **(i) Keep `HEAD: \`n/a\`` sentinel**: the regen step replaces the hook's emitted `HEAD: \`<short-sha>\`` with `HEAD: \`n/a\`` before writing the fixture; the test runs the hook live, extracts the block, **also** normalizes its own captured HEAD to `n/a` before comparing. The fixture is decoupled from any specific HEAD.
- **(ii) Capture the specific HEAD at regen time**: the fixture has `HEAD: \`<sha-at-regen>\`` baked in. The test must run at that exact HEAD to pass — fails on every other commit. Brittle.
- **(iii) Normalize to `HEAD` (literal string)**: the fixture has `HEAD: \`HEAD\`` baked in. The hook output already treats the literal `HEAD` as "fresh" in the stale-predicate (per `memory_session_start.sh:106` — `stamp != 'HEAD'`). The test normalizes the captured HEAD to the literal `HEAD` before comparing.

**Recommendation on HEAD**: option (i) — keep the `n/a` sentinel. Matches today's fixture bytes byte-for-byte for the HEAD line; the only drift is in entry counts. Minimal change to existing behavior.

### Recommendation — Target 3

**Candidate 3B (helper script) + HEAD option (i) (`n/a` sentinel)**.

Why: reproducible, documented, low coupling risk (compared to 3C's test-runner footgun), and the helper script doubles as a future-maintainer reference. The `n/a` HEAD sentinel matches the current fixture's bytes and is independent of any specific HEAD — re-runnable from any tree state.

**What would flip**:
- If the project has a strong "no shell scripts in `fixtures/`" convention, **3C** wins despite the footgun risk (mitigated by requiring a magic-word flag).
- If the maintainer wants the test to self-heal (auto-regenerate on every run), neither 3B nor 3C is right — that's a different feature (CI-friendly auto-regen) and is explicitly out-of-scope for this workflow.

---

## Open questions for the spec author

These are the calls only the spec author (or the human reviewer at `/approve-spec`) can make:

1. **Target 1**: pick 1A / 1B / 1C. The recommendation is 1A; flip conditions are listed above.
2. **Target 2**: pick 2A / 2B / 2C. The recommendation is 2C; flip conditions are listed above.
3. **Target 3**: pick 3A / 3B / 3C, and pick the HEAD-normalization option (i / ii / iii). The recommendation is 3B + (i).
4. **Drift report shape** (intake Q5): if 1A is chosen, the drift report path is `.claude/state/drift/<slug>.md` by convention. If 1B, it's the artifact glob declared in `project.json → workflow.artifacts.drift`. If 1C, it's a sibling of `last_test_result` at `.claude/state/last_drift_result`. The spec author picks the format inside the report — markdown table with `AC | item | verdict | evidence` columns is the obvious shape, but `unknown` semantics (intake Q3, Q4) require explicit definition: what evidence counts as "ambiguous"?
5. **`status: picked-up` write timing** (Target 2): regardless of A/B/C, decide whether the write is atomic (one bulk write per workflow) or per-key (loop). Per-key is simpler; atomic is one fewer file write. Both are fine for ≤ 10 source keys.
6. **HEAD sentinel sub-handling**: the test runner already normalizes its captured HEAD by *not* normalizing (it just compares raw bytes). For (i) to work, the test's extraction step must also normalize. Spec author confirms the test runner edit is in scope of this workflow (it's a 3-line sed/python addition; trivial but it's a test-file edit).

## What this memo does NOT decide

- Whether Goal 2 should also cover C4 component drift, dependency-graph drift, or class-diagram drift in addition to ACs + Design calls rows. The intake explicitly scopes this OUT (intake non-goal #2: *"NOT building a generalized 'drift detection' framework"*). The spec inherits that scope.
- Whether the dogfood AC (intake AC#9) is mandatory or aspirational. The recommendation in Target 2 (2C) makes it pass; choosing 2A makes it fail unless re-worded.
- The specific report-rendering format inside the drift report. The spec must define it; the candidates above only commit to the existence and location of the report.
