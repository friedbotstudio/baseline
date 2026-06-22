# Pattern Research — swarm-first-run-hardening (D1, D2, D4, D5, D7)

**Library-API note (context7):** This work touches only the git CLI, the Claude Code Agent tool's `isolation: "worktree"` behavior, and baseline's own single-file `.mjs` helpers — no third-party libraries. context7 is therefore not applicable (nothing to resolve/verify); git semantics below are CLI behavior, not a recalled library API. The test harness is `node --test` over `tests/*.test.mjs` (`test.kind: "structural"`).

---

## D1 — worktree multi-wave stale-base: Agent-tool constraint vs baseline bug

### The investigation (root cause)

Three facts, from the scout + the Agent-tool contract:

1. **The worktree base commit is chosen by the Agent tool, not baseline.** The tool's `isolation: "worktree"` "gives the agent its own git worktree" — baseline passes no base ref and has no parameter to set one. In the `-424f` run the worktrees forked from the **last-release commit `64d8a55` (17 behind HEAD)**, not current HEAD. So the base is tool-owned *and* was observed to be a stale ref, not the branch tip.
2. **`swarm_merge.mjs` applies wave output to main's working tree but never commits** (confirmed: zero `git commit` / `git worktree add` calls). So even after wave-N merges, HEAD does not advance.
3. **`baseline_ref` is recorded once as `HEAD` at dispatch start** (`swarm-dispatch` SKILL.md line 40) and never re-read, so it mismatches the worktree's actual base whenever (1) holds.

**Conclusion: D1's root cause is primarily an Agent-tool constraint, not a baseline-controllable bug.** Baseline cannot make multi-wave worktree correct by committing between waves, because the next wave's worktree does not fork from baseline's commits — it forks from a tool-chosen (observed stale) base. Committing between waves is also in tension with Art. VII (unconsented mid-workflow commits; the worktree path is the *exemption*, applied-not-committed by design). What baseline *can* control: (a) **detect** the mismatch (compare `baseline_ref` to the worktree's real `git merge-base`), and (b) **refuse/steer** multi-wave plans away from worktree mode.

### Candidate A1: Document worktree = single-wave-only + mechanical fail-fast guard *(recommended)*
- **Summary**: Accept the Agent-tool constraint. Add a mechanical guard in `swarm-dispatch` that, under worktree isolation, (i) refuses a multi-wave plan (`plan.waves.length > 1`) and steers it to shared mode, and (ii) for any worktree it does merge, derives the worktree's real base via `git -C <wt> merge-base HEAD <wt-HEAD>` and **fails fast** when it ≠ recorded `baseline_ref`. Document "worktree mode = single-wave only" in `swarm-dispatch` SKILL.md.
- **Fits**: Yes — matches the existing fail-loud, deterministic `.mjs` helper pattern (scout: `swarm_merge` exit-code convention). Honest about what baseline owns.
- **Tests it enables**: unit test that a 2-wave plan under worktree isolation is flagged refuse-or-steer; unit test that a `baseline_ref`≠`merge-base` mismatch returns the fail-fast exit code.
- **Tradeoffs**: Does not "make multi-wave worktree work" — but per the root cause that isn't baseline's to fix. Multi-wave parallelism under worktree is given up in favor of shared mode (which this project uses anyway). Cheap, reversible, unit-testable.

### Candidate A2: Make multi-wave worktree work (commit between waves + merge-base baseline_ref)
- **Summary**: After each wave's merges, `git commit` the applied output so HEAD advances, and derive `baseline_ref` per worktree from `git merge-base`.
- **Fits**: No — depends on the next worktree forking from the new HEAD, which fact (1) shows the tool does **not** reliably do (it forked from a 17-behind ref). Also collides with Art. VII (mid-workflow commits) and the consent model.
- **Tradeoffs**: High blast radius (changes the commit model), and **may not even fix the bug** because the worktree base is tool-owned. Rejected as primary; documented so the spec records why.

### D1 recommendation
**A1.** It's the honest resolution given the root cause, it's fully baseline-controllable, and it's unit-testable. AC1b (documented constraint + guard) is the path; AC1a (code-fix) is recorded as rejected with rationale. *Flip condition*: if the Agent tool gains a documented "fork from current HEAD / settable base ref" guarantee, revisit A2.

---

## D2 — shared-mode boundary blind spot

### Candidate B1: Post-wave diff-audit helper, independent of the guard's exempt list *(recommended)*
- **Summary**: New `.mjs` helper (e.g. `swarm_wave_audit.mjs`) that `swarm-dispatch` runs after each shared-mode wave: `git -C <root> diff --name-only` (working-tree changes since wave start) ∖ union(wave write_sets) → any leftover is an out-of-union violation → non-zero exit, surface the offending paths. Reuses `swarm_merge.mjs`'s audit logic (changed ⊆ write_set) **minus the apply**. Crucially it reads the wave's `write_sets` directly and does **not** consult `swarm.exempt_path_prefixes`, so `.claude/skills/**` is covered.
- **Fits**: Yes — mirrors `swarm_merge` audit (scout). Shared-mode currently has "no per-task merge-audit" (SKILL.md line 197); this fills exactly that gap.
- **Tests it enables**: unit test — a wave change under `.claude/skills/foo` outside the union write_set is detected; an in-union change passes.
- **Tradeoffs**: Catches out-of-union drift only, not intra-wave bleed between two tasks in the same wave (a documented known limitation; out of scope per intake). Needs a wave-start snapshot of the tree (record changed-files baseline when `active_wave.json` is written) — must avoid triggering an `obj/template` rebuild mid-wave (landmine).

### Candidate B2: Narrow the guard's `.claude/` exemption when a write_set declares `.claude/` paths
- **Summary**: Teach `swarm_boundary_guard.mjs` to enforce `.claude/` paths *when the active wave's write_sets contain `.claude/` entries* (exemption applies only when nothing in the wave claims that subtree).
- **Fits**: Partial — keeps enforcement at the PreToolUse boundary (real-time, not post-hoc). But it's a live-guard behavior change (constitutional: Art. VIII hook), needs a seed.md amendment, and is riskier (could block legitimate `.claude/` writes elsewhere).
- **Tradeoffs**: Real-time prevention beats post-wave detection, but higher blast radius + amendment cost. Could be a **complement** to B1 later; not the first move.

### D2 recommendation
**B1** as the primary (cheap, isolated, no amendment — it's a dispatch SOP + helper, same velocity class as `swarm_merge`). Note B2 as a possible future complement. *Flip condition*: if real-time prevention (not post-wave detection) is a hard requirement, escalate to B2 with the amendment.

---

## D4 — dispatch-side detection of incomplete worker results

### Candidate C1: Result-parser helper + resume-or-main-context routing *(recommended)*
- **Summary**: New `.mjs` helper (e.g. `parse_worker_result.mjs`) that scans a worker's final message for a parseable trailing `{task_id,status,...}` JSON line. Missing/garbled/`status:"failed"` → classify the task **incomplete** (exit non-zero with a reason). `swarm-dispatch` Step 6 calls it on every worker return; on incomplete it routes to resume-if-possible (SendMessage) else main-context completion — never silently passes.
- **Fits**: Yes — the worker template already mandates the JSON line (D3/D6 shipped); this is the dispatch-side enforcement of that contract (scout: the gap is dispatch never verifies it). Single-file `.mjs`, matches helper idiom.
- **Tests it enables**: unit tests — a result with no JSON line → incomplete; a result with `status:"done"` + valid shape → complete; a result with trailing prose after the JSON / malformed JSON → incomplete.
- **Tradeoffs**: SendMessage-resume availability is environment-dependent (the `-424f` run lacked it); the helper only *classifies*, the SOP decides resume-vs-main-context. Keep the helper pure (parse + classify); routing stays in the SOP.

### Candidate C2: Inline regex in the SKILL.md SOP (no helper)
- **Summary**: Just instruct the dispatcher to eyeball the JSON line.
- **Tradeoffs**: Not mechanical, not unit-testable, regresses the moment a run is busy. Rejected — AC3/AC6 require a unit-tested safeguard.

### D4 recommendation
**C1.** Mechanical, testable, leans on the already-shipped worker contract.

---

## D5 — worker-safe vs needs-main-context classification in swarm-plan

### Candidate D1: Required `execution` field per task + validator enforcement *(recommended)*
- **Summary**: Add a per-task field (e.g. `"execution": "worker-safe" | "needs-main-context"`) to the swarm-plan task schema. `swarm-plan` SKILL.md Step 4 classifies each task: pure + fully-specified ⇒ `worker-safe`; design-laden / touches live shipped code / depends on a not-yet-shipped API ⇒ `needs-main-context`. `validate.mjs` adds it to `REQ` and validates the enum; the surfaced plan table + gate-B show it. `swarm-dispatch` dispatches only `worker-safe` tasks to workers and keeps `needs-main-context` ones in main context.
- **Fits**: Yes — `validate.mjs` already has a `REQ` list + per-field validation (scout line 38); adding one enum field is the existing pattern. Surfaces the real split at gate-B (AC4).
- **Tests it enables**: unit tests on `validate.mjs` — a task missing `execution` fails schema; an invalid enum value fails; a design-laden task fixture classifies `needs-main-context`. (The *classification judgment* is main-context per Art. II; the validator enforces the field's presence + that the dispatcher honors it.)
- **Tradeoffs**: Adding a `REQ` field is a schema change — any existing plan fixtures need the field (greenfield here; only `tests/fixtures` + new tests). The classification heuristic is guidance for the planner (a human/main-context decision), so the *test* asserts schema + dispatch-honoring, not the LLM's judgment.

### Candidate D2: Free-text `note` convention only
- **Tradeoffs**: Not machine-checkable, gate-B can't rely on it, dispatcher can't branch on it. Rejected.

### D5 recommendation
**D1**, with the test scoped to schema-presence + enum-validity + dispatch-honors-the-field (not the LLM classification itself, which is Art. II main-context judgment).

---

## D7 — spec API-surface completeness pre-dispatch

### Candidate E1: Spec-authoring guidance + a spec-lint check *(recommended)*
- **Summary**: Add guidance to the `spec` skill/template: a spec that will be swarm-decomposed must pin the exact API surface (function signatures / data channels) each migration/consumer needs, so the decomposition is complete before dispatch. Make it checkable — extend `spec-lint` (or add a checker in the `checker-fanout` registry) to flag a swarm-bound spec whose components reference a not-yet-pinned API surface.
- **Fits**: Yes — there's an established spec-review checker pattern (`spec-lint`, `spec-diagram-review`, the `checker-fanout` registry). D7 is LOW severity; guidance + a light lint check is proportionate.
- **Tests it enables**: a spec fixture missing pinned API surface is flagged; a complete one passes. (If implemented as guidance-only + a presence check, the test asserts the check fires.)
- **Tradeoffs**: "API surface is pinned" is partly a judgment call — keep the mechanical check conservative (presence of a `## Interfaces`/`## Contracts`-style pinned section for swarm-bound specs) to avoid false positives; the deeper completeness stays a reviewer concern. Lowest priority of the five; could ship as guidance-only if the lint check proves noisy.

### Candidate E2: Documentation-only (no check)
- **Tradeoffs**: Cheapest, but AC5 asks for checkability. Acceptable fallback if the lint check is too noisy; record the decision in the spec.

### D7 recommendation
**E1**, scoped to a conservative presence-check + guidance. Fall back to E2 (guidance-only) if the check can't be made low-false-positive — the spec author decides.

---

## Recommendation (summary)

| Defect | Recommended | Mechanism | Amendment needed? |
|---|---|---|---|
| D1 | A1 — document single-wave-only + fail-fast guard | `swarm-dispatch` guard + SKILL.md doc | SKILL.md doc; guard is SOP+helper (no Art. amendment) |
| D2 | B1 — post-wave diff-audit helper | new `.mjs` + dispatch SOP step | No (velocity class of `swarm_merge`) |
| D4 | C1 — result-parser helper | new `.mjs` + dispatch SOP step | No |
| D5 | D1 — `execution` field + validator | `swarm-plan` SKILL.md + `validate.mjs` | No |
| D7 | E1 — guidance + conservative spec-lint check | `spec` skill/template + `spec-lint` | No |

None require an Article-level amendment if D1 lands as A1 (doc + mechanical guard, not a live-hook behavior change) and D2 lands as B1 (post-wave SOP audit, not a guard change). If the reviewer prefers D2-B2 (guard change) the seed.md amendment path applies. All five ship as unit-tested `.mjs` helpers / validator changes consistent with the scout's helper idiom.

## Open questions (for the human at /spec)

1. **D1 path confirmation**: research concludes the root cause is an Agent-tool constraint → recommend **A1 (document single-wave-only + fail-fast guard)**, not A2 (make-it-work). Does the reviewer accept giving up multi-wave-under-worktree (it's not baseline-controllable), or insist on attempting A2 despite the tool-owned base? *(Recommend A1.)*
2. **D2 scope**: B1 (post-wave detection, no amendment) now, with B2 (real-time guard change + amendment) deferred — or go straight to B2? *(Recommend B1 now.)*
3. **D7 depth**: conservative presence-check (E1) vs guidance-only (E2) if the check is noisy. *(Recommend E1, fall back to E2.)*
4. **D5 test boundary**: confirm the unit test asserts schema-presence + dispatch-honoring (not the LLM's classification judgment, which is Art. II main-context). *(Recommend yes.)*
