# Codebase Scout Report — swarm-first-run-hardening (D1, D2, D4, D5, D7)

Scope: the swarm subsystem (plan → approve → dispatch → merge/audit), its boundary guard, the worker agent contract, and the `project.json → swarm` config. Read-only scout; maps what *is*, not the fix.

## Primary touchpoints

### Dispatch + merge (D1, D2, D4)
- `.claude/skills/swarm-dispatch/SKILL.md` — the wave runner SOP. Records `baseline_ref` once at dispatch start (`§Per-wave loop → "Record the baseline: git rev-parse HEAD"`, line 40), writes it into `active_wave.json` (lines 58–72), never advances it between waves. Step 6 "Per-task merge-audit" (lines 158–172) calls `swarm_merge.mjs`. Step 6's "No worktree path returned" branch (line 172) just "Mark task per the worker's self-reported JSON" — **no detection of a missing/garbled JSON line (D4)**. Shared-mode fallback (lines 190–200) has **"No per-task merge-audit"** and relies entirely on `swarm_boundary_guard` (D2 gap surfaces here).
- `.claude/skills/swarm-dispatch/swarm_merge.mjs` — worktree merge+audit. **D1 core**: line 74 diffs the worktree `git -C <wt> diff <baseline> --name-only`; lines 90–99 audit changed files ⊆ write_set; lines 101–120 `git -C <root> apply` the full diff to **main's working tree** — and **never `git commit`s** (confirmed: zero commit/worktree-add calls in the file). So wave-N output lands uncommitted; `baseline_ref` (HEAD) never moves. Any wave-N+1 worktree the Agent tool forks from a *commit* therefore lacks wave-N output → cross-wave deps fail. `baseline_ref` is set to `HEAD` by dispatch but the Agent-tool worktree's real base may differ → merge-audit would diff against the wrong base.

### Boundary enforcement (D2)
- `.claude/hooks/swarm_boundary_guard.mjs` — PreToolUse(Write|Edit|MultiEdit). Lines 47–56: reads `swarm.exempt_path_prefixes`, and **any path under an exempt prefix → `emitAllow()` immediately** (line 55). `.claude/` is in the exempt list, so writes under `.claude/skills/**` are never checked against any write_set. Lines 58–60: only paths under `enforced_path_prefixes` are enforced; `.claude/` is not in that list either. **D2 blind spot is structural**: the guard's two-list design exempts exactly where baseline self-dev happens.
- `.claude/project.json → swarm` — `isolation: "shared"` (this project's active mode), `exempt_path_prefixes: [".claude/", ".git/", ".venv/", "node_modules/"]`, `enforced_path_prefixes: ["src/","lib/","app/","pkg/","internal/","tests/","test/","spec/","docs/"]`. Note `.claude/` is exempt and absent from enforced — so shared mode has *zero* write_set enforcement for baseline-on-baseline work.

### Planning (D5)
- `.claude/skills/swarm-plan/SKILL.md` — Step 4 "Construct tasks" (lines 57–64) builds one task per component with `id/title/component/acs/write_set/read_set/depends_on`. **No worker-safe vs needs-main-context field anywhere.** The output contract (lines 25–44) and the surfaced plan table (lines 74–82) carry no such classification, so gate-B (`/approve-swarm`) can't reflect the real split.
- `.claude/skills/swarm-plan/validate.mjs` — schema validator + deterministic wave assigner (Kahn + pairwise-disjoint write_sets). `REQ` fields list (line 38): `['id','title','component','acs','write_set','depends_on']` — **no classification field**; adding one (D5) touches this list and `validateSchema`.

### Worker contract (D4 — worker side already hardened by D3/D6)
- `.claude/agents/swarm-worker.md` — lines 32–41 mandate the final JSON line `{task_id,status,files_touched,note}`; lines 30, 38–39 require completing both scenario+implement (the D4/D6 worker-template hardening already shipped). **The dispatch-side detection of a worker that violates this (D4) is the remaining gap** — the worker template says "must", but `swarm-dispatch` doesn't verify it.

## Entry points that reach this code
- `/swarm-dispatch <slug>` (skill) → per-wave `Agent(swarm-worker)` calls → `swarm_merge.mjs` per task.
- `/swarm-plan <slug>` (skill) → `validate.mjs`.
- `swarm_boundary_guard.mjs` fires on every Write/Edit/MultiEdit while `active_wave.json` exists.
- Harness Phase 6 routes to the swarm path when the approved spec has ≥ `swarm.min_tasks_worth_swarming` (3) independent components AND git is present.

## Existing tests
- `tests/track-guard-swarm-phase6.test.mjs` — D3: a completed `swarm-dispatch` satisfies the `tdd` ordering slot (`hooks/lib/track-order.mjs → phaseSatisfied`). Passing.
- `tests/render-swarm-worker.test.mjs` — swarm-worker template rendering (`{{SKILLS}}` token at init). Passing.
- `tests/track-tasklist-materializer.test.mjs` — references the `swarm-implementation` sub-track in `workflows.jsonl`. Passing.
- **No tests** for `swarm_merge.mjs` audit logic, `swarm_boundary_guard.mjs` enforcement, `validate.mjs` schema, or any dispatch-side result parsing. New unit tests (AC2–AC5) are greenfield here.

## Constraints and co-changes
- **Test harness is structural**: `project.json → test.kind: "structural"`, `test.cmd: node .claude/skills/audit-baseline/audit.mjs --file={file}`. Behavior unit tests are `tests/*.test.mjs` run via `node --test`. New safeguards need both: a `.test.mjs` and a clean audit.
- **Manifest-rebuild tax**: edits to `.claude/skills/**`, `.claude/hooks/**`, `.claude/agents/**` require `scripts/build-template.sh` + `audit-baseline` (landmine `baseline-skill-edit-needs-manifest-rebuild`). New shipped helpers must be `.sh` or `.mjs`/`.js` (no new Python).
- **Constitutional propagation**: any new guard behavior / worker-template imperative / Article-level rule needs the seed.md-first amendment path (Art. I.4) + `src/*.template.md` mirrors + the relevant annex.
- **Shared mode is this project's active isolation** (`swarm.isolation: "shared"`), so D2 (shared-mode audit) is the highest-leverage fix for baseline self-dev; D1 (worktree) matters for git projects that opt into worktree mode.

## Patterns in use here
- Helpers are single-file ESM `.mjs` with a `main(process.argv.slice(2))` tail, `fail()` to stderr, numeric exit codes (0 ok / 1 logical-fail / 2 bad-invocation). `swarm_merge.mjs` and `validate.mjs` both follow this; new D2/D4/D5 helpers should match it.
- Guards read payload via `hooks/lib/common.mjs` (`readPayload`, `payloadGet`, `projectGet`, `emitAllow`, `emitBlock`) and fail-closed on parse errors.
- Wave/audit logic is deterministic and side-effect-isolated to `.claude/state/swarm/`.

## Risks / landmines
- **D1 is partly outside baseline's control.** The worktree *base commit* is chosen by the Agent tool's `isolation:worktree`, not by baseline code. Baseline controls only (a) whether wave output is committed between waves (`swarm_merge` currently does not) and (b) what `baseline_ref` it records. So the research phase must decide: make it work (commit between waves + derive `baseline_ref` from the worktree's real `merge-base`) vs document worktree=single-wave-only + steer multi-wave → shared. **This is the open question blocking the spec's D1 section.**
- `swarm_merge`'s `git apply` to the working tree (no commit) is by design (Art. VII forbids unconsented mid-workflow commits; swarm worktrees are the exemption) — any "commit between waves" fix must reckon with the git-commit-guard / consent model.
- `live-objtemplate-rebuild-races` landmine: concurrent full-suite runs race the `obj/template` rebuild — the worker template already says "own test file only" (D6 shipped). Any new dispatch-side audit must not trigger a full rebuild mid-wave.
- Shared-mode "cross-task bleed within the wave is a known limitation" (SKILL.md line 197) — the D2 post-wave audit narrows out-of-union drift but does not solve intra-wave bleed; scope D2 to the documented out-of-union case.
