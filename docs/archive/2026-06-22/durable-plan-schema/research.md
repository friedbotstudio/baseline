# Pattern Research — durable-plan-schema (-424f)

Four decision axes from the intake/scout. The repo norm (per scout: hand-rolled pure `.mjs`
validators, resilient readers, no-LLM in mechanical paths, near-zero runtime deps — only
`@clack/prompts`; `structuredClone` available; ESM, Node ≥18.17) frames every recommendation.
No external library API is asserted below — the recommendations use Node built-ins only; where a
library *would* be required, that is called out as a context7-gated branch not taken.

---

## Axis 1 — Schema validation

### Candidate A1: Hand-rolled pure `.mjs` validator
- **Summary**: A `validate(plan) → {ok, errors[]}` module mirroring `swarm-plan/validate.mjs` —
  required-field/array/non-empty checks, pure, throws nothing.
- **API references (current)**: none — Node built-ins only.
- **Fits**: Yes — scout names `swarm-plan/validate.mjs:1-211` as the direct precedent; matches the
  "hand-rolled validator returning `{ok,errors}`, resilient reader" repo norm.
- **Tests it enables**: malformed-rejected / well-formed-accepted unit tests (node:test), exactly
  the swarm-plan/tier-dial test shape.
- **Tradeoffs**: validation logic is code, not declarative — drift between schema doc and validator
  is possible (mitigated by Candidate A2 as a companion).

### Candidate A2: Declarative `.claude/schemas/plan.v1.json` (JSON-Schema)
- **Summary**: A Draft 2020-12 schema file like `workflow-track.v1.json`, enforced at runtime.
- **API references (current)**: declarative JSON-Schema **runtime** enforcement needs a validator
  (e.g. `ajv`) — a NEW dependency; would require context7 verification before use. Node ships no
  built-in JSON-Schema validator.
- **Fits**: Partially — note that `workflow-track.v1.json` is **documentation/contract**; its
  actual runtime enforcement is hand-rolled in `workflows-validator.js`, NOT ajv. So the repo's
  real pattern is "declarative file as contract + hand-rolled runtime check."
- **Tradeoffs**: pure-declarative runtime = new dep (against the zero-dep norm). As a contract doc
  only, it's free but redundant with A1's checks.

**Axis-1 recommendation**: **A1 + ship `plan.v1.json` as a contract doc** (mirroring how
`workflow-track.v1.json` coexists with the hand-rolled validator). Zero-dep runtime, declarative
human-readable contract, no ajv. Flip condition: if the schema grows complex enough that a
hand-rolled validator becomes unmaintainable — not the case for a goal+tasklist+versions object.

---

## Axis 2 — Version/diff history (the net-new surface)

### Candidate B1: Append-only full-version snapshots
- **Summary**: `versions: [{v, ts, author, reason, plan: <full snapshot>}]`; current state = last
  snapshot. Mirrors `evidence-ledger`'s append-only `round_trips[]` (never mutate a prior entry).
- **Fits**: Yes — append-only is the established primitive (`evidence-ledger.mjs`); `structuredClone`
  makes snapshotting a one-liner. AC-2 ("prior version still retrievable") is satisfied trivially —
  it's literally stored.
- **Tests it enables**: version-count-increments-on-replan, prior-version-byte-retrievable,
  no-in-place-mutation.
- **Tradeoffs**: unchanged data is duplicated across versions → file grows with replan count. BUT:
  history is **orchestrator-only** (workers read per-node frames, never history — Axis-relevant to
  η), plans are small, and replan counts are bounded by `-4c43`'s ceiling. Token growth lands on
  the non-worker-read side, so η is unaffected.

### Candidate B2: Stored JSON-Patch diffs (RFC 6902)
- **Summary**: `versions: [{v, ts, patch: [...]}]`; reconstruct any version by replaying patches.
- **API references (current)**: hand-rolling RFC-6902 apply is non-trivial; a lib (`rfc6902` /
  `fast-json-patch`) is the realistic path — NEW dep, context7-gated. Not taken.
- **Fits**: No — introduces a dependency and a fragile patch-chain (one bad patch corrupts
  reconstruction). Directly hits `token-efficiency.md`'s own **alias-drift caveat**: over-compressed
  state loses the redundancy that acts as error correction.
- **Tradeoffs**: token-minimal storage, but reconstruction complexity + corruption risk + a dep.
  The storage win lands on orchestrator-only data that doesn't affect η anyway.

### Candidate B3: Snapshots + on-demand computed diff (hybrid)
- **Summary**: Store full snapshots (B1) for durability; compute a human-readable diff between two
  consecutive versions **on demand** via a pure differ function (no stored patch).
- **Fits**: Yes — keeps B1's trivial retrievability and append-only durability while delivering the
  "replan = **visible** diff" auditability requirement (vision §2.1) as a derived view. The differ is
  a small pure `.mjs` function (recursive key-compare), zero-dep.
- **Tradeoffs**: differ is extra code, but it's pure and independently testable; no chain fragility.

**Axis-2 recommendation**: **B3** (append-only full snapshots + on-demand pure differ for the diff
view). Satisfies AC-2 trivially, delivers visible-diff auditability, zero new dependency, no
patch-chain fragility. Flip condition: if profiling ever shows snapshot duplication dominates a real
cost axis — unlikely, since history is orchestrator-only and not worker-read (η is a frame-read
metric, Axis 3).

---

## Axis 3 — Per-node frame read (the η lever) + the -424f/-4c43 seam

### The frame read
- **Summary**: a `readFrame(plan, nodeId) → {goal, assignment, deps_results}` helper returning ONLY
  that node's assignment frame (+ the minimal upstream results it needs), never the full plan or its
  version history.
- **Fits**: Yes — this IS the η = I(plan; correct future actions)/plan-tokens lever (vision §2.3,
  token-efficiency.md "minimal belief state"). AC-4 (`frame-bytes < full-bytes`) tests it directly.
- **Tradeoffs**: requires the spec to pin what's in a frame vs what's cross-cutting (orchestrator-only).

### The seam (load-bearing — the intake's open question)
- **Summary**: `-424f` owns two **pure, mechanical primitives**: `recordRevision(plan, nextPlan,
  {author, reason}) → plan'` (appends a version, never mutates in place) and `applyReplan(plan,
  change) → plan'` (validates `change`, applies it, calls `recordRevision`). Neither DECIDES to
  replan. `-4c43` owns the policy that *produces* `change` and *calls* `applyReplan` (oscillation
  detection, dry-round stop, ceiling-below-floor yield, arbitration).
- **Fits**: Yes — a clean function boundary: `-424f` = "record any replan I'm told to make,
  auditably"; `-4c43` = "decide when/whether." Honors the non-goal split in the intake.
- **Tradeoffs**: the "replanner" (intake scope B) is therefore the MECHANISM (`applyReplan`), not a
  decider — must be stated explicitly in the spec so it isn't built to decide.

**Axis-3 recommendation**: ship `readFrame` + `recordRevision` + `applyReplan` as pure primitives;
state in the spec that the decide-to-replan policy is out of scope (`-4c43`). This is the seam to
confirm at gate A.

---

## Axis 4 — Consumer migration (evidence-ledger, checker-fanout)

### Candidate D1: Adapter preserving signatures + embedding data in the plan
- **Summary**: Keep `appendRoundTrip`/`readLedger` and `runCheckerFanout`/`persistVerdict` public
  signatures; re-point their bodies to read/write **through the plan object** (round-trips and
  verdicts become per-node results on the plan). The old on-disk files (`<slug>/ledger.json`,
  `checker-fanout/<slug>.json`) become adapter-written **projections** for back-compat.
- **Fits**: Yes — "migrate them now" (user's elected scope) means data physically lives in the plan,
  but preserving signatures keeps `graduation-gate.mjs` and the live fan-out gate working unchanged.
  Existing tests (evidence-ledger, checker-fanout, graduation-gate) stay green; a payload round-trip
  test fences the cutover.
- **Tests it enables**: round-trip current payloads through the plan object; existing-suite-green
  regression; projection-file-still-written back-compat.
- **Tradeoffs**: writes data twice (plan + projection) during a transition; projection lifetime is an
  open question (deprecate later vs keep).

### Candidate D2: Rewrite call sites, delete old modules
- **Summary**: change `graduation-gate` + harness to call plan APIs directly; remove the old files.
- **Fits**: No — breaks in-flight workflow state and the live Lever-1 gate; largest blast radius;
  violates the intake's regression-fence constraint.
- **Tradeoffs**: cleaner end state, but unacceptable transition risk for live shipped code.

**Axis-4 recommendation**: **D1** (adapter preserving signatures + paths; data embedded in the plan;
old files become projections). Flip condition: if the spec decides projections aren't worth the
double-write, fall to "plan canonical + graduation-gate reads plan directly" — but that couples more
shipped code in one workflow.

---

## Recommendation (summary)

| Axis | Pick | One-line why |
|---|---|---|
| Schema | A1 hand-rolled `.mjs` + `plan.v1.json` contract doc | repo norm, zero-dep, declarative contract free |
| History | B3 append-only snapshots + on-demand pure differ | trivial retrievability + visible diff, no patch-chain/dep |
| Frame + seam | `readFrame`/`recordRevision`/`applyReplan` pure primitives | η lever + clean -424f/-4c43 boundary |
| Migration | D1 adapter (signatures+paths preserved, data in plan) | "migrate now" with smallest blast radius |

All four are zero-new-dependency and hand-rolled-pure — consistent with the baseline norm. Nothing
here requires context7 (no third-party API asserted); the B2 patch-lib branch was evaluated and
rejected specifically to stay zero-dep.

## Open questions (for /spec + gate A)

1. **The seam, exactly** — confirm `applyReplan`/`recordRevision` signatures and that the
   decide-to-replan policy is explicitly `-4c43`, not built here. (Gate A.)
2. **Live-wiring (E) → Article IV / seed §5?** If the plan becomes a *mandatory* post-approval
   artifact, that is a workflow-ordering change. Decide whether this workflow amends the constitution
   or wires the plan as additive/optional first. (Likely needs the amendment — flag for gate A.)
3. **Projection-file lifetime (D1)** — keep `<slug>/ledger.json` + `checker-fanout/<slug>.json` as
   back-compat projections indefinitely, or deprecate after cutover? Determines whether
   `graduation-gate` reads the plan or the projection.
4. **Per-node result schema** — pin the exact structured shape the merge oracle (`integrate`)
   consumes (AC-6), so synthesis is mechanical. This is the field set that makes D1's "round-trips +
   verdicts as node results" concrete.
