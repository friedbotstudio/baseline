# Codebase Scout Report — spec-rollout-enforceability-review

Scope: build a new oracle-bound spec-review checker that mechanically verifies every Rollout-section prerequisite is bound to an enforcement-type AC; amend the spec format; wire into the fan-out; remediate the GitHub Pages origin bug. Intake: `docs/intake/spec-rollout-enforceability-review.md`.

## Primary touchpoints

- `.claude/skills/spec-diagram-review/oracle.mjs:16` — `normalizeFinding(finding, {mandatory})`: the canonical severity-coercion. **BLOCKER only when `finding.artifact != null && mandatory === true`, else ADVISORY.** Exported and reused by the traceability oracle. The new checker SHALL reuse this (2nd→3rd consumer, import not copy).
- `.claude/skills/spec-traceability-review/oracle.mjs:38` — `runTraceabilityOracle({spec, intake})`: the closest template for the new oracle — pure function, extracts numbered items by regex over a `##` section, pushes `normalizeFinding(...)` findings, returns `{findings}`. Mirror its shape.
- `.claude/hooks/lib/tier-dial.mjs:85` — `resolveCheckerThreshold(checker)` → `{floor, ceiling, mandatory, ...}`. **LANDMINE (see Risks):** `CANONICAL_CHECKERS` / `DEFAULT_PROFILES` contain only `brainstorm, spec, tdd, security, review, ac-conformance`. An unknown checker name returns `DEFAULT_THRESHOLD` with `mandatory: false`, so `normalizeFinding` can never emit BLOCKER for it.
- `.claude/skills/harness/checker-fanout.mjs:35` — `DEFAULT_CHECKER_REGISTRY` (the extension point: `name → adapter(ctx) → {findings}`). `ctx` carries `{slug, rootDir, specContent, intakeContent}`. Add the new adapter here. `runCheckerFanout` (`:63`) fans the registry out in parallel and `mergeVerdicts` (`:14`) merges (`BLOCKED` if any finding `severity:'BLOCKER'`).
- `.claude/hooks/spec_approval_guard.mjs:51` — **the ONLY structural hard-block path into `/approve-spec`.** It reads exactly one artifact: `.claude/state/spec-shippability/<slug>.json`; if `verdict === 'BLOCKED'` it denies the approval-token write. Nothing else (not checker-fanout, not spec-diagram/traceability) structurally blocks approval today.
- `.claude/skills/spec/template.md:255` — the current `## Rollout` section: free-prose bullets (`Feature flag`, `Migration order`, `Canary`). No structured prerequisites block exists yet; this is what AC-1 amends.
- `.claude/skills/spec-shippability-review/SKILL.md` + `analyzer.mjs` — the working reference for "a spec-review checker whose BLOCKER reaches `spec_approval_guard`": it stamps `.claude/state/spec-shippability/<slug>.json {verdict, findings}` (exit 0 CLEAN / 1 NEEDS_REVIEW / 2 BLOCKED). The new checker's hard-block path likely mirrors this verdict-artifact mechanism.

## Entry points that reach this code

- Harness spec-review boundary (after `spec`, before `approve-spec`): `node .claude/skills/harness/checker-fanout.mjs run <slug>` — runs the registry, exits 0 CLEAN/skipped / 2 BLOCKED, surfaces BLOCKERs to the user. Gated by `project.json → velocity.checker_fanout.enabled` (currently `true`, checkers `["spec-diagram","spec-traceability"]`).
- `/approve-spec <path>` (user-typed) → `consent_gate_grant` writes the marker → `spec_approval_guard` PreToolUse validates marker AND reads the shippability verdict before allowing the `.approval` token.
- `release.yml` `deploy-pages` job (`:112`) — `actions/deploy-pages@v5`. The repo-level Pages `build_type=workflow` setting it depends on is configured out-of-band (Pages API), not in the workflow; nothing fails fast if it's wrong. This is the origin-bug surface.

## Existing tests

- `.claude/skills/harness/tests/checker-fanout.test.mjs` — fan-out merge + registry behavior. New adapter needs a registration test here.
- `.claude/skills/spec-diagram-review/tests/...` (`checker-oracle-diagram.test.mjs`) and traceability's (`checker-oracle-traceability.test.mjs`) — the test shape to mirror for the new oracle (CLEAN / BLOCKER / ADVISORY cases).
- `.claude/skills/spec-shippability-review/tests/expected/*.json` — fixture-driven verdict assertions; the model for testing the `spec_approval_guard` block path.
- No test exists for the Pages `build_type` precondition (that's the point — AC-9).

## Constraints and co-changes

- **`project.json → velocity.checker_fanout.checkers`** — append the new checker name here so the fan-out runs it. Mirror in `src/project.template.json`.
- **`project.json → artifacts.required_sections.spec`** — `artifact_template_guard` (`:44`) blocks a spec missing any required `##` section. If the Rollout amendment renames/splits the section, verify `Rollout` stays a satisfiable heading.
- **Tier-dial registration** — to emit a real BLOCKER, the checker name must resolve `mandatory: true`. Either add it to `CANONICAL_CHECKERS` + `DEFAULT_PROFILES` (mirror in `src/`), or map it onto an existing mandatory checker (`ac-conformance` is `mandatory:true` in every profile). **This is the central design decision for `/research`.**
- **`spec_approval_guard` extension** — for AC-7 (hard-block parity), the guard must learn to read the new checker's BLOCKER. Options: (a) generalize the guard to read a merged checker-fanout verdict artifact; (b) have the checker write into the shippability verdict path; (c) a new sibling verdict file the guard also checks. Research decides.
- **New shipped skill** — needs `owner: baseline` frontmatter (auto-collected by `build-manifest.mjs:collectOwnersFromTemplate`); shipped helpers must be `.mjs`/`.js`/`.sh` (no `.py`); requires `scripts/build-template.sh` manifest rebuild; must pass `audit-baseline` (skill count/name/hash). `spec-shippability-review` itself enforces no dev-tree runtime refs in the new SKILL.md.
- **`scripts/bootstrap-pages.mjs` does NOT exist** — AC-9 creates it (or a `release.yml` preflight). The backlog names `gh api -X PUT /repos/{owner}/{repo}/pages -f build_type=workflow`.

## Patterns in use here

The oracle-bound checker pattern: a pure `run*Oracle(input, deps={})` function reads a structured artifact (a diagram's edges, a spec's AC numbers), derives findings as concrete artifacts (a cycle path, a dropped AC number), and runs each through `normalizeFinding` so severity is mechanically gated by `artifact-present AND tier-mandatory`. Findings never block on LLM prose — that is the proof-obligation contract (`-d186`). The new checker's "artifact" is the structured `enforced-by:` binding (present/absent/dangling/non-enforcing — all mechanically decidable).

## Risks / landmines

- **Tier-dial `mandatory:false` for unknown checkers (load-bearing).** `spec-diagram` and `spec-traceability` are themselves NOT in `DEFAULT_PROFILES`, so they resolve `mandatory:false` and **cannot currently BLOCK** — they ship ADVISORY-only (their landmarks/backlog confirm "relief-valve ADVISORY this pass"). If AC-2/3/4 require true BLOCKING, the checker MUST be registered in the tier dial as mandatory, OR reuse `ac-conformance`. Do not assume `normalizeFinding` alone blocks.
- **Two BLOCKER channels that don't converge.** checker-fanout's exit-2 "BLOCKED" only *surfaces to the user / yields the harness*; it does NOT touch `spec_approval_guard`. Only the `spec-shippability/<slug>.json` verdict file structurally blocks approval. AC-7's "existing BLOCKER path" must pick which channel, and likely extend `spec_approval_guard`.
- **Spec-format amendment ripples** to: `spec/template.md`, `src/CLAUDE.template.md`/seed mirror only if the constitution describes Rollout (verify), `artifact_template_guard` required sections, `spec-lint` checks, and every future spec author. Keep the structured block additive so existing-spec parsing degrades to ADVISORY (free-prose path), per the non-goal.
- **Manifest/audit coupling** — editing any baseline-owned shipped file forces a `build-template.sh` rebuild + `audit-baseline` pass (the recurring self-dev tax; landmine `baseline-skill-edit-needs-manifest-rebuild`).
- **Origin bug is out-of-band config, not code.** The Pages `build_type=workflow` is a repo setting, so AC-9's "enforcement" is necessarily a preflight that *queries* Pages config (or sets it idempotently), not a unit-testable pure function — design its testability deliberately.
