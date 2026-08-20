# Pattern Research — work-planner-envelope

**context7: N/A.** This is a baseline-internal tooling change. The solution space
touches Node stdlib (`node:fs`) and existing `.claude/` state, hooks and skills
only. The single runtime dependency (`@clack/prompts@1.4.0`) is CLI presentation
and is not involved. No external API is asserted below, so nothing here rests on
training recall. Same posture as the archived timing research, which recorded
`context7: N/A` for the same reason.

## Prior art (retrieved)

Structural lane returned **zero** hits — none of the four touched elements carries
a `source_spec:`, so no archived spec claims authorship of them. `structuralUnresolved`
was empty, so this is a genuine absence rather than a dangling pointer. Term lane
scanned 237 sources and returned 228 hits; four are real upstreams.

- `docs/archive/2026-06-20/phase-timing-instrumentation/{research,spec}.md`
  (via: terms) — **authored the ledger this feature reads.** Its Candidate B, the
  deterministic `phase_timer` PostToolUse hook, was chosen over a model-appended
  log specifically because a model-written record "is written by the model
  following SKILL.md prose; a missed/misordered append silently corrupts the
  table." **That prediction is exactly what the `attempts` hole is**: the one field
  the harness writes by prose rather than by hook is the one field that has never
  been recorded once in 117 bundles. Already answered upstream: the row shape, the
  token-delta-against-baseline model, the model-vs-human-wait split. Not answered:
  anything about cost ratios.
- `docs/archive/2026-06-21/rightsize-triage-drift-skip/spec.md` (via: terms) —
  authored `rightsize-gate`, the seam AC-009 must compose with. Establishes the
  additive-only, fail-open, never-skip-`security` contract this feature inherits.
- `docs/archive/2026-07-16/velocity-lever-ranking/research.md` (via: terms) — ranked
  the velocity levers and concluded: "the cheap, high-leverage levers are spent.
  The dominant cost is reasoning." **This feature is the delta that ranking did not
  consider**: every lever it weighed cut the cost *of a phase*; this one changes how
  much work each envelope *carries*. Its open question 3 — whether to re-derive from
  the `timing.md` bundles — is the corpus fit AC-001 now requires.
- `docs/archive/2026-07-10/power-track-completion/spec.md` (via: terms) — authored
  the `power` track, the existing amortization mechanism. Scout measured `power` at
  a 1.02x median, so the mechanism exists and is not being used at the batch sizes
  it was built for. Relevant to where the checkpoints fire, not to how the envelope
  is computed.

**The delta this memo derives**: how the envelope is fitted, how payload is
estimated *before* it exists, and where the auto-add proposal sources its work.
Everything else above is inherited.

## Candidate A: Measured-only, no forward estimate

- **Summary**: Fit the envelope per track from the archived corpus. Measure payload
  after the payload phase completes. One checkpoint, at the post-payload seam.
- **API references (current)**: none external. `node:fs` reads of
  `docs/archive/*/*/timing.md`; existing `rightsize-gate` measure plumbing.
- **Fits**: Yes — mirrors `rightsize-gate` exactly, which also measures only after
  the fact and decides at the same seam.
- **Tests it enables**: Pure-function tests over fixture corpora for the fit, and
  over `{envelope, payload}` pairs for the verdict. No mocks needed; the corpus is
  real files in a temp dir.
- **Tradeoffs**: Satisfies AC-003 through AC-006 and AC-009 through AC-013, but
  **not the a-priori half** the intake describes. Telling an operator to add work
  after the payload is done is late — the batching decision they actually needed was
  at triage. It also cannot warn before an expensive discovery phase runs, which is
  where the worst ratios are (`intake-full` at 0.66x).

## Candidate B: Corpus-fitted envelope + structural forward estimate  *(recommended)*

- **Summary**: As A, plus an a-priori payload estimate at triage derived from
  structure the request already exposes — spec AC count, `write_surface` glob count,
  C4 component count. Two checkpoints: an estimate at triage, a measurement at the
  post-payload seam.
- **API references (current)**: none external.
- **Fits**: Yes. The inputs already exist and are already parsed elsewhere: the
  component count is what `harness/SKILL.md` greps to decide swarm-vs-solo, and
  `write_surface` is written by `/triage` today.
- **Tests it enables**: The estimator is a pure function from a structure descriptor
  to a predicted payload, so it can be back-tested against the 92 archived bundles
  that measure both sides — predicted vs actual, scored on error. That is a real
  oracle, not a fixture assertion.
- **Tradeoffs**: The estimator will be wrong early and there is no way to make it
  right without history. It must therefore report its own confidence, and the
  triage checkpoint must be advisory even by the standards of an advisory floor.
  Two checkpoints also mean two places to keep consistent.

## Candidate C: Corpus-fitted envelope + nearest-neighbour forward estimate

- **Summary**: As B, but the forward estimate comes from the *k* most similar
  archived workflows (same track, comparable write-surface size) rather than a
  formula over structural features.
- **API references (current)**: none external.
- **Fits**: Partially. Nothing in the repo does similarity retrieval over the
  archive today; `research/retrieve.mjs` does term overlap, which is a different
  question and would be a poor proxy for work size.
- **Tests it enables**: Same back-test as B, and directly comparable on the same
  92 bundles.
- **Tradeoffs**: Needs a populated local corpus to say anything at all, so it is
  strictly worse than B at cold start — which the intake names as a hard constraint.
  Better than B once history accumulates. Not either/or: C is B's refinement, and
  the estimator interface can be identical.

## The auto-add source (AC-010): a sub-decision, not a candidate axis

Two existing collectors can supply proposable work, and they answer different
questions:

- `sprint-planner`'s `selectSprint({tasks, statusById, capacity})` returns
  `{features, excluded}` and already understands **dependency readiness** — it will
  not propose work whose prerequisites are unmet. It expects decomposed tasks.
- `retriage.mjs`'s `collectOpenBacklog({memoryDir})` returns every `status: open`
  backlog entry with `governs:` paths. Broader, writes nothing, but knows nothing
  about ordering or readiness.

`selectSprint` is the better fit for AC-010 because proposing unready work would
produce a batch that cannot be executed. `collectOpenBacklog` is the right source
for the *candidate pool* it selects from. Using both in that arrangement reuses
what exists and adds no third collector.

## Recommendation

**Candidate B**, with C's nearest-neighbour left as a later refinement behind the
same estimator interface.

B is the only candidate that satisfies both checkpoints the intake describes while
still working on a fresh install. A is cheaper but delivers the warning after the
moment it could have been acted on. C is better than B eventually and worse than B
at the point every new operator starts.

**What would flip the decision:**

- **To A** — if the engineer judges the forward estimate not worth its error rate,
  and would rather ship a measurement that is always right than a prediction that is
  often wrong. Defensible: A alone still moves the median, because AC-010's auto-add
  fires at the post-payload seam regardless.
- **To C** — if the back-test on the 92 bundles shows the structural estimator's
  error is worse than nearest-neighbour even at small *k*. That test is cheap and
  should be run before the spec commits to B's formula.

## Open questions

1. **Fit the envelope from rendered `timing.md` or from the live
   `.claude/state/timing/<slug>.jsonl`?** The rendered tables are what survives into
   the archive and are what scout measured, but they are a lossy projection — `n/a`
   token columns are indistinguishable from zero in the table and distinguishable in
   the JSONL. The JSONL does not survive archival today.
2. **What is the minimum corpus size before the local fit replaces the shipped
   default?** Recorded at intake as a spec-level choice. Scout's per-track counts
   (`spec-entry` 32, `tdd-quickfix` 22, `epic-child` 14, `intake-full` 12,
   `power` 11) bound what is achievable per track on this repo, and an operator's
   repo will start at zero.
3. **Should the envelope be fitted per track or globally?** Scout measured medians
   from 0.66x to 4.05x across tracks, so a single global envelope would misprice
   most tracks. Per-track is implied but not stated in the ACs.
4. **Does `attempts` repair belong in this workflow or ahead of it?** AC-007 and
   AC-008 require it, and the envelope cannot include re-spec cost without it. It
   is also the smallest independent piece and the one with the clearest test.
