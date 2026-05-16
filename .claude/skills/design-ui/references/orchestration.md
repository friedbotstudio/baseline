# Orchestration — Stage 3 gates and loop logic

Stage 3 of `design-ui` runs the impeccable recipe step-by-step in main context. This file documents the gates that decide when to continue, when to loop, when to surface to the user, and when to block.

## The orchestration loop, top level

```
for each step in recipe:
  pre-checkpoint   -> .claude/state/design/<slug>.json {step_index, next_cmd}
  invoke           -> Skill(impeccable, "<cmd>", "<args>")
  capture          -> read impeccable's structured result
  branch           -> see gates below
  post-checkpoint  -> .claude/state/design/<slug>.json {step_index++, invocations[]}
```

The state file is written *before* and *after* each step so a mid-step interruption (session end, context compact, user abort) is recoverable on next invocation per `state-machine.md`.

## Gates within the orchestration

### Gate 1 — P0 blocks

If the previous step was `audit` (or `critique`) and its return value reports `P0 ≥ 1`:

- Do **not** auto-chain to `polish`.
- Surface the P0 list to the caller (or the user, on direct invocation).
- Persist `state: "blocked"` to the state file.
- Return `{ final_state: "blocked", reason: "P0 issues require user direction", audit_report_path }`.

P0 issues are by definition blockers: accessibility failures (focus traps, missing labels, color contrast < 3:1), broken core functionality, semantic-HTML violations. Looping `polish` on a P0 risks compounding the issue; the user must direct the fix.

### Gate 2 — P1 looping with cap 3

If the previous step was `audit` and reports `P1 ≥ 1` and `P0 == 0`:

- Run `polish` against the audit report.
- Re-run `audit` to measure progress.
- Repeat up to **3 iterations** (audit → polish → audit → polish → audit → polish → audit, where the final audit is the verification).
- After iteration 3's verification audit, if P1 is still > 0:
  - Terminate with `state: "needs_human"`.
  - Persist `.claude/state/design/<slug>.json` with the audit history.
  - Materialize `docs/design/<slug>.audit.md` (human-readable report).
  - Emit a memory candidate via `memory_stop` so `_pending.md` carries the issue forward.
  - Return `{ final_state: "needs_human", iterations: 3, audit_report_path, state_file }`.
- After iteration 3, **no fourth polish runs**. The cap is hard. The user can re-invoke design-ui (resume from state) or invoke `/impeccable polish` directly for one-off iteration.

The 3-iteration cap is a discipline: if three rounds of `polish` cannot clear P1, the issue likely needs a design call (a register change, a deliberate exception per CLAUDE.md Article X) or human judgement on tradeoffs. Continuing to loop would burn iteration budget without convergence.

### Gate 3 — Recipe mode (auto vs ask)

After Stage 2 (translate) returns a recipe, Stage 3 reads the recipe's `mode`:

- **auto**: execute without prompting. Used for single-step recipes (`shape`, `live`, `extract`) and for atomic recipes (`audit → polish → audit` treated as one unit, mode-stamped `auto` by the intent-table).
- **ask**: surface the plan, await user `proceed`. The prompt format:
  > "Recipe: `[shape, craft, audit]`. Proceed? (or describe an override)"
  
  On `proceed` (or any non-negative response), continue. On override, re-invoke Stage 2 with the user's adjusted intent. On refusal, persist `state: "blocked"` and return `{ final_state: "blocked", reason: "user declined recipe" }`.

### Gate 4 — Target-file existence

Before invoking any impeccable subcommand that writes (`craft`, `polish`, refines, enhances, fixes), Stage 3 verifies each `target_files` path's *parent directory* exists. If a parent is missing:

- Persist `state: "blocked"`.
- Return `{ final_state: "blocked", reason: "target_files parent directory missing: <path>", state_file }`.

This prevents impeccable from generating code with no home. design-ui never creates parent directories itself — that would be a write outside the thin-glue contract.

For surface-less intents (`extract`, `live`, `shape`-only) this gate is skipped: `target_files` may be empty or `—` per the schema, and the impeccable subcommand handles its own output destination.

### Gate 5 — Register conflict

If `task_brief.register_override` is set and conflicts with `PRODUCT.md`'s declared register (e.g., override is `brand` but PRODUCT.md says `product`), Stage 3 surfaces:

> "Register mismatch: task_brief requests `brand`, PRODUCT.md declares `product`. Proceed with override, or align?"

On `proceed`, run the recipe with the override. On `align`, re-invoke Stage 2 with the PRODUCT.md register. On refusal, block.

This gate is intentionally a soft yield — register overrides are legitimate (a product app's marketing splash page wants `brand` register), but they should be intentional.

## Iteration accounting

The state file records every invocation:

```jsonc
{
  "invocations": [
    { "cmd": "audit",  "iteration": 1, "started_at": "...", "completed_at": "...", "p0": 0, "p1": 3 },
    { "cmd": "polish", "iteration": 1, "started_at": "...", "completed_at": "...", "files_written": [...] },
    { "cmd": "audit",  "iteration": 2, "started_at": "...", "completed_at": "...", "p0": 0, "p1": 2 },
    { "cmd": "polish", "iteration": 2, "started_at": "...", "completed_at": "...", "files_written": [...] },
    { "cmd": "audit",  "iteration": 3, "started_at": "...", "completed_at": "...", "p0": 0, "p1": 1 }
  ]
}
```

The `iteration` counter increments inside a polish-atom loop (1, 2, 3). It is independent of `step_index` (which tracks position in the recipe). For non-loop recipes, `iteration` is 1 throughout.

## Critique scoring loop (optional, recipe-driven)

Some recipes (`bolder`, `quieter`, `distill`) pair with `critique` as the verification step. The same cap-3 rule applies, but the threshold is `critique` score:

- If `critique` returns score < 14/20 after the refine step, loop with the same refine command (up to 2 additional iterations beyond the first).
- If score still < 14/20 after 3 total iterations, terminate with `needs_human`.

This is the same cap-3 shape as the polish loop, with `critique` as the gating signal instead of `audit`.

## What the orchestrator never does

- **Does not pick aesthetic direction.** Stage 2's recipe choice and Stage 3's gates are about *flow*, not *style*. Every style decision flows through `impeccable`.
- **Does not write product code directly.** Thin glue only — state JSON, brief snapshots, audit snapshots under `docs/design/`. Product code is `impeccable`'s territory exclusively.
- **Does not retry after `needs_human`.** Once the cap fires, the caller (or user) decides. design-ui's resume reads the state file and continues *only* if a user action has materially changed the inputs (e.g., the audit report has been addressed manually, the state has been moved to `in_progress` explicitly).
- **Does not silently skip gates.** Every gate has an explicit branch with a recorded reason. Skipping is failure; surface always.
- **Does not invoke more than one impeccable subcommand at a time.** Sequential only. The `∥` notation in the intent table for `critique ∥ audit` is shorthand for "call both, collect results, neither blocks the other" — but they remain two sequential `Skill(impeccable, …)` calls in main context.

## Caller policy at `final_state`

| State returned to caller | Caller policy (for `/tdd` Step 6 specifically) |
|---|---|
| `complete` | Mark the design call done; proceed to next call in design_calls; after all complete, re-invoke `verify`. |
| `needs_human` | Warn and continue. design-ui has surfaced; the user can re-invoke later. /tdd Step 6 does NOT fail. The audit report path goes in /tdd's notes. |
| `blocked` | Stop /tdd Step 6. Surface the blocker to the user. /tdd's `## 7. Decide on the result` step receives this and decides whether to escalate to a spec change. |
| `not_a_design_task` | Stage 0 misroute. /tdd surfaces "design-ui returned not_a_design_task — was this design_call mis-classified in the spec?" and stops to reconcile. |
| `mixed_brief` | Stage 0 multi-lane misroute. Read `lane_split`. For each row: lane=design → re-invoke design-ui with a surface-scoped sub-brief; lane=development → record on `next_actions` and surface to the user; lane=copy → record on `next_actions` and surface to the user. Do NOT auto-invoke `/tdd` or `prose` in this tick — the spec author can split the `## Design calls` row deliberately. /tdd Step 6 surfaces a one-line summary and proceeds. |
