# Codebase Scout Report — durable-plan-schema (-424f)

Maps the slice for the durable plan object at `.claude/state/plan/<slug>.json` (schema +
helpers + replanner + migrate evidence-ledger & checker-fanout + harness live-wiring).
Source-read-only. Intake: `docs/intake/durable-plan-schema.md`.

## Primary touchpoints

**Consumers to migrate (scope C/D):**
- `.claude/skills/harness/evidence-ledger.mjs:7-25` — append-only `{round_trips:[]}` ledger;
  `readLedger(path)` (missing→empty), `appendRoundTrip(path, rt)` (mkdir + write pretty JSON +
  `\n`). Read by `graduation-gate.mjs`. **No prior entry is ever mutated** — already the
  append-only discipline the plan's version history must generalize.
- `.claude/skills/harness/checker-fanout.mjs:44-87` — `runCheckerFanout(...)` → `mergeVerdicts`
  (deterministic, order-independent, BLOCKER⇒BLOCKED) → `persistVerdict` writes
  `.claude/state/checker-fanout/<slug>.json` (`{checkers,findings,verdict}`). CLI `run <slug>`
  exits 0 CLEAN / 2 BLOCKED. **LIVE** at the spec-review boundary (`velocity.checker_fanout`).
  `DEFAULT_CHECKER_REGISTRY:36-42` is the extension point.

**Machinery this plan must mirror/feed (scope B/E + non-goal -4c43):**
- `.claude/skills/harness/maker-checker.mjs:6-12` — `assertBounded({makers,checkers})`; the
  clause-6 one-maker/one-checker invariant the plan must not violate.
- `.claude/skills/harness/graduation-gate.mjs:12-33` — `evaluateGate({ledger,securityClean})`,
  fail-CLOSED counts-only. Reads the ledger; its return shape `{pass,round_trips,...}` is a
  template for a mechanical, no-LLM-judgment evaluator (the merge-oracle input wants the same).
- `.claude/hooks/lib/tier-dial.mjs:88-110` — `resolveCheckerThreshold(checker,opts)` /
  `resolveAllCheckers`. **The tier-awareness read path (AC-5).** Returns `{tier,floor,ceiling,
  mandatory,source}`; never throws; `regulated` profile is the active one. Per-node floor/ceiling
  MUST come from here, not hard-coded.

**Closest schema precedent (the model to imitate):**
- `.claude/skills/swarm-plan/validate.mjs:1-211` — the nearest analog: validates a per-slug
  state JSON with `tasks[]` (id, component, acs, write_set, read_set, depends_on) + `waves[]`,
  `validateSchema` (required-field/array/non-empty checks), `validateRefs` (depends_on resolve),
  `detectCycle` (Kahn), `assignWaves` (topo + disjoint write_set). Hand-rolled `.mjs` validator,
  mutates the plan in place adding `waves`/`status`/`validated_at`. **This is the template for
  the plan schema's validator + the per-node assignment frame.**
- `.claude/schemas/workflow-track.v1.json:1-64` — the ONLY JSON-Schema (Draft 2020-12) file in
  the repo. Precedent for adding `.claude/schemas/plan.v1.json` if a declarative schema is chosen.

**Merge oracle target (AC-6):**
- `.claude/skills/integrate/SKILL.md` — writes `.claude/state/last_test_result` (4-line:
  `PASS|FAIL` / ISO-UTC / cmd / exit) + `harness_state` JSON. Vision §2.4: per-node results must
  be shaped so `integrate` merges mechanically. No per-node merge schema exists yet — this piece
  defines it.

**Lineage to mirror (workflow.json discipline):**
- `.claude/state/workflow.json` — hand-written JSON: `{request,slug,track_id,exceptions,
  completed[],skipped_alternates,source_backlog_keys,created_at,updated_at}`. **No centralized
  writer/validator** — phases append to `completed[]` directly. `created_at/updated_at` only; no
  embedded version history. The plan object ADDS the version/diff history workflow.json lacks.

## Entry points that reach this code

- **CLI**: `node .claude/skills/harness/checker-fanout.mjs run <slug>` (live, spec-review boundary).
- **CLI**: `node .claude/skills/harness/graduation-gate.mjs evaluate <slug>`.
- **Harness loop** (`harness/SKILL.md`): the live-wiring point (E) — post-`approve-spec`,
  "approval triggers plan-mode." Today the loop drives `workflow.json → completed` + `harness_state`
  via marker-first writes; the plan object would be created/updated alongside, at plan-mode entry.
- **Imported**: `evidence-ledger.readLedger` ← `graduation-gate.mjs`; the oracle adapters
  (`spec-diagram`/`spec-traceability`/`spec-rollout`) ← `checker-fanout.mjs`.

## Existing tests

Behavioral suite is `npm test` = `node --test --test-reporter=spec tests/*.test.mjs` (this is what
`/integrate` runs). Per-file `project.json → test.cmd` is the SEPARATE structural audit
(`audit-baseline`, `test.kind: structural`) the hooks run on each edit.

- `tests/evidence-ledger.test.mjs` — append-only (3 trips → 3 entries), missing-file resilience. **Migration (C) must keep these green.**
- `tests/checker-fanout.test.mjs` + `tests/checker-fanout-live-wiring.test.mjs` — parallel==serial
  merge determinism, fan-out gate, live runner. **Migration (D) must keep these green.**
- `tests/maker-checker-roundtrip.test.mjs` — bounded 1+1 invariant.
- `tests/graduation-gate.test.mjs` — fail-closed ≥3 trips ∧ 0 fp-blocks ∧ sec-clean.
- `tests/tier-dial.test.mjs` (+ `-coverage`, `-shippability`) — profile/override resolution, resilience.

New tests land as `tests/<name>.test.mjs` (node:test, ESM). No mocks of these internal modules (Art. VI.3).

## Constraints and co-changes

- **Tier = `regulated`** (`project.json → tier.level`) — strictest floor/ceiling; resolve via
  `tier-dial.mjs` only.
- **Shipped-helper language** — new helpers must be `.mjs`/`.js` or `.sh`, never Python (spec-shippability).
- **Manifest-rebuild tax** — any edit to `.claude/skills/**` or `.claude/hooks/**` forces
  `scripts/build-template.sh` + re-audit before commit (landmine `baseline-skill-edit-needs-manifest-rebuild`).
- **Migrating live code (C/D)** — `evidence-ledger` + `checker-fanout` are shipped velocity Lever-1;
  cutover needs a payload round-trip regression test and must preserve the on-disk paths
  (`checker-fanout/<slug>.json`, `<slug>/ledger.json`) any in-flight state already uses, OR migrate them.
- **Live-wiring (E)** — if the plan becomes a mandatory post-approval artifact, that is a
  workflow-ordering change touching `harness/SKILL.md` (SOP) and possibly seed.md §5 / Article IV.
  Open question for /spec + gate A.
- **State-write discipline** — Tier-2 state; prefer Write tool for JSON, marker-first for any
  active-marker (per `.claude/CONSTITUTION.md §2`). No `tee`/`sed -i`.

## Patterns in use here

Per-slug state lives at `.claude/state/<kind>/<slug>.json`, pretty-printed JSON + trailing `\n`,
serialized directly (never JSONL for state objects). Validators are hand-rolled `.mjs` exporting
pure functions (`validateSchema`/`detectCycle`/…) that take injected data and return
`{ok,errors}`-style results — never throw on bad input where a reader (`tier-dial`, `evidence-ledger`)
returns defaults instead. Readers are resilient (missing/malformed → empty/default). Mechanical
evaluators (graduation-gate) keep LLM judgment OUT of the decision path — counts/structure only.
The plan object should follow all four: `<kind>/<slug>.json`, resilient readers, pure hand-rolled
validator, no-LLM-in-the-mechanical-path.

## Risks / landmines

- **Scope overlap with -4c43** (load-bearing): replanner (B) + live-wiring (E) are piece-5 territory.
  The spec must draw the seam — `-424f` = plan spine + replan-RECORD primitive + migration + wiring;
  `-4c43` = the loop logic that DECIDES when to replan. Surface at gate A.
- **Migration blast radius (C/D)**: both consumers are live; a path/shape change can break in-flight
  workflow state and the live fan-out gate. Round-trip + path-preservation tests are the fence.
- **Version history is genuinely new**: workflow.json and the swarm plan have NO embedded version/diff
  history — there is no in-repo precedent for "replan = recorded diff." This is the one net-new design
  surface (everything else has a template). Append-only (evidence-ledger) is the closest primitive.
- **No declarative-schema habit**: only one JSON-Schema file exists; the repo norm is hand-rolled
  validators. Choosing declarative vs hand-rolled is a /research decision, not assumed here.
- **Two test layers**: don't conflate the structural `audit-baseline` (per-edit hook) with the
  behavioral `npm test` suite (`/integrate`). Both gate the work.
