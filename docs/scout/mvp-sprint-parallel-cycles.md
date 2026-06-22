# Codebase Scout Report — lift swarm parallelism to the epic/sprint level

Scope: the epic that adds MVP/sprint planning + a completeness oracle, an epic-level wave/DAG scheduler, parallel epic-child dispatch + a RALPH yield/stop-rule, a merge/integrate/single-gate-C, and an Article II amendment. Mapped against the 5 slices (A–E) in `.claude/state/epic/mvp-sprint-parallel-cycles.json`.

## Primary touchpoints

**Epic track machinery (the substrate — there is no dedicated `epic` skill dir; logic is spread):**
- `.claude/skills/triage/SKILL.md` — "Materializing an `epic` track" + "Materializing an `epic-child` track" sections; writes `.claude/state/epic/<slug>.json` (slices[], approved, children[]) and the per-child `workflow.json` with `pinned_artifacts`. **Slice A/B hook in here** (planning → slice generation).
- `.claude/skills/harness/SKILL.md` — "Epic / epic-child tracks (§18.9)" section; the `epic` track is discovery-only, `epic-child` starts at `tdd` and runs **solo, serial, one child per workflow**. **This is the exact serialization Slice C replaces.**
- `.claude/skills/spec/SKILL.md` — on an `epic` track, reads `slices[]` and writes one `## Slice <id>` section per slice (the sliced spec).
- `.claude/skills/commit/epic_close.mjs` + `commit/SKILL.md` Step 2.8 — flips a slice's `children[]` entry to `status: "committed"` pre-commit, and folds the epic closed when the last child commits. **Slice D's single-gate-C merge must reconcile with this per-child close model.**
- `.claude/hooks/track_guard.mjs:45` `epicInheritanceSatisfied()` — refuses every `epic-child` write until the named epic is real, `spec_approvals/<epic>.approval` exists, and all pins resolve. **Slice C's parallel children each still pass through this gate.**
- `.claude/hooks/epic_approval_guard.mjs` — gates the epic-state `approved: true` flip to the existence of the gate-A token (forge-proof).

**Swarm internals to lift up one tier (component-level → slice-level):**
- `.claude/skills/swarm-plan/validate.mjs:112` `assignWaves(tasks, ids, indeg, outedges)` — **the exact disjoint-write_set topological wave scheduler Slice B lifts.** Topo-sort + greedy pack of pairwise-disjoint `write_set`s into waves; `validateSchema` requires non-empty `write_set` per task. Reuse-before-create candidate (Art. VI.4).
- `.claude/skills/swarm-dispatch/SKILL.md` — the parallel-spawn pattern: one `swarm-worker` Task per wave task, **all Task calls in a single assistant message** so the runtime runs them concurrently; aborts remaining waves on any audit/task failure. **Slice C's dispatch loop mirrors this shape at the epic-child grain.**
- `.claude/skills/swarm-dispatch/worktree-safety.mjs:11` `assertWorktreeWaveSafety()` — returns `{ok:false}` for multi-wave under worktree isolation (see landmine below).
- `.claude/skills/swarm-dispatch/swarm_merge.mjs` — per-task merge+audit: diffs worktree vs `active_wave.json.baseline_ref`, audits changed files ⊆ write_set, `git apply`s to main **without committing**, removes the worktree. **Slice D's merge-audit lifts this.**
- `.claude/skills/swarm-dispatch/swarm_wave_audit.mjs` `auditWave` + `parse_worker_result.mjs` `parseWorkerResult` — wave-level write-set discipline + worker JSON status parsing.
- `.claude/agents/swarm-worker.md` (rendered from `src/agents/swarm-worker.template.md`) — the lone subagent; runs `scenario`→`implement` on a pre-decided recipe. **Slice C's parallel epic-child needs a worker that runs a *full child cycle* (tdd→integrate→…), not just scenario+implement — this is the capability gap, and the Article II tension Slice E resolves.**

**RALPH / maker-checker v1 machinery (partial, already on disk):**
- `.claude/skills/harness/maker-checker.mjs` (12 lines) — `assertBounded({makers, checkers})`: throws unless exactly 1 maker. The §II.A clause-6 invariant. **Slice C's RALPH stop-rule extends this charter.**
- `.claude/skills/harness/replan.mjs` (90 lines) `applyReplan` — record-only replanner (the decide-*when* loop is backlog `-4c43`, exactly Slice C).
- `.claude/skills/harness/graduation-gate.mjs` (58 lines) — the clause-7 graduation gate pattern Slice E's amendment must clear.
- `.claude/skills/harness/plan-{store,frame,diff,wiring}.mjs` + `evidence-ledger.mjs` — durable plan state at `.claude/state/plan/<slug>.json`; per-node frames, visible replan diffs. **Slice C's yields record onto this plan lineage.**

**Constitution surfaces an Article II amendment (Slice E) touches:**
- `CLAUDE.md:20` Article II + `:24` (one subagent) + `:26` (§II.A graduated fan-out).
- `docs/init/seed.md:188` **§II.A bounded maker/checker charter** — clauses 1–7; clause 6 lifts the checker cap for oracle-bound checkers only; **"multi-maker scaling, judgment-checker fan-out, and RALPH waves remain the graduation targets, each requiring its own clause-7 round."** Slice E is precisely a new clause-7 graduation for the parallel-child-cycle class.
- `docs/init/seed.md` §4.2 (subagents), §18.9 (epic/epic-child).
- `src/CLAUDE.template.md` + `src/seed.template.md` — **byte-equal mirrors; must change in lockstep** (Art. XI; autosync exists but verify).
- `.claude/skills/audit-baseline/audit.mjs` — must pass post-amendment (hook/agent/skill counts + Article XI citations + size cap).

## Entry points that reach this code

- `/triage` → epic track materialization (slice generation).
- `/harness` → the loop that today runs epic-children serially; Slice C changes its dispatch arm.
- `/swarm-dispatch` → the existing parallel-Task spawn pattern (the model to lift).
- `/approve-spec <epic>` (gate A, one approval) and `/grant-commit` (gate C) — both must stay intact on the parallel path (AC-7).

## Existing tests

- `tests/branch-aware-git-policy.test.mjs`, `tests/git-topology-guard.test.mjs` — worktree sandbox helpers (`addWorktree`); pattern for testing worktree dispatch.
- `tests/swarm-first-run-hardening.test.mjs` — the most recent swarm worktree-safety/merge coverage (the `-e3f2` work).
- `tests/no-live-objtemplate-reads.test.mjs` — regression guard: a default-tier test must not build against the live `obj/template/`.
- Epic/track_guard coverage exists around `track_guard.mjs` and `epic_approval_guard.mjs`; new parallel-child tests extend these.

## Constraints and co-changes

- **Slices A–E all edit baseline-owned skills/constitution** → every change-set needs `npm run build` (manifest rehash) + `audit-baseline` to pass, and CLAUDE.md/seed.md edits need their `src/*.template.md` mirrors in lockstep.
- **Article II amendment (Slice E) precedence (Art. I.4):** edit `seed.md` first, then `CLAUDE.md`, then implementation. It is a fresh clause-7 graduation, gated on Slice C's prototype (backlog `-9360` "after prototype").
- **`/integrate` must run serially** (`node --test --test-concurrency=1`) for a deterministic verdict (see rebuild-races landmine).
- **Worktree isolation is git-only** — the parallel path is unavailable on non-git trees (consistent with swarm).

## Patterns in use here

Deterministic mechanical oracles are `.mjs` helpers next to their SKILL.md, exit-code-driven (0 pass / non-zero block), fail-open or fail-safe by explicit construction. Parallel work spawns one Task per unit, all in a single message, with a post-hoc write-set audit before changes land on main. Constitution changes flow seed → CLAUDE → mirror → manifest → audit. The wave scheduler and merge-audit are already written for the component grain and are reuse-before-create candidates for the slice grain.

## Risks / landmines

- **`multi-wave-worktree-is-an-agent-tool-constraint` (landmines.md:273) — LOAD-BEARING for Slices B/C/D.** Multi-wave swarm plans under worktree isolation are unsupported *by design*: the Agent tool owns each worktree's base commit and forks from a stale ref, and `swarm_merge.mjs` applies wave output **without committing**, so wave-N+1 worktrees never see wave-N output. Confirmed twice (`-424f`, `-e3f2`). **Implication:** parallel epic-children with cross-slice dependencies (slice B needs slice A's API) are exactly the unsupported multi-wave-under-worktree case. The scheduler/dispatcher must either (a) parallelize only genuinely-independent slices within one wave, (b) commit between waves so later worktrees fork from fresh HEAD, or (c) use shared isolation — research must decide. This is the single biggest design constraint on the speed lever.
- **`baseline-skill-edit-needs-manifest-rebuild` + `live-objtemplate-rebuild-races`** — run `npm run build` immediately after the first SKILL.md edit; keep `obj/template` reads isolated; integrate serially.
- **Capability gap (not a bug):** the current `swarm-worker` runs only `scenario`+`implement`. A parallel *epic-child* must run a full child cycle (tdd→integrate→archive→…), which today is main-context, serial work — the Article II wall Slice E exists to move. Slice C's prototype must prove the shape before the wall moves.
- **`maker-checker.mjs` enforces `makers===1 && checkers===1`** for bounded round-trips; §II.A clause 6 only lifted the cap for *oracle-bound read-only checkers*. RALPH waves (Slice C) are explicitly named as still-future, each needing its own graduation — do not assume the existing charter covers parallel child cycles.
