# Pattern Research — checker-graduation-fanout

**context7**: N/A. This is baseline-internal (Node stdlib + the harness/Workflow runtime). The one third-party touch, `@stryker-mutator/core@9.6.1`, is already integrated in `scripts/mutation-oracle.mjs` and not extended here. No external API is asserted.

**Memory reconciliation (Article IX.2 — verified against git):** the velocity backlog is **correct**, the scout was **wrong**. Commit `6c85282` exists; the mutation oracle `-f029` **shipped** with a live impl at `scripts/mutation-oracle.mjs` + `tests/mutation-oracle*.test.mjs`. The scout's "no impl on disk" was a too-narrow search (`.claude/` only; impl is in `scripts/`). Correct prior art:
- `scripts/mutation-oracle.mjs` — the **advisory-oracle pattern**: `computeScore` → `surfaceComparison(score, floor)` → surfaces `relation` (`above`/`below`/`NA`), **never blocks**, never writes `last_test_result`.
- `.claude/hooks/lib/tier-dial.mjs` — `resolveCheckerThreshold(<checker>)` → `{floor, ceiling, mandatory}` per checker. `mandatory` is explicitly reserved as **"piece-5 gate data"**. This IS the config spine the oracle-binding + gate should plug into.
- §II.A maker/checker **round-trip** itself: still charter-only (no live loop). This cycle builds the first one — but on top of real oracle prior art, not greenfield.

---

## Big reframing finding (must reach /spec + approval)

The original "the real win needs a subagent + Article II amendment" framing assumed the LLM reviews stay **LLM agents** and we fan out the agents. But oracle-binding **converts the reviews to deterministic scripts**. Once a checker is a Node script, running the four in parallel is **`node a & node b & wait`** — parallel *script* execution, which Article II already permits (scripts are not subagents; main context orchestrating parallel scripts is not "fan-out of agents"). **So Lever 1's mechanical win may need NO Article II amendment at all.**

The clause-6 cap forbids fan-out of maker/checker **agents**. It only bites if we fan out **LLM checkers**. Two coherent end-states:
- **(I) Mechanize → no amendment.** Mechanize the blocking-eligible checks of all four checkers; fan them out as parallel scripts (background Bash); residual LLM judgment stays advisory in main context (not parallelized). Delivers Lever 1's win without touching Article II.
- **(II) Amend → fan out LLM checkers.** The bigger v1 capability (`-9360`): permit multiple LLM maker/checker agents. The graduation gate exists to license exactly this.

The maintainer chose B ("earn the amendment"), so the plan still builds the bounded round-trip + earns graduation + does the conditional amendment as a **v1 down-payment**. But /spec and the approval gate should record, explicitly, that **the amendment is for the v1 LLM-checker capability, not a prerequisite for Lever 1's mechanical win** — they are separable. This honesty matters: it means even if the gate fails, Lever 1's mechanical fan-out can still ship (end-state I), and only the LLM-checker amendment waits.

---

## Candidate A — Substrate: Workflow runtime for the round-trip, background Bash for the fan-out
- **Summary**: bounded maker/checker round-trip runs on the Workflow runtime (`§II.A` names it); the checker fan-out runs as parallel mechanized scripts via background Bash.
- **Fits**: yes — §II.A line 190 ("workflow-runtime agents, not declared subagents") means **no new `.claude/agents/*.md`, `EXPECTED_AGENTS` and the seed count-prose stay unchanged** → audit surface minimal (scout's amendment-minimization finding). Background Bash matches the existing `node ... & wait` idiom and `run_in_background` Bash support.
- **Tests it enables**: deterministic verdict-equality test (serial vs parallel scripts → byte-identical); evaluator unit tests with injected deps.
- **Tradeoffs**: the Workflow runtime needs explicit opt-in; using it as a harness-internal round-trip must be sanctioned in the §II.A text. Heavyweight per-round-trip spawn — acceptable since round-trips are few (≥3, one-time graduation evidence), not per-workflow.

## Candidate B — Substrate: Task-tool agents (new declared checker subagent)
- **Summary**: add a `checker` subagent to `.claude/agents/`, dispatch via the harness parallel-cluster path.
- **Fits**: poorly — adds a second declared subagent → `EXPECTED_AGENTS`, seed count-prose ("two subagents"), CLAUDE.md Article II count, manifest, and audit all change in lockstep (scout §4a/4b). Balloons the amendment surface for no gain over A.
- **Tradeoffs**: larger blast radius; contradicts "exactly one subagent" more invasively than necessary. **Rejected.**

## Candidate C — Oracle-binding: mechanize all four checkers' blocking checks
- **Summary**: give `spec-diagram-review` + `spec-traceability-review` real helper `.mjs` files that compute their checks mechanically (Container↔Component set-membership; Component↔dependency-graph membership; **DFS acyclicity**; class `<<new>>/<<changed>>`↔`ALTER` regex; AC↔`title Behavior #N`; spec-AC↔intake-AC trace). `spec-lint`/`spec-shippability` are already mechanical.
- **Fits**: yes — follows `analyzer.mjs` finding shape `{severity,check,file,line,evidence,message,suggested_fix}`; plugs `mandatory`/`floor` from `tier-dial.mjs`. Resolves the **circularity trap**: a blocking finding is now an artifact (a cycle, a missing set member), not LLM prose, so the checker can't agree with the maker on a hallucination.
- **Tests it enables**: per-check unit tests (cycle-detection on a known-cyclic graph; trace on a spec with a dropped AC) — strong, mock-free.
- **Tradeoffs**: real implementation work (esp. diagram-review's 5 checks). Residual review value (narrative judgment) stays advisory — must be clearly labeled non-blocking. **This is the load-bearing piece and the bulk of the cycle's effort.**

## Candidate D — Evidence source: governed round-trips against REAL specs this cycle
- **Summary**: the ≥3 governed round-trips run the maker (proposes a spec edit) against the mechanized checkers (block/pass on artifact grounds) on **real specs available now**: this workflow's own spec, plus 2 recent archived specs (`docs/archive/2026-06-21/*/spec.md`).
- **Fits**: yes — genuine inputs, not synthetic; each blocking finding traces to a real artifact, satisfying clause 7(a) honestly. The evidence ledger records `{round-trip, blocking-findings, grounding-artifact, false-positive?}`.
- **Tradeoffs**: round-trips on real specs may surface real checker bugs mid-cycle (good — that's the gate working). A false-positive block honestly fails the gate → honest-stop path (end-state I still ships).

## Candidate E — Gate evaluator shape
- **Summary**: `.claude/skills/<...>/graduation-gate.mjs`, `main(argv, deps={})` per `rightsize-gate.mjs`; reads the evidence ledger + `/security` verdict; returns `{pass, round_trips, false_positive_blocks, security_clean, reason}` from **counts alone** (≥3 ∧ 0 ∧ clean). Reuses `reverify-guard.mjs` fingerprint primitives only if a tree-state check is needed; reuses `analyzer.mjs` finding shape.
- **Fits**: yes — fail-closed for the gate (unlike rightsize's fail-open: a malformed ledger → `pass:false`, so the amendment never rides on bad evidence). Mechanical, no LLM in the decision path (AC-5).
- **Tradeoffs**: must be fail-**closed** (opposite of rightsize-gate's fail-open) — a deliberate inversion to document.

## Recommendation

**A + C + D + E**, structured so the amendment is separable from the mechanical win:
1. Mechanize the four checkers' blocking checks (C) — delivers oracle artifacts AND, via background-Bash parallel scripts, Lever 1's mechanical fan-out **with no amendment** (end-state I).
2. Build the bounded Workflow-runtime maker/checker round-trip (A) + run ≥3 governed round-trips on real specs (D) + the fail-closed gate evaluator (E).
3. **Conditionally** (gate passes): the `-9360` Article II rewrite lifting clause 6 for oracle-bound checkers — the v1 LLM-checker capability down-payment — then wire the harness fan-out for LLM checkers.

**What flips it:** if mechanizing diagram-review/traceability-review proves too large for one cycle, fall back to mechanizing only `spec-lint`+`spec-shippability` (already mechanical) for the fan-out, run the graduation round-trips on those, and still earn the gate — smaller but honest. If the maintainer decides the LLM-checker amendment isn't worth pulling forward, end-state I alone delivers Lever 1 and the amendment is dropped (the gate evidence still lands as v1 progress).

## Open questions

- **Scope-fit for ~2h/one-cycle:** mechanizing diagram-review's 5 checks + traceability + round-trip + gate + conditional amendment + fan-out + tests is large. /spec should set the minimal in-scope set; the fallback above is the relief valve.
- **Is the amendment actually wanted now**, given Lever 1's mechanical win needs none? Maintainer already said yes (B, v1 down-payment) — /spec records it as the conditional, separable piece.
- **`/security` target for clause 7(c):** which artifacts exactly — the mechanized checker helpers + the round-trip runner + the gate evaluator. /spec names them.
- **tier-dial integration:** flip `mandatory` per mechanized checker via `resolveCheckerThreshold`, or keep blocking decisions in the gate evaluator? /spec decides.
