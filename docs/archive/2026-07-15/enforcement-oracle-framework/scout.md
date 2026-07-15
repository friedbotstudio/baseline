# Codebase Scout Report — enforcement oracle framework (C2 + C3 + C4)

Scope: the machinery C2 (more oracle-bound checkers), C3 (maker/checker multi-round loop + stop rule + arbitration), and C4 (design-judge with teeth) will extend. Gathered via three read-only Explore sweeps + direct reads; decided in main context.

## Primary touchpoints

### The fan-out interface (C2 anchor)
- `.claude/skills/harness/checker-fanout.mjs` — the shared interface all checkers already ride.
  - `DEFAULT_CHECKER_REGISTRY` (L37–43): `checker-name → (ctx) => { findings }`. `ctx = { slug, rootDir, specContent, intakeContent }`. Current entries: `spec-diagram`, `spec-traceability`, `spec-rollout`. **This is the registry C2 extends.**
  - `mergeVerdicts` (L16–26): flat-maps findings, stamps `checker`, sorts by (checker, check, severity); `verdict = findings.some(f => f.severity === 'BLOCKER') ? 'BLOCKED' : 'CLEAN'`.
  - Verdict shape (verbatim): `{ checkers: string[], findings: Array<{checker, check, severity, ...}>, verdict: 'BLOCKED'|'CLEAN' }`.
  - `runCheckerFanout({slug, rootDir, enabled, checkers, registry, readFile})` (L93–112): fail-open on `enabled:false`; `assertSafeSlug(slug)` before any path build (L98); runs adapters via `Promise.all` (L108) — **mechanical scripts, not subagents**.
  - `persistVerdict` (L56–70, private): writes `.claude/state/checker-fanout/<slug>.json` — **canonical for gate A**; `mirrorVerdictToPlan` runs after in a try/catch that swallows to stderr (load-bearing — do not "clean up").
  - `assertFanoutAllowed({mode, amendmentPresent})` (L29–33): throws if `mode==='agents' && !amendmentPresent` — the §II.A LLM-agent-fanout gate. **C2/C3 must keep checkers as mechanical oracle scripts, not agents, or amend §II.A first.**
- The 3 existing oracle checkers — each dir ships `oracle.mjs` + `SKILL.md` only (NO `check.mjs`/`analyzer.mjs`):
  - `spec-diagram-review/oracle.mjs` — `runDiagramOracle(content)` (L73–92) + `normalizeFinding(finding, {mandatory})` (L16–19, **shared/exported**, coerces `BLOCKER` iff `artifact != null && mandatory`). Ships only the dependency-graph acyclicity BLOCKER; **class↔DDL and AC↔sequence are the deferred C2 checks (currently ADVISORY/absent)**.
  - `spec-traceability-review/oracle.mjs` — `runTraceabilityOracle({spec, intake})` (L64–98).
  - `spec-rollout-enforceability-review/oracle.mjs` — `runRolloutOracle({specContent})` (L92–147).
  - **Pattern to copy for C2's refits:** a checker = `oracle.mjs` exporting `runXOracle(ctx-slice) → {findings}`, findings normalized via `normalizeFinding`, DI'd `resolveCheckerThreshold`, wired into `DEFAULT_CHECKER_REGISTRY` as `(ctx) => runXOracle(...)`.
- Gate-A read: `.claude/hooks/spec_approval_guard.mjs:72` reads `.claude/state/checker-fanout/<expectedSlug>.json`; on `BLOCKED` filters `severity==='BLOCKER'`, emits the punch-list, **refuses the approval-token write** (L76–87). **INVARIANT: do not regress this CLEAN/BLOCKED projection contract.**

### C3 maker/checker machinery (all partial — big gaps)
- `.claude/skills/harness/maker-checker.mjs` (13 lines) — **only** `assertBounded({makers, checkers})` (L6): throws unless `1 && 1`. **No runner, no loop, no verdict.**
- `.claude/skills/harness/evidence-ledger.mjs` (39) — `appendRoundTrip(ledgerPath, roundTrip)` (L20, append-only), `recordRoundTripOnPlan({slug, rootDir, ledgerPath, roundTrip})` (L35, dual-write ledger + plan). Ledger at `.claude/state/<slug>/ledger.json`. Entry shape is **opaque/unvalidated** except `false_positive_blocks: number` (read by the gate).
- `.claude/skills/harness/graduation-gate.mjs` (58) — `evaluateGate({ledger, securityClean})` (L12): `pass = round_trips>=3 && false_positive_blocks===0 && securityClean`. **Fail-closed** (missing ledger → `pass:false`). `MIN_ROUND_TRIPS=3` (L10). Produces a boolean `{pass, reason}` — **no RED state, no severity**.
- `.claude/hooks/lib/tier-dial.mjs` (119) — `resolveCheckerThreshold(checker, {projectJson}) → {tier, checker, floor, ceiling, mandatory, source}` (L88). `CANONICAL_CHECKERS` (L13) = `[brainstorm, spec, tdd, security, review, ac-conformance, spec-rollout]`. `ceiling` = **round budget** but **read by nothing today** (header L7–9: "blocking is piece 5"). `review` floor = 0 findings across tiers. Overrides via `project.json → tier.overrides[checker]`.
- Plan modules (`plan-store.mjs` `assertSafeSlug`/`createPlan`/`appendRoundTripArtifact`/`setVerdictArtifact`/`readPlan`/`recordRevision`/`validatePlan`/`mergeInput`; `plan-frame.mjs` `readFrame`; `replan.mjs` `applyReplan` — **RECORDS a replan, decides nothing**; `plan-diff.mjs` `diffVersions`; `plan-wiring.mjs` `ensurePlanAtPlanMode`/`recordPhaseTransition`). Plan at `.claude/state/plan/<slug>.json`.

### The 3 review skills to refit (C2)
- `.claude/skills/security/SKILL.md` — **prose-only today**: emits a findings report to `docs/security/<slug>-<date>.md`, no helper `.mjs`, read-only. Refit = an oracle that reads the report/diff and emits a typed verdict (findings count vs the `review`/`security` tier-dial floor of 0).
- `.claude/skills/simplify/SKILL.md` + `reverify-guard.mjs` — emits a verdict table (clean/cleaned/flagged); already has a fingerprint helper. Refit target: a `flagged`-count verdict.
- `.claude/skills/code-structure/SKILL.md` — **pure guidance, no machine verdict, no helper.** Hardest refit — needs a mechanical structural oracle defined from scratch (or accepted as advisory-only).

### C4 design-judge integration points
- `.claude/skills/verify/SKILL.md` — the binding 4-line `last_test_result` (`<PASS|FAIL>\n<ISO>\n<cmd>\n<exit>\n`) at `.claude/state/last_test_result`; `verify_pass_guard` reads line 1. **C4's below-threshold FAIL rides this exact file/format.**
- `.claude/skills/tdd/SKILL.md` — the `verify-tick` (inlined by harness), `design-ui-tick` (one per Design calls row, post-verify), `drift-check-tick`. **C4 plugs in as a design-judge tick that scores each design-ui-tick's rendered surface and can flip verify to FAIL.**
- `.claude/hooks/lib/design-calls.mjs` (B1, landed) — `parseDesignCalls(spec) → {rows: [{referenceTarget, qualityCriteria, ...}]}`. **`referenceTarget` is the rubric C4 scores against.**
- Playwright: `playwright` server IS in `.mcp.json` (confirmed) with `mcp__playwright__browser_navigate` / `_snapshot` / `_take_screenshot` etc. available. **No existing skill uses it yet** — C4 is the first consumer.

## Entry points that reach this code
- `checker-fanout.mjs run <slug>` — invoked by the harness at the spec-review boundary (after `spec`, before `approve-spec`).
- `graduation-gate.mjs evaluate <slug>` — CLI, maker/checker gate.
- The harness `verify-tick` / `design-ui-tick` — inlined, not a CLI; C4 lands here.
- The spec-review oracles — invoked in-process by `runCheckerFanout`, not standalone.

## Existing tests
- `tests/checker-fanout*.test.mjs` (checker-fanout.test.mjs, checker-fanout-live-wiring.test.mjs, checker-fanout-migration.test.mjs) — merge/verdict/persist contract + live wiring.
- `tests/checker-oracle-diagram.test.mjs`, `checker-oracle-traceability.test.mjs`, `checker-oracle-rollout.test.mjs` — the per-oracle contracts (the pattern C2's new oracle tests copy).
- `tests/checker-graduation-*.test.mjs`, and graduation-gate/evidence-ledger/plan-* tests — the C3 surface.
- No design-judge / Playwright test exists — C4 is greenfield here.

## Constraints and co-changes
- `.claude/project.json → velocity.checker_fanout.checkers` = `[spec-diagram, spec-traceability, spec-rollout]` — **C2 adds `security`, `simplify`, `code-structure` here** (and the deferred diagram checks land inside the diagram oracle).
- `velocity.durable_plan.enabled: true`, `velocity.rightsize.enabled: true`.
- **Tier is `regulated`** — it lives at top-level `project.json → tier.level = "regulated"` (L285–287), **not** `security.tier` (which is absent; `security` holds only `sensitive_globs`). This is load-bearing for C3: under `regulated`, tier-dial ceilings (round budgets) are `spec:3, tdd:3 (floor 0.85, mandatory), security:3 (mandatory), review:2 (mandatory), ac-conformance:2 (mandatory), spec-rollout:3 (mandatory)`. So C3's round budget and the mandatory-BLOCKER flags are the high tier, not internal-tool's mostly-1 ceilings. `resolveCheckerThreshold('review')` is what the refitted `simplify`/`code-structure` checkers read; `resolveCheckerThreshold('security')` for the `security` checker.
- `tdd.ui_globs` drives which surfaces C4 judges (same set B1 uses).
- Every baseline-owned file edit (hooks/skills) forces `npm run build` to re-hash the manifest, and `audit-baseline` must stay green.

## Patterns in use here
Mechanical oracles are pure `.mjs` scripts exporting a `run*(input) → {findings}` (or `{pass, reason}`) function, DI-friendly (`deps = {}`), fail-open for velocity levers but **fail-closed for the graduation gate**, never throwing on bad input, path-guarded by `assertSafeSlug` (reject-never-repair). Findings carry `{check, severity, artifact}`; `severity==='BLOCKER'` iff a mandatory check with a concrete artifact. Verdicts persist as JSON projections that guards/gates read.

## Risks / landmines
- **§II.A one-subagent invariant.** `assertFanoutAllowed` gates LLM-agent fan-out. C2/C3 checkers MUST stay mechanical scripts run via `Promise.all` (not subagents). C3's "maker" is the concern: a maker that calls an LLM in a loop could breach Article II — the RED-yields-to-human design keeps judgment in main context, but the spec must pin exactly where the maker/checker LLM calls (if any) happen and how the one-subagent count holds.
- **`ceiling` is resolved-but-unread.** C3 is the first consumer of the round budget — wiring it must not change the gate-A verdict path or the plan-node threshold stamping (`plan-store.resolveNodeThresholds`).
- **Gate-A CLEAN/BLOCKED projection is load-bearing** (`spec_approval_guard.mjs:72`). Adding checkers that emit BLOCKER findings will now block gate A — intended, but the spec must confirm each new checker's BLOCKER conditions are correct (a false BLOCKER wedges every UI spec).
- **`code-structure` has no mechanical verdict.** Refitting it as an oracle is genuinely hard (structural analysis of arbitrary code); the spec should decide whether it becomes a real oracle or stays advisory — do not fake a BLOCKER.
- **Playwright availability.** C4 must SKIP (recorded reason) when no browser can launch — never a false FAIL (AC-007). Headless CI is the common case.
- **Monolith size.** The write_set spans checker-fanout, 3 new oracles, the maker/checker runner + stop-rule + arbitration, the design-judge + Playwright wiring, tier-dial consumption, and project.json — a very large diff. `/security` is mandatory (sensitive globs) and `/simplify` will have real surface.
- **`recordRoundTripOnPlan` dual-write ordering** mirrors the checker-fanout projection-first discipline — keep the on-disk ledger canonical, the plan mirror best-effort.
