# Codebase Scout Report — work-planner-envelope

Ran in **reconcile** mode against `docs/system/` (`memory.workspace.enabled: true`).
Delta named three elements — `harness-helpers`, `phase-timer`, `timing-lib` — and
zero unreferenced. A three-element delta over a populated corpus is a real delta,
not a re-derivation.

Annotation scan (`memory.annotations.enabled: true`): zero resolved, zero dangling.
Nothing in this slice carries a tracking annotation.

## Primary touchpoints

- `.claude/hooks/lib/timing.mjs:166` — `stampFromWorkflow`, the only writer of
  timing rows. Derives every row from three `workflow.json` fields and nothing
  else: `completed[]` (→ `event: 'completed'`), `tdd_ticks[]` (→ `event: 'sub'`),
  and `attempts` via `retryLabels` (→ `event: 'retry'`). This is the whole
  instrumentation surface — a phase that never lands in one of those three arrays
  is invisible to the ledger.
- `.claude/hooks/lib/timing.mjs:194` — the `run-start` baseline row. Per-phase
  token figures are **deltas against this anchor**, so the anchor's correctness is
  load-bearing for every ratio the planner will compute.
- `.claude/hooks/lib/timing.mjs:126` — `sumTranscriptTokens` reads
  `output_tokens` / `input_tokens` / `cache_read_input_tokens` off the transcript.
  Returns `null` when the transcript is unavailable, which is what renders as `n/a`
  in a timing table rather than a zero.
- `.claude/hooks/phase_timer.mjs:38` — the PostToolUse hook that calls
  `stampFromWorkflow`. Sub-tick capture is gated on
  `artifacts.subtick_timing.enabled` (`:35`), default on.
- `.claude/skills/harness/rightsize-gate.mjs:115` — `decideSkip({measure, config,
  securityRunning})`. The post-payload seam the planner has to compose with. It
  consumes a `{files, lines, touched}` measure, never a cost.
- `.claude/skills/harness/rightsize-gate.mjs:160` — `collectMeasure`, which already
  implements diff scoping (test-glob exclusion, `rightsize_base` exclusion). The
  payload-size question the planner asks is adjacent to what this already computes.
- `.claude/skills/sprint-planner/planner.mjs:27` — `selectSprint({tasks,
  statusById, capacity})` → `{features, excluded}`. The existing proposer for
  "what work is dependency-ready", and the natural source for auto-added work.
- `.claude/skills/triage/retriage.mjs:13` — `collectOpenBacklog({memoryDir})`
  returns every `status: open` entry with `governs:` paths and context. Writes
  nothing. The other candidate source for auto-added work.

## Entry points that reach this code

- `phase_timer` (PostToolUse hook, wired in `settings.json`) — fires on tool use,
  stamps whatever `workflow.json` newly contains. Not invoked directly.
- `/archive` Step 2 — `node .claude/hooks/lib/timing.mjs render <slug>` produces
  the `timing.md` that lands in the bundle. This is the corpus the planner fits on.
- `/harness` post-`tdd-finalize` — runs `rightsize-gate.mjs check --slug <slug>`.
  The seam where the planner's a-posteriori checkpoint belongs.
- `/triage` — where the a-priori estimate belongs.

## Existing tests

- `tests/phase-timer-timing.test.mjs` — stamping behaviour, row shapes. Passing.
- `tests/phase-timer-bash-trigger.test.mjs` — the Bash-leg trigger path. Passing.
- `tests/rightsize-gate.test.mjs` — `decideSkip` / measure / baseline. Passing.
- `tests/timing-slug-guard.test.mjs` — CWE-22 slug rejection on the timing path.
  Passing. Any new helper taking a slug inherits this obligation.

No test anywhere asserts that a payload phase actually stamps a non-zero token
count, which is why the gap below went unnoticed.

## Constraints and co-changes

- `artifacts.subtick_timing.enabled` gates sub-row capture; the planner must not
  depend on sub-rows being present.
- `velocity.rightsize.enabled` gates the seam the a-posteriori checkpoint shares.
- `.claude/state/timing/<slug>.jsonl` is the live ledger; `timing.md` in the bundle
  is its render. Fitting the envelope reads the rendered tables.
- Any new slug-taking helper must call the same `assertSafeSlug` guard the timing
  and plan paths already use — REJECT, never normalise.

## Patterns in use here

Helpers are pure exported functions with a thin `main()` behind an
`import.meta.url` guard (Pattern B), fail-open on config absence, and return
structured objects rather than throwing. `rightsize-gate.mjs` is the closest
model for the planner: it separates `collectMeasure` (IO) from `decideSkip`
(pure decision) from `configFromProject` (config resolution), and its
`failOpenDecision()` is the shape a disabled or un-fitted planner should return.

## Risks / landmines

- **The intake's instrumentation figures are wrong, and the corrected numbers
  strengthen the case rather than weaken it.** The approved intake states "45 of
  117 archived bundles stamp no payload phase at all" and "69 of 117 (59%)"
  instrument both sides. Re-measured precisely: only **13** bundles lack a payload
  row (mostly `chore`, a track with no payload phase by design — legitimate, not a
  hole), 6 carry `n/a` tokens from an unavailable transcript, 3 predate the token
  columns entirely, and **94** carry a real payload token count. **92** bundles
  measure both sides. The earlier figures came from a probe whose regex required
  four numeric columns and silently dropped every row containing `n/a`.
- **The corrected baseline is 1.30x, not 1.60x** (92 bundles): p25 0.77x, median
  1.30x, p75 2.90x, p90 4.52x. 23% clear 3x; 13% clear 4x.
- **The envelope problem is concentrated, not uniform.** Per-track medians:
  `epic-child` 4.05x, `tdd-quickfix` 3.05x, `power` 1.02x, `spec-entry` 0.96x,
  `intake-full` 0.66x. The two heavy-discovery tracks are where the envelope
  dominates — and `power`, the track that exists to amortize, sits at 1.02x, which
  suggests it is not being used at the batch sizes it was built for.
- **`attempts` remains genuinely unrecorded** — zero bundles, confirmed. That hole
  is real and unchanged by the correction above.
- `chore`-track bundles have no payload phase by design. The planner must treat a
  payload-less track as out of scope rather than as a 0x ratio, or every chore
  will report an infinite envelope share.
