# Pattern Research — per-phase wall-clock timing instrumentation

**context7: N/A.** This is a baseline-internal tooling change. The solution space touches only Node stdlib (`node:fs`, `Date`) and existing `.claude/` state/hook/skill infrastructure. There is no third-party library API to verify. (Per the skill mandate, this is the explicit "no library to cite" note, not a skipped step.)

The crux, from scout: phase boundaries are observable three ways today — the **model-driven harness log** (timestamped but free-form, `/harness`-only), **`workflow.json → completed[]` growth** (deterministic, harness-independent, but no timestamps), and **consent-token mtimes** (deterministic timestamp for when human consent landed). The design question is which signal to build on, and that answer also resolves the intake open question (manual-run coverage).

The clean model-vs-human split (AC-002/AC-003) falls out of one observation: a consent-token mtime is the pivot between a gate's human-wait and the next phase's model-time. For the gate before phase P:
- `human_wait_at_gate = token_mtime − previous_phase_completed_ts`
- `model_time(P) = P_completed_ts − token_mtime`  (P starts when consent lands, not when the prior phase ended)

Every candidate below produces the same table; they differ in **where the per-phase timestamps come from** and therefore in determinism, coverage, and governance cost.

---

## Candidate A: Structured timing log, appended by the model at harness boundaries

- **Summary**: Keep the existing harness boundary-logging behavior, but additionally append a **structured** JSON-lines record (`{phase, event, ts}`) to `.claude/state/timing/<slug>.jsonl` at each `entered`/`completed`/`yielded`/`resumed` point. `/archive` reads the JSONL and renders the table; human-wait = `resumed.ts − yielded.ts`.
- **API references (current)**: none external. `node:fs` append; `date -u +%FT%TZ` already used by the harness log.
- **Fits**: Yes — directly extends the harness's existing per-iteration logging (scout: `harness/<slug>.log` already stamps these exact events). Smallest new surface; **no new hook**, so no governance count bump.
- **Tests it enables**: Unit-test the JSONL parser + table renderer against a fixture file. Cannot test "the model remembered to append" — that remains harness-prose discipline.
- **Tradeoffs**: **Not oracle-bound.** The record is written by the model following SKILL.md prose; a missed/misordered append silently corrupts the table. This is exactly the failure mode the maker-checker proof-obligation direction (backlog `-d186`/`-4c43`) warns against. **Coverage = `/harness` runs only**; manually-invoked phases produce nothing. Reversibility: high (delete the log + render step).

## Candidate B: Deterministic PostToolUse timer hook + consent-token mtimes  *(recommended)*

- **Summary**: A new `phase_timer.mjs` PostToolUse hook on `Write|Edit|MultiEdit` (the matcher `lint_runner`/`test_runner` already use). On each fire it cheaply no-ops unless the edited path is `.claude/state/workflow.json`; when it is, it diffs `completed[]` against the prior snapshot and, for each newly-appended phase, stamps `{phase, event:"completed", ts}` into `.claude/state/timing/<slug>.jsonl`. Human-wait is derived at render time from consent-token mtimes (`spec_approvals/<slug>.approval`, `commit_consent`). `/archive` renders the table.
- **API references (current)**: none external. `node:fs` (`statSync().mtimeMs` for token pivots), `Date.now()`; the scout confirms hooks read the clock freely (`git_commit_guard`, `setup_guard`, `consent_gate_grant` all do).
- **Fits**: Yes, and best aligned with the repo's direction. Deterministic = **oracle-bound** (the proof-obligation contract the velocity push itself is connected to). Fires on *any* path that appends to `completed[]`, so it covers **both `/harness` and manual phase runs** — this resolves the intake open question in favor of full coverage at no extra cost. Consistent with the existing PostToolUse `lint_runner`/`test_runner` pattern.
- **Tests it enables**: Fully black-box unit-testable (the repo's `tests/*.test.mjs` style): feed synthetic workflow.json edit payloads → assert JSONL growth and idempotency (re-firing on an unchanged `completed[]` is a no-op); feed fixture token mtimes → assert the human-wait/model-time split. No internal mocks needed.
- **Tradeoffs**: **A 25th hook is a real governance cost** — count bumps and prose rows across CLAUDE.md Article VIII, README, `docs/init/seed.md`, the docs-site `hooks.njk` tables, plus a `manifest.json` entry; `audit-baseline` and the docs-drift guardrail (backlog `-9f31`) enforce these. The hook needs a tiny "last-seen `completed[]`" snapshot to detect growth (store it in the timing JSONL itself, or a sidecar). PostToolUse fires on every edit in the repo, so the no-op path must be cheap (one path compare). Reversibility: medium (removing a hook means re-bumping the governance mirrors).

## Candidate C: Hybrid — deterministic stamp helper at the completed-append site, no new hook

- **Summary**: Ship a small deterministic helper `timing.mjs` (`stampCompleted(slug, phase)` / `renderTable(slug)`). Each phase skill calls `stampCompleted` at the same step where it already appends to `completed[]`; the harness calls it at boundaries; `/archive` calls `renderTable`. Human-wait from consent-token mtimes as in B. No new hook.
- **API references (current)**: none external. `node:fs`, `Date.now()`.
- **Fits**: Partly. The helper is deterministic (oracle-like), and it avoids the 25th-hook governance cost. But coverage now depends on the helper being **wired into ~14 skill prose sites** (scout counted the `completed[]`-append sites); a phase whose prose forgets the call is silently uninstrumented — re-introducing the model-discipline fragility of A at each call site, just more diffuse. Manual runs are covered only for phases whose skill carries the call.
- **Tests it enables**: Unit-test the helper directly (stamp → render). Per-site wiring is verified only by integration, not unit tests.
- **Tradeoffs**: Middle ground that inherits the worst of both on coverage-assurance: deterministic *helper*, but non-deterministic *invocation*. More files touched than A or B. Reversibility: medium-high.

---

## Recommendation

**Candidate B**, the deterministic PostToolUse timer hook. Three reasons: (1) it is **oracle-bound** — the timestamp is stamped by infrastructure that fires whether or not the model "remembers," which is the same determinism principle the broader velocity/maker-checker effort is built on; (2) it **covers manual runs for free**, cleanly resolving the intake open question (full coverage) rather than punting it; (3) it is the **most unit-testable** of the three, fitting the repo's black-box `tests/*.test.mjs` convention with no internal mocks. The consent-token-mtime pivot gives an exact, deterministic model-vs-human split.

**What would flip the decision:**
- **To Candidate A** — if the maintainer judges a **25th hook's governance overhead** (Article VIII row, four-way count mirrors, docs-site tables, manifest, audit-baseline) too heavy for an internal measurement tool, *and* accepts harness-only coverage. A is materially less work and touches no governance mirrors. Given the feature's own goal is to *reduce* overhead, this trade is legitimately on the table.
- **To Candidate C** — if the maintainer wants determinism **without** a new hook and is willing to wire ~14 call sites once. Reasonable only if the hook-count is a hard "no."

The deciding axis is governance-cost tolerance, which is a maintainer call — hence the open questions below.

## Open questions

1. **Hook-count tolerance (the load-bearing decision).** Is adding a 25th hook acceptable for an internal measurement tool, given the count/prose mirror cost? Yes → Candidate B (full coverage, oracle-bound). No → Candidate A (harness-only, lean) or C (helper, no hook).
2. **Manual-run coverage — confirm.** Intake flagged this as open. B answers "yes, covered" automatically; A answers "no, `/harness` only." Is harness-only coverage acceptable? (In practice nearly all real runs go through `/harness`, so A's gap may be tolerable.)
3. **Timing store format & location.** Proposed `.claude/state/timing/<slug>.jsonl` (JSON-lines, append-only, Tier-2 state). Confirm JSONL vs a single JSON object, and whether it is archived into the bundle (alongside the rendered `timing.md`) or left in `.claude/state/` (gitignored, transient like `harness/<slug>.log`).
4. **Render target shape.** A generated `timing.md` added to the archive bundle (new step in archive `SKILL.md` Step 2; archive.sh is move-only so render is a separate helper call) — confirm a standalone `timing.md` vs. appending the table into an existing bundle file.
5. **Out of scope to confirm**: cross-run aggregation (intake left it deliberately un-excluded, but this round is single-run). The JSONL-per-slug shape keeps the door open without building it.
