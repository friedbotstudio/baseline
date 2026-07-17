---
key: velocity-lever-cross-track-ranking-and-rebuild-tax-lever-2026-07-17
category: decisions
scope: [spec]
source: engineer decision, direction approved at intake (first `/approve-direction` under the gate-collapse flow). Ranking = archived `docs/archive/2026-07-16/velocity-lever-ranking/research.md`. Closes backlog `-v0lv`.
verified-at: c3e1e3e
last-touched: 2026-07-17
---

- Decision (D2, roadmap Epic 4 — now ✅): the cross-track velocity lever ranking is DONE, and its conclusion is that the cheap high-leverage levers are SPENT. Ranking by track-type: quickfix runs are reasoning/model-bound (~96%) → **Lever 2 (right-size)** tops; spec-entry/intake-full runs have `tdd` dominating (scenario-authoring + drift-check > implement, per DP5) → **redundant-verification cut (4b-ii)** + Lever 1 fan-out; intake-full-WITH-findings is decision-latency-bound → **Lever 5 (collapse human gates)**, which D3 gate-collapse just delivered (3→2). Levers 0/1/2/4/4b/5 all landed. **Lever 3 (model/effort tiering) is OUT** — architecturally blocked by Article II (main-context phases at the fixed session model; can't tier down without becoming a subagent). The "scenario-output mirage" (per-phase output tokens = reasoning volume, not artifact byte-size) means Lever 4 has a low ceiling everywhere and the token axis cannot pick artifact-compression targets.
- Also built (engineer chose build-over-analysis-only at spec, the deferred fork): the **rebuild-tax lever** — `scripts/build-template.sh --manifest-only` (runs Stages 1/1.5/2/3, skips 0a/0b/1.6/2.6/4=audit) + `scripts/manifest-refresh.mjs` wrapper + `npm run manifest:refresh`. Re-stamps the manifest cheaply mid-workflow; the authoritative full build+audit still gates at integrate, and `prepack` (ship-time) always runs the full build so no unaudited template can reach npm (security-verified LOW). Scope: baseline maintainer inner-loop only.
