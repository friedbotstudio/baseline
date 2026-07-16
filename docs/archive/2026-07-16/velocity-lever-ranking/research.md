# Pattern Research — velocity-lever-ranking (D2)

No third-party libraries — this is an internal data-synthesis analysis, so the context7 current-docs mandate does not apply. Sources: the `-v0lv` backlog entry (DP1–DP8 narratives), 53 `docs/archive/**/timing.md` bundles, and the lever/instrumentation surface mapped in `docs/scout/velocity-lever-ranking.md`.

## Prior art (retrieved)

- `docs/archive/2026-06-20/phase-timing-instrumentation/research.md` — Lever 0 (measurement) design; the "measure before you optimize" premise this ranking pays off.
- `docs/archive/2026-06-21/rightsize-triage-drift-skip/spec.md` — Lever 2 + 4b-ii, the two landed levers most relevant to the ranking's conclusion.
- `.claude/memory/decisions.md → artifact-compression-writeset-diagram-profiles-sensitive-full-2026-06-21` — Lever 4 shape.
- Delta derived below: the **cross-track ranking itself** (never done) + the **build/no-build recommendation** for the spec.

## The ranking (synthesis of DP1–DP8 + the 53-bundle corpus)

### Finding 1 — every run is reasoning-bound, and `tdd` dominates every track
Across all clean samples, `tdd` is **42–64%** of total run time (DP1 42%, DP4/DP6/DP8 quickfix, DP7 spec-entry; the fresh `input-half-governance-class` sample: tdd 1,280,825ms ≈ 21min, the single largest phase). Human-wait is **~0–4%** except decision-latency-bound intake-full-with-findings (DP3). **Within `tdd`, scenario-authoring + drift-check dominate implement** (DP5: scenario 36% + drift 26% = 62% vs implement 26%; DP6/DP8: scenario 75–79% on quickfixes). The code-writing is not the cost center — test-authoring and spec↔impl verification are.

### Finding 2 — the token axis is a reasoning meter, not an artifact meter (the "mirage")
`timing.mjs` sums `usage.output_tokens`, which on Opus includes thinking tokens (DP6 proof: `tdd:scenario` measured 117k-out but produced ~2.7k-token artifacts — ~98% was reasoning). **Consequence:** Lever 4 (terser artifacts) has a low ceiling everywhere and is largely exhausted; and the instrumentation *cannot identify* Lever-4 targets (needs a byte-size signal it doesn't capture).

### Finding 3 — since reasoning IS the cost, leverage = doing LESS reasoning
This reorders the whole lever set. The high-leverage move is not "reason more efficiently" (small ceiling) but "skip whole phases of reasoning when the diff doesn't warrant them" (**Lever 2, right-size**) and "don't re-run the same verification three times" (**redundant-verification / 4b-ii**).

### Cross-track ranking

| Track-type | Bound by | Top lever | Status |
|---|---|---|---|
| **quickfix** (DP1/4/6/8) | model/reasoning (~96%) | **Lever 2** (right-size — cut simplify/document/security-apparatus a small diff shouldn't fully pay) | landed; extendable |
| **spec-entry / intake-full, no findings** (DP5/7, sample) | model/reasoning; `tdd` (scenario+drift) dominates | **Redundant-verification cut** (4b-ii) + Lever 1 (fan-out) | 4b-ii landed; fan-out live |
| **intake-full WITH findings** (DP3) | decision-latency (~7 gates) | **Lever 5** (collapse human round-trips) — and **gate-collapse (D3) just delivered the big cut here: 3→2 gates** | D3 landed this session |

### Lever inventory (status, so nothing landed is re-proposed)
- Lever 0 (measurement) — **landed** (+ token axis + sub-ticks + Bash-leg fix).
- Lever 1 (parallel checker fan-out) — **landed + live-wired**.
- Lever 2 (right-size gate) — **landed**; the top lever for the dominant (quickfix) track-type.
- Lever 4 / 4b-i (artifact + verdict compression) — **landed**; low ceiling per the mirage (Finding 2).
- Lever 4b-ii (reverify-skip) — **landed** (simplify + drift).
- Lever 5 (collapse human round-trips) — **just landed as D3 gate-collapse** (3→2 gates); matters only for the decision-latency-bound track-type.
- **Lever 3 (model/effort tiering)** — OUT: architecturally blocked by Article II (main-context phases at the fixed session model; can't tier down without becoming a subagent). Theoretically the biggest lever; do not re-propose.
- Scenario-output terser lever — OUT: the mirage killed it.

## Candidate next-actions (what, if anything, D2 should build)

### Candidate A: analysis-only — record the ranking, build nothing
- **Summary**: The highest-leverage levers (1, 2, 4, 4b, and now 5 via D3) are all landed. D2's value is the *ranking* itself + retiring the umbrella's open question. Remaining candidates are blocked (Lever 3) or low-value.
- **Fits**: Yes — matches the data: the levers that move the dominant reasoning cost are done.
- **Tradeoffs**: Delivers no new speedup, but honestly reflects that the cheap wins are spent; avoids building a low-ceiling lever for its own sake (which the mirage warns against).

### Candidate B: build the rebuild-tax lever
- **Summary**: Batch the `build-template.sh` manifest regen + audit re-verify that every baseline-owned edit currently forces (DP7 per-edit tax), e.g. defer the rebuild to a phase boundary instead of per-edit.
- **Fits**: Partially — it's a real recurring cost, but **baseline-self-dev-specific** (a consumer editing their own files never pays it), so it optimizes the maintainer's inner loop, not consumer velocity.
- **Tradeoffs**: Medium effort; edits the audit/build path (itself pays the tax + needs manifest regen). Real but narrow. No Article amendment unless it changes verify policy.

### Candidate C: extend Lever 2 (lower threshold / skip more phases)
- **Summary**: Widen the right-size gate to skip more apparatus for micro-diffs.
- **Fits**: No — risky. It can only ever skip `{simplify, document}` (never `security` — human-decided, load-bearing per the amendment); the safe skip surface is already covered. Diminishing returns + safety risk.

### Candidate D: 4b-ii-B (skip simplify's code-structure re-derivation)
- **Summary**: The deferred second half of redundant-verification — cut simplify re-deriving structure that tdd's implement already cleared.
- **Fits**: Deferred — needs a durable per-file clearance artifact + carries cross-file-miss risk; wants the v1 oracle-bound-checker machinery. Not cheaply buildable now.

## Recommendation

**The ranking's honest conclusion: the cheap, high-leverage levers are spent.** The dominant cost is reasoning, and the moves that cut it (Lever 2 right-size, 4b-ii reverify-skip, Lever 1 fan-out, and now D3's gate collapse) have landed. Lever 3 — the theoretically-largest remaining lever — is architecturally blocked.

For the spec's build/no-build call: **Candidate A (analysis-only) is the defensible default** — record the ranking, retire the umbrella's open question, and note that further velocity gains need the v1 architecture (subagent-based tiering / oracle machinery), not another cheap lever. **Candidate B (rebuild-tax)** is the only cheaply-buildable remaining lever and a legitimate pick *if* the engineer wants to land a maintainer-inner-loop speedup now — but it's narrow (self-dev only).

**What would flip it:** if the engineer values the maintainer inner-loop enough to accept a self-dev-scoped optimization, build B; otherwise A. This is exactly the deferred spec-time decision.

## Open questions (for the spec author / engineer)

1. **Build A (analysis-only) or B (rebuild-tax lever)?** The deferred spec-time decision. Recommendation: A unless the maintainer inner-loop speedup is explicitly wanted.
2. **If B**: defer-to-phase-boundary vs batch-across-workflow for the manifest regen? (`/spec` design question.)
3. **Corpus filtering**: the ranking rests partly on DP narratives; should the spec/analysis re-derive from all 53 `timing.md` bundles (filtering out header-only/reconstructed ones) for a firmer cross-track base, or is the DP synthesis sufficient? (Effort vs rigor tradeoff.)
