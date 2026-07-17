---
key: unified-execution-roadmap-one-plan-not-two-2026-07-12
category: decisions
scope: [spec]
source: user-instruction ("before we route, we should update our roadmap") + Decision Ledger #0002.
verified-at: 3160e0c
last-touched: 2026-07-12
---

- Decision: the project's execution roadmap now EXISTS at `docs/roadmap-execution-plan.md` — the path `project.json → roadmap.path` had declared for some time while the file was absent, which left `/roadmap-sync` (Phase 10.6) a permanent no-op, `standup` degrading with `no-roadmap-plan`, and `sprint-planner` unable to propose a sprint. It is ONE plan spanning BOTH live programs, not two.
- Why one plan: Decision Ledger #0002 (`office/docs/vision/decision-ledger-0002-governance-sufficiency-model.md`, approved) says it outright — *"V1 and V2 share a spine ... the roadmaps thought to be parallel converge at classification."* The disease-cure change-orders (`docs/handoff/`) and the v1 thought-compiler epic ([[baseline-v1-thought-compiler-agent-team-plan-mode-9d4c]]) overlap: **CO-C (quality-oracle) IS the same work as backlog children `-d186` (promote review skills to oracle-bound checkers) and `-4c43` (maker/checker RALPH)**. They are one line item (Epic 3), not two competing plans. Tracking them separately is how the churn started.
- Authority: `docs/handoff/baseline-system-redesign-roadmap.md` is now explicitly the RATIONALE (diagnosis + per-CO briefs); the execution roadmap is the TRACKER. On any disagreement, **the execution roadmap governs** — a pointer block at the top of the brief says so.
- Three sequencing corrections folded in from Ledger #0002 (they correct the prose brief): (i) **CO-A's Alpha is a RETROFIT of the `/approve-spec` gate ONLY** — `/grant-commit` and `/approve-swarm` stay direct authorization ("Alpha is a retrofit, not a greenfield"); (ii) **D8's mechanical Governance Class floor shares a spine with the ALREADY-SHIPPED threat/value tier dial** (`project.json → security.tier`, read by the checker fan-out; [[tier-dial-oracle-floors-2026-06-16]]) — EXTEND it, do not stand up a parallel classifier; (iii) **CO-C hard-depends on CO-B only** (it needs the reference-target rubric), NOT on CO-A — CO-A improves the specs it reads but does not block it.
- Consequence for pickup: the critical path is **B1 (spec quality floor) → C4 (design-judge)**, which is shorter than the brief's stated "CO-A → CO-B → CO-C". CO-A remains the keystone of the input half and is sized as its own epic.
- Format contract (load-bearing, silent-failure mode): [[roadmap-execution-plan-format-contract-stray-emoji-silently-inflates-tallies]].
- verbatim (user, 2026-07-12):
  > "before we route, we should update our roadmap"

---
