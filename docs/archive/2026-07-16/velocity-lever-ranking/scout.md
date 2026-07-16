# Codebase Scout Report — velocity-lever-ranking (D2)

Analysis workflow — this maps the velocity **measurement layer**, the **landed levers**, the **data corpus**, and the **rebuild-tax candidate surface** so `/research` can rank. No implementation approach recommended here.

## Primary touchpoints

### Measurement layer (Lever 0 — the instrumentation the ranking reads)
- `.claude/hooks/lib/timing.mjs` — the renderer + stamper. `stampFromWorkflow` (:110) appends a completion stamp per newly-`completed[]` phase; `renderTable` (:235) joins stamps + consent-token mtimes into the per-phase Model-time / Human-wait / token-delta table written to `<bundle>/timing.md` (:281). **Load-bearing for the ranking's honesty:** the token columns sum `usage.output_tokens` (:101) across a span's assistant turns — on Opus that **includes thinking tokens**, which is the root of the DP6 "scenario-output mirage" (output-token = reasoning volume, NOT artifact size). The `run-start` baseline row (:132) anchors phase-1 token deltas at `created_at`.
- `.claude/hooks/phase_timer.mjs` — the PostToolUse hook that fires `stampFromWorkflow`. Has a **Write/Edit leg** (on `completed[]` growth via file writes) AND a **Bash leg** (`phase-timer-bash-trigger`, DP3 fix — stamps on Bash-driven `workflow.json` mutation, so manual-harness runs like this one aren't silently lost).
- Sub-tick stamping: `tdd_ticks[]` in `workflow.json` → `{phase:"tdd:<tick>", event:"sub"}` rows nested under the `tdd` rollup (`tdd-subtick-stamping`, DP5 — reveals scenario/drift-check/implement split within tdd). Gated by `project.json → artifacts.subtick_timing.enabled`.

### Landed levers + their helpers
- **Lever 1 (parallel checker fan-out)** — `.claude/skills/harness/checker-fanout.mjs` (`runCheckerFanout` + `DEFAULT_CHECKER_REGISTRY`, `Promise.all`). Flag `velocity.checker_fanout {enabled:true, checkers:[spec-diagram, spec-traceability, spec-rollout]}`. Also powers the integrate code-review fan-out (`code_review {enabled:true, checkers:[security, simplify, code-structure]}`).
- **Lever 2 (right-size gate)** — `.claude/skills/harness/rightsize-gate.mjs`, post-tdd, may auto-skip a subset of `{simplify, document}` for a micro-diff. Flag `velocity.rightsize {enabled:true, max_lines:80, doc_globs:[...]}`. Required the Article IV amendment (second sanctioned skip mechanism).
- **Lever 4b-ii (reverify-skip)** — `.claude/skills/simplify/reverify-guard.mjs` + `.claude/skills/tdd/drift-reverify-guard.mjs` (shared fingerprint primitives). Flag `velocity.drift_reverify_skip {enabled:true}`. Skips a redundant audit/drift re-read when the tree is provably unchanged since the binding PASS.
- **Lever 4 (artifact compression)** — write_set-gated diagram profiles (`project.json → artifacts.diagram_profiles`, the `non-architectural` profile) + tdd-state pointers + the `simplify` terse-verdict discipline (4b-i). No single helper file; it's a rule spread across the spec/simplify/tdd skills + `artifacts.compression.enabled`.

### The data corpus (what the ranking synthesizes)
- **`docs/archive/**/timing.md` — 53 bundles on disk.** This is the raw sample set. The `-v0lv` DP1–DP8 records are *curated highlights*, not the whole corpus — the ranking can mine all 53 for track-type coverage. Recent samples span multiple track-types: `gate-collapse` (intake-full, manual), `gate-taxonomy`, `input-half-governance-class`, `non-ui-oracle-c5`, `spec-quality-floor`, `enforcement-oracle-framework`, `debt-hardening-batch`, `unified-execution-roadmap`, etc.
- **`.claude/memory/backlog.md` → the single `-v0lv` entry** holds the 8 curated DATA POINT narratives (DP1–DP8) with per-phase splits + the running lever inventory + the "mirage"/"model-bound vs decision-latency-bound" conclusions. This is the ranking's primary structured input.
- **This workflow's own bundle becomes DP9** — the first intake-full sample under the two-gate (gate-collapse) flow.

### Rebuild-tax candidate surface (the leading remaining buildable lever)
- `scripts/build-template.sh` — Stage 1 stamps `template/manifest.json` (sha256 table, :16) and gates on `audit-baseline` (:64). Every edit to a **baseline-owned shipped file** (`.claude/skills/**`, `.claude/hooks/**`, `CLAUDE.md`, `seed.md`, the mirrors) forces a `build-template.sh` manifest regen + full re-verify to keep the audit green — the DP7 "rebuild-coupling per-edit tax." Folds into the `[[baseline-skill-edit-needs-manifest-rebuild]]` landmine.
- The coupling is baseline-self-dev-specific (a consumer editing their own non-baseline files never pays it) — a scoping fact the ranking must weigh.

## Entry points that reach this code
- `phase_timer` PostToolUse hook (Write + Bash legs) → `stampFromWorkflow` on every phase transition.
- `/archive` Phase 10.5 → `node .claude/hooks/lib/timing.mjs render <slug>` writes the bundle's `timing.md`.
- The harness loop invokes the lever helpers at their boundaries (checker-fanout at spec-review, rightsize-gate post-tdd, reverify-guard in simplify/drift-check).

## Existing tests
- `tests/phase-timer-timing.test.mjs` — timing stamp + render (the measurement layer).
- `tests/rightsize-gate.test.mjs` — Lever 2 skip logic.
- `tests/checker-fanout*.test.mjs` — Lever 1 fan-out + merge.
- (reverify-guard, drift-reverify-guard have their own suites.) All passing per the last full run (1750 green).

## Constraints and co-changes
- **Analysis output is memory + a decision** — the ranking lands in `decisions.md` + the `-v0lv` umbrella update; no code unless the spec elects a build.
- **If a build is elected** (rebuild-tax lever), it edits `scripts/build-template.sh` and/or the audit path → itself pays the rebuild-tax + needs manifest regen; a governance amendment only if it touches Article-level skip/verify policy.
- **Measurement honesty (must be stated, not silently assumed):** `AskUserQuestion` waits (brainstorm/codesign/triage) are invisible to the timing model (DP5 caveat — this very workflow had 3 such waits, uncounted); output-tokens = reasoning, not artifact size (DP6 mirage).

## Patterns in use here
Levers are small, single-purpose, flag-gated `.mjs` helpers invoked at a harness boundary, each fail-open/fail-safe (a disabled or malfunctioning lever degrades to the un-optimized path, never a wrong result). Data is captured passively (hook-driven) into per-bundle `timing.md`; the curated narrative lives in one long backlog entry. New levers follow the introduction-workflow pattern (go live the workflow *after* the one that introduces them).

## Risks / landmines
- **The token axis cannot pick artifact-compression targets** (DP6 mirage) — the ranking must not read a high-output-token phase as "compress its artifacts"; it's high *reasoning*. Any Lever-4 target needs a *byte-size* signal, which the instrumentation does not capture.
- **Single-sample conclusions** — most DP records are one track-type (quickfix). Cross-track claims (e.g. "intake-full is decision-latency-bound") rest on thin samples (DP3 was *reconstructed* after an empty render); the ranking must flag provisional conclusions.
- **Lever 3 is a tar pit** — model/effort tiering reads as the obvious lever but is architecturally blocked by Article II (main-context phases at the fixed session model); the ranking must state this so it isn't re-proposed.
- **53 bundles ≠ 53 usable samples** — some `timing.md` renders are header-only (empty, pre-Bash-leg) or reconstructed; the ranking must filter to bundles with real per-phase rows before drawing track-type conclusions.
