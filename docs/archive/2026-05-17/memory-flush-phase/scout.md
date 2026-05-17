# Codebase Scout Report — memory-flush as workflow Phase 10.6

Intake: `docs/intake/memory-flush-phase.md`. The scope is meta-structural: a new workflow phase, plus cascading edits to the constitution, mirrors, harness/triage skills, the memory-flush skill itself, the commit/chore skills, the SessionStart hook's "K candidates pending" nag, and audit + test coverage.

## Primary touchpoints

### Constitutional layer (Article I precedence)

- `docs/init/seed.md:302-324` — `§5 — The 11-phase workflow` ASCII block listing the phase chain `1 intake … 10.5 archive … 11 /grant-commit … 11b commit`. **Insert `10.6 memory-flush` between current lines 321 (`10.5 archive`) and 322 (`11 /grant-commit`).** Seed governs the constitution (Art. I.4), so this edit lands first.
- `docs/init/seed.md:204-206` — bullet list naming `archive` and `commit` as Phase 10.5 / 11. **Add `memory-flush` bullet as Phase 10.6** between the archive and commit bullets.
- `docs/init/seed.md:154` — `track_guard` row in the hooks table claims "Enforces 11-phase ordering." See **§ track_guard** below for whether this stays "11" or moves to a different framing.
- `docs/init/seed.md:14` — preamble sentence: "Eleven workflow phases plus one stripped-down chore track…". This headline count stays at "Eleven" — Phase 10.6 is a sub-phase like 10.5, not a new top-level phase. (Same convention the constitution already uses for archive.) **No edit required.** Spec-time decision: confirm we keep the "Eleven" framing or move to "Eleven plus archive plus memory-flush" — the cleanest move is to keep "Eleven" and let the constitution + seed §5 enumerate the 10.5 / 10.6 sub-phases.
- `docs/init/seed.md:488` — `§12 — Archive discipline (Phase 10.5)`. The sibling treatment of memory-flush could land as a new `§12.5 — Memory-flush discipline (Phase 10.6)` here, or roll into §12 as a closing paragraph. **Spec to decide.**
- `docs/init/seed.md:614` — `*(none) — the canonical 11-phase workflow applies` (inside §13). Cosmetic only; "11-phase" framing stays.

- `src/seed.template.md:302-324` — byte-equivalent mirror of seed §5; same edits.
- `src/seed.template.md:204-206` — same bullet list.
- `src/seed.template.md:154` — track_guard row.
- `src/seed.template.md:14` — preamble.
- `src/seed.template.md:488` — `§12 — Archive discipline (Phase 10.5)` mirror.

### Constitution + template mirror

- `CLAUDE.md:51-91` — Article IV "Workflow ordering". The phase table (lines 55-71) needs a new row between line 70 (`10.5 Archive`) and line 71 (`11 Grant commit + commit`):
  ```
  | 10.6 | Memory flush | `/memory-flush` | curated canonical memory + reset `_pending.md` |
  ```
  Also revise the prose mandatory rules (lines 73-90) — the "Phase 6c and Phase 11 are git-conditional" bullet and the "Swarm vs solo at Phase 6" paragraph aren't affected, but the introductory line (`The 11-phase workflow is the only sanctioned path …`) stays as "11-phase" with the convention noted above.
- `CLAUDE.md:47` — Article III.4 Memory check: "If it reports K candidates pending in `_pending.md` with `K > 0`, you SHALL invoke `/memory-flush` before any workflow phase work — keeps canonical memory fresh for downstream skills." **Downgrade to debt-only.** New wording (draft): "If it reports `K candidates pending` with K > 0 AND no active workflow on disk, those candidates are debt from a prior workflow that didn't end-flush; consider running `/memory-flush` to clear them before starting new work. During an active workflow, Phase 10.6 handles flushing automatically."
- `CLAUDE.md:92-117` — Article V harness orchestration. The phase ordering arrow chain isn't directly in Article V; it's in the harness skill's SOP. Article V's text doesn't need ordering changes, but the integrate-failure decision tree (lines 112-117) implicitly assumes integrate happens before any memory-related phase. Confirm spec: integrate-failure auto-loop replays `/tdd` → `/integrate`; memory-flush isn't reachable from this path. **No Article V edit needed beyond ensuring the prose doesn't contradict the new ordering.**
- `CLAUDE.md:193` — track_guard hooks-table row: "Enforce 11-phase ordering for workflow artifacts." See **§ track_guard** decision.
- `CLAUDE.md:215` — Article IX bullet 3 about `_pending.md`. Stays current.

- `src/CLAUDE.template.md:47, 53, 70, 78, 90, 193, 215, 218, 322` — same edits as CLAUDE.md (byte-equivalent mirror in the relevant Articles).

### Phase skills

- `.claude/skills/harness/SKILL.md:102-113` — `## Phase ordering — the 11-phase pipeline` block. The arrow chain at lines 106-109:
  ```
  intake → scout → research → spec → /approve-spec → tdd → simplify →
  security → integrate → document → archive → /grant-commit → commit
  ```
  **Insert `memory-flush` between `archive` and `/grant-commit`:**
  ```
  intake → scout → research → spec → /approve-spec → tdd → simplify →
  security → integrate → document → archive → memory-flush →
  /grant-commit → commit
  ```
  The harness loop is task-driven (picks lowest-id pending non-blocked task from TaskList), so this prose change is documentation-only — the loop will already pick up a `memory-flush` task seeded by triage.
- `.claude/skills/harness/SKILL.md:4` — frontmatter description: "Walks the 11-phase pipeline, invoking each phase skill…". Stays at "11-phase" per the convention above.

- `.claude/skills/triage/SKILL.md:33-47` — Step 5 "Seed the workflow tasklist" canonical templates. **Four templates need `Run /memory-flush` insertion before the grant-commit gate:**
  - Lines 35-38 (chore track): currently has only `chore → grant-commit → commit`. Confirm Q1 from intake: chore also runs memory-flush. **Insert** `Run /memory-flush for <slug>` (`metadata.phase: "memory-flush"`) between the chore task and the grant-commit task, with `addBlockedBy` chained.
  - Lines 40-41 (tdd quickfix): list ends with `… Run /archive, Wait for /grant-commit … Run /commit`. **Insert** `Run /memory-flush` between archive and the grant-commit wait.
  - Lines 43 (spec entry): "continue per the full track" → falls through to the intake template.
  - Lines 45 (intake entry full track): list ends with `… Run /archive, Wait for /grant-commit … Run /commit`. **Insert** `Run /memory-flush` between archive and the grant-commit wait.

- `.claude/skills/memory-flush/SKILL.md:1-173` — the skill itself. **Add a new section near the top** ("When invoked as Phase 10.6") that names workflow-phase semantics and the idempotent-no-op early-exit clause. The existing Step 0 / Step 1–5 / Step 6 flow stays. New clause:
  - Before Step 0: read `.claude/memory/_pending.md` body. If zero `## CANDIDATE:` blocks exist, skip Steps 1–5 (still run Step 0 auto-close + stale sweep — those operate on canonical files and Q-001 specifically needs the auto-close path to fire). Skip Step 5's pending-body reset (already empty). Emit a single-line Step 6 report: `memory-flush — no pending candidates; canonical closure swept`. The skill returns success in ≤ 3 tool calls.
  - The skill is also user-invokable (outside the workflow). When workflow.json is absent, the existing flow runs identically.

- `.claude/skills/commit/SKILL.md:8, 16` — Prereq line (line 8) says: "`archive` in `completed` AND a valid consent token at `.claude/state/commit_consent`". **Amend** to add `memory-flush` in `completed` (or in `exceptions`) as a prereq. Step 2 (line 16) verifies "`archive` is the final non-commit entry in `completed`"; update to "`memory-flush` is the final non-commit entry in `completed`". The first-step archive of `workflow.json` (Step 1, line 15) and the subsequent commit logic are unchanged.

- `.claude/skills/chore/SKILL.md:83-85` — Step 6 (line 83) invokes `Skill(archive)`. Step 7 (line 84) appends `"chore"`, `"archive"`, and any conditional phases to `completed`. **Confirm Q1 from intake (chore runs memory-flush): Yes.** Insert a Step 6.5: `Invoke Skill(memory-flush) — mandatory.` Update Step 7 to also append `"memory-flush"`.
- `.claude/skills/chore/SKILL.md:40-50` — "Phase shape" subsection (visible at lines 40-50 per `grep` output). Adds memory-flush as Step 3.5 or a new bullet.
- `.claude/skills/chore/SKILL.md:46` — "`archive` — empty bundle is fine; `/commit`'s prereq requires `archive` in `completed`." Mirror with "`memory-flush` — empty pending is fine; `/commit`'s prereq requires `memory-flush` in `completed`."

### Hooks

- `.claude/hooks/track_guard.sh:1-128` — phase ordering enforcement. Reads `project.json → workflow.phases` (line 54) and `workflow.artifacts` (line 55). The current `phases` array (`.claude/project.json:94-106`) is: `intake, scout, research, spec, review, tdd, simplify, security, integrate, document, commit` — **note: `archive` is NOT in this list** (it's a sub-phase the harness/skills manage; it has no slug-scoped artifact globbed by track_guard). track_guard's enforcement is artifact-driven (line 67: "If `file_phase is None` → allow"). Since `/memory-flush` writes target `.claude/memory/*.md` (not under any `docs/<phase>/` glob), **track_guard ignores these writes by design.** No track_guard code change needed.
  - **Decision for spec:** also no `project.json → workflow.phases` addition needed. memory-flush follows the archive convention: managed by triage/harness/chore TaskList wiring, invisible to track_guard. The "Enforce 11-phase ordering" prose in CLAUDE.md/seed.md describes the gates track_guard *does* enforce (the 11 entries in `project.json`'s phase list); 10.5 and 10.6 are sub-phases of the same surface.
  - **Verification needed at integrate**: write a test that confirms a Phase 10.6 invocation isn't blocked by track_guard when archive is in completed.

- `.claude/hooks/memory_session_start.sh:144-176` — context block composition. Lines 168-176 render the "K candidates pending" message:
  ```python
  if pending_count > 0:
      lines.append(
          f'**{pending_count} candidate{"" if pending_count == 1 else "s"} pending in `_pending.md`** — '
          'run `/memory-flush` to review and commit keepers before starting workflow phases.'
      )
  else:
      lines.append('No pending memory candidates.')
  ```
  **Three behavior changes (AC-7, AC-8, AC-9):**
  1. Read `.claude/state/workflow.json` (or accept its presence as an env var). If it exists, treat as "active workflow."
  2. **AC-7:** If `pending_count > 0` AND no active workflow, emit the debt-mode wording: `**{n} candidate(s) carried over from a prior workflow** — run `/memory-flush` to clear before starting new work.`
  3. **AC-8:** If `pending_count == 0`, emit nothing (instead of the "No pending memory candidates." line — currently noise). Or keep it as a positive confirmation; spec decides.
  4. **AC-9:** If `pending_count > 0` AND active workflow exists, emit nothing (Phase 10.6 will handle it; nag would be redundant).
  - The change is contained in the python heredoc (lines 39-236) — no shell-level edits needed.

### Audit + tests

- `.claude/skills/audit-baseline/audit.sh:23-38` — `EXPECTED_HOOKS` set (22 hooks: 17 write/run + 4 lifecycle + 1 input-boundary). No change — memory-flush is a skill, not a hook.
- `.claude/skills/audit-baseline/audit.sh:184-186` — count checks compare claimed (from seed.md regex) vs. disk. With the "Eleven workflow phases" headline staying, the audit's claimed-count regex (`\bskills?\b` etc.) doesn't need updating. Phase count claim ("11-phase") in CLAUDE.md / README.md / seed.md stays.
- `.claude/skills/audit-baseline/audit.sh:740-836` — `docs_to_check` count-claim sweep over CLAUDE.md / README.md / seed.md. Headline patterns match `<n> hooks/skills/agents` — none of which change. Phase count claims appear in flowing prose ("11-phase workflow") not in the `<n> <noun>` headline form, so the sweep won't trip.

- `tests/` (project root) — existing test files relevant to phase ordering:
  - `tests/harness_continuation.test.mjs` — tests the Stop hook safety net (rung gates, marker behavior). **No phase-ordering assertions.** May need a new fixture verifying that Phase 10.6 appears between archive and grant-commit in the harness's task chain.
  - `tests/tdd-step-6.test.mjs` — TDD Phase 6 internals. Unrelated.
  - `tests/template-drift.test.mjs` — likely checks src/ mirror byte-equivalence. **Will catch CLAUDE.md/seed.md drift if mirror updates are forgotten.** Run it after every edit.
  - `tests/template-payload.test.mjs` — similar.
  - `tests/branch-aware-git-policy.test.mjs` / `tests/release-workflow.test.mjs` — feature tests; unrelated.
  - **New test file needed**: `tests/memory-flush-phase.test.mjs` covering AC-1 (harness chain ordering), AC-2 (idempotent no-op on empty pending), AC-6 (triage seeding wires memory-flush task between archive and grant-commit), AC-7/8/9 (memory_session_start nag behavior with workflow.json fixture variations), AC-10 (constitution + mirror consistency), AC-11 (commit prereq gate).

- `.claude/skills/memory-flush/tests/run.sh` — existing test harness for memory-flush sweep modes (auto-close / prose-scan / stale-sweep). **Add a new test case** asserting the empty-pending no-op path.

### Documentation

- `README.md:44` — "**11-phase workflow** from intake to commit". Stays.
- `README.md:67` — workflow phase enumeration in the inventory table: `intake → scout → research → spec → tdd → simplify → security → integrate → document → archive → commit`. **Insert `memory-flush` between archive and commit:** `… archive → memory-flush → commit`. (Count stays at 11; the table headline column reads "11".)
- `README.md:169` — "The 11-phase workflow is enforced at the write boundary by `track_guard`." Stays.

- `site-src/_data/baseline.json` — declares phase + skill counts for the documentation site. `"phases": 11` stays. `"byCategory": { "memory": 1 }` stays (memory-flush is the same one memory skill, now invoked as a workflow phase too). **No site-data edit needed.**
- `site-src/cli.njk`, `site-src/hooks.njk`, `site-src/index.njk` — likely user-facing docs site. **Run a grep for phase enumerations** before commit; ad-hoc.

### State + schema

- `.claude/state/workflow.json` (this workflow's instance: already has `slug=memory-flush-phase`, `entry_phase=intake`, `exceptions=[]`, `completed=["intake"]`). The schema's `completed` array is free-form; no allowlist validation exists for the values. **No schema change needed.** The harness/triage/chore skills are the only consumers, and they will be updated to write `"memory-flush"` into `completed`.

- `.claude/state/harness/<slug>.log` — logs "entered/completed/yielded" for each phase. The new `entered memory-flush` / `completed memory-flush` log lines fall out of the existing harness pattern; no log-schema change.

### Memory system itself

- `.claude/memory/_pending.md` — currently 19 candidates queued. **Phase 10.6 of THIS workflow will process them** as part of the meta-bootstrap. The expected outcome (per intake): mass discard since they're all "file touched N times" noise from the prior design-ui workflow.
- `.claude/memory/pending-questions.md:17-25` — Q-001. **Adding `resolved-at: 2026-05-16` field to Q-001 inline as part of this workflow's diff** will let Step 0a auto-close (per the memory-lifecycle-closure spec landed 2026-05-13) delete the entry on the next `/memory-flush` invocation (which is THIS workflow's Phase 10.6). This is the cleanest closure path — Q-001 resolves itself by being processed by the very mechanism it asked about.
- `.claude/memory/README.md` — schema doc. Doesn't enumerate phases. No edit.
- `MEMORY.md` (project root) — index file injected at session start. Doesn't enumerate phases. No edit.

## Entry points that reach this code

- `/harness` (user-typed) → `Skill(harness)` → loop body picks `Run /memory-flush` task → `Skill(memory-flush)` → produces canonical writes + resets `_pending.md`.
- `/triage` (user-typed) → `Skill(triage)` → seeds Tasklist with memory-flush task inserted between archive and grant-commit gate.
- `/chore` (user-typed via `/triage` chore route) → `Skill(chore)` → Step 6.5 invokes `Skill(memory-flush)`.
- `/memory-flush` (user-typed, ad-hoc) → `Skill(memory-flush)` → same flow as a phase invocation; workflow.json absent path falls through.
- `memory_session_start` Bash hook (SessionStart event) → emits the rephrased "K candidates pending" debt-mode nag when conditions are met.

## Existing tests

| Test | Coverage | Status |
|---|---|---|
| `tests/harness_continuation.test.mjs` | Stop-hook three-rung gate (marker, state, stop_hook_active) | passing; no phase-ordering assertions |
| `tests/template-drift.test.mjs` | src/ mirror byte-equivalence | passing; will catch CLAUDE.md ↔ src/CLAUDE.template.md drift |
| `tests/template-payload.test.mjs` | template overlay payload integrity | passing |
| `tests/tdd-step-6.test.mjs` | TDD Phase 6 internals | passing; unrelated to ordering change |
| `tests/release-workflow.test.mjs` | release CI workflow | passing; unrelated |
| `.claude/skills/memory-flush/tests/run.sh` | sweep.py auto-close / prose-scan / stale-sweep modes | passing; needs empty-pending no-op case added |

No existing test asserts:
- That the harness's TaskList chain places memory-flush between archive and grant-commit (AC-1, AC-6).
- That memory-flush is a fast no-op on empty `_pending.md` (AC-2).
- That `/commit` refuses when memory-flush isn't in completed (AC-11).
- That `memory_session_start.sh` emits the debt-mode wording in the three scenarios (AC-7, AC-8, AC-9).
- That CLAUDE.md / mirrors / seed.md consistently name Phase 10.6 (AC-10).

These are the new test cases for `tests/memory-flush-phase.test.mjs` (or whichever filename the spec picks).

## Constraints and co-changes

- **Template mirror parity.** Every edit to `CLAUDE.md` requires an identical edit to `src/CLAUDE.template.md`. Every edit to `docs/init/seed.md` requires the same in `src/seed.template.md`. `tests/template-drift.test.mjs` will fail if mirrors diverge.
- **`_pending.md` is fully gitignored.** Confirmed at `.gitignore:90-92`: the whole file (not just the body) is excluded from staging. The intake's AC-4 needs revising: canonical memory writes (`.claude/memory/<canonical>.md`) appear in the diff; `_pending.md` does NOT — there's nothing to compare in the working tree because git doesn't track it. The "co-located commit" AC reduces to: any canonical writes from Phase 10.6 ride in the workflow's commit. The pristine tree AC is naturally satisfied because the only files Phase 10.6 modifies that git tracks are the canonical six.
- **The "11-phase" headline survives.** Phase 10.5 (archive) and Phase 10.6 (memory-flush) are sub-phases under the top-level "11-phase" framing, consistent with how archive already works. No headline count change in seed/CLAUDE/README needed.
- **Audit-baseline must continue to PASS.** None of the planned edits trip the audit's count claims, hook set, skill set, or template-drift checks. Run after every edit batch.
- **Q-001 closure mechanism.** This workflow's Phase 10.6 invocation will trigger sweep.py auto-close on `pending-questions.md` for any entry carrying `resolved-at: <ISO>`. **Add `resolved-at: 2026-05-16` to Q-001 inside this workflow** (the change rides in the constitution-edit batch) so the sweep deletes the entry naturally.
- **harness_state schema.** The state file has exactly three fields (`state`, `slug`, `reason`). Phase 10.6 transitions write `state: "continue"` with `reason: "memory-flush done; next: grant-commit"` (or similar). No schema change.

## Patterns in use here

- **Phase invocations are skill calls.** The harness's loop body invokes `Skill(<phase>)`. The skill writes its artifact (or, for non-artifact phases like tdd/simplify, executes and reports), then returns success. The harness appends to `workflow.json → completed` and refreshes `harness_state` + the active marker. memory-flush follows the same pattern.
- **Sub-phases follow the archive pattern.** Archive is Phase 10.5 — sub-phase to the top-level "11-phase" ordering, managed by the harness/triage TaskList, invisible to track_guard, written into `completed` by the harness. memory-flush mirrors this convention as Phase 10.6.
- **State-write ordering.** Marker FIRST, then state file, then (only at loop-exit boundaries) the terminal message. Phase 10.6's harness-iteration follows the same pattern.
- **Skill-driven curation.** memory-flush runs in main context — it reads `_pending.md` and canonical files, decides per candidate, writes selectively. The skill's only structural mutation is `Write` on canonical files + the `_pending.md` reset. No subagent delegation (Article II).
- **Constitutional precedence.** Every binding rule lives in seed.md first, then CLAUDE.md, then implementation. Edits propagate in that order; `tests/template-drift.test.mjs` enforces the mirror invariant.

## Risks / landmines

- **Meta-bootstrap risk.** This workflow's Phase 10.6 runs *before* the constitution edits land in HEAD. The harness loop is task-driven (not phase-table-driven), so the `Run /memory-flush` task seeded by this workflow's triage will fire correctly even though the constitution still says "11-phase / 10.5 archive / 11 commit" at the moment of invocation. The constitution catches up in the same commit. Risk: if the harness's loop logic itself checks against a hardcoded ordering somewhere we missed, the new phase could be blocked. **Mitigation:** scout's grep confirms the harness reads TaskList state, not a hardcoded phase array. The only hardcoded ordering is the *documentary* arrow chain in harness/SKILL.md:107-109.
- **chore track parity.** Q1 from intake (chore runs memory-flush). Scout recommends YES — chore can produce candidates (e.g., a dependency bump that the extractor flags as a library candidate). Spec to confirm and update the chore SKILL.md Steps 6.5 / 7.
- **`/grant-commit` and `commit` consent token.** Adding memory-flush doesn't introduce a new gate. Consent is still gate-C → `/grant-commit` writes `commit_consent`, the commit skill consumes it. The new prereq on commit (`memory-flush` in `completed`) lives in the skill prose, not in the `git_commit_guard` hook. **Verify** during integrate: the commit skill's pre-flight check correctly refuses when memory-flush is missing from completed.
- **Idempotent no-op on empty pending — do not skip Step 0.** The current memory-flush SKILL.md's Step 0 sweeps canonical files for closure (auto-close + prose-scan + stale-sweep). Even when `_pending.md` is empty, Step 0 may close entries on `pending-questions.md` or the other five files. The idempotent-no-op clause skips Steps 1–5, NOT Step 0. **Verify** in spec.
- **Q-001 closure timing.** This workflow's Phase 10.6 needs to find `resolved-at: 2026-05-16` already on Q-001. The edit lands during /tdd; the field is in place by the time Phase 10.6 fires. **Verify** the implementation sequence in the spec orders the pending-questions edit BEFORE the harness reaches Phase 10.6.
- **AC-7/8/9 mutual-exclusion logic.** The hook needs to distinguish three cases:
  1. K=0 → silent (or positive line, spec decides)
  2. K>0 AND active workflow → silent
  3. K>0 AND no active workflow → debt-mode nag
  The bug surface is the "active workflow" detection: presence of `.claude/state/workflow.json` is the obvious signal. Stale workflow.json from a previous incomplete session could mask debt; the existing memory_session_start hook already removes a stale `.harness_active` marker at session boundary (lines 22-28). **Verify** the workflow.json detection is robust against stale-state edge cases.
- **Documentation-site phase enumeration.** site-src/index.njk and site-src/_layouts may render phase counts/lists. Scout couldn't recursively find these without globbing. **Spec to verify** site-src enumerations match constitution.
