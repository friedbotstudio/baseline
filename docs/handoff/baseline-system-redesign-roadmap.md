# Baseline System Redesign — the disease-cure program

> **What this is.** The executable roadmap that turns the already-approved vision
> (`office/docs/vision/`: Ledger #0001 Vision V2, Ledger #0002 Governance Sufficiency Model,
> the v1 thought-compiler) into **sequenced baseline change-orders**. It is not a fresh design —
> it integrates that vision and schedules its execution. Authored from the ERP consumer session
> 2026-07-08, after a full diagnosis of why the harness shipped a conformant-but-mediocre UI with
> heavy ceremony and no velocity. Each change-order (CO) is picked up by a baseline session through
> the baseline's own governance (feature branch off `main`, gates, manifest regen).

---

## 1. Symptom vs disease (why this exists)

The ERP's hand-rolled CRUD-grade UI was the **symptom**. Hand-fixing that screen cures nothing — the
next feature hits the same wall. The **disease** is the system, and the diagnosis named three root causes:

1. **No quality oracle** — the pipeline measures *conformance to the spec*, never *quality*. A thin spec
   passes every structural gate, and the build that conforms to it reports green while being mediocre.
2. **Thin human input** — specs pass structurally while empty of a quality bar; `/approve-spec` is a
   rubber-stamp (Vision V2: "approval is not review"). Garbage-in-the-spec passes every downstream gate.
3. **Ceremony without velocity** — measured on this repo: ~42% of output over 8 days went to building/
   re-tuning the harness itself; ~55% of a feature's calendar was human-latency at a three-gate relay;
   ~55% of a feature's tokens bought conformance, not quality.

**Goal:** a system that delivers **quality and velocity** instead of conformance-theater with overhead.

## 2. The center — the input→enforcement loop

Root causes #1 and #2 are one loop, and it is the **center** of the cure. Everything else is periphery
sequenced around it.

- **Input half** — the bar gets *set*. Operationalize the **Governance Sufficiency Model** (Ledger #0002,
  *approved*) as a redesigned **brainstorm-critic**: the human is made to produce substantive, rich-provenance
  input on load-bearing decisions.
- **Enforcement half** — the bar gets *enforced*. A **quality-oracle with teeth**: a checker bound to a
  ground-truth oracle (thought-compiler §2.2) that **fails the build** when the artifact misses the bar —
  not advisory.

They close a loop: the reference/quality-bar the human sets upstream (input) **is** the rubric the oracle
scores against downstream (enforcement). Cure both halves and no UI — FMCG or any other — can pass while
mediocre, *without anyone hand-fixing a screen*.

**The load-bearing principle (thought-compiler §2.2, do not violate):** a maker/checker loop self-corrects
ONLY if the checker stands on a **mechanical oracle**. Two LLMs left to converse agree on a hallucination —
wrong answers, faster, with more confidence. LLM-judgment is allowed only where no oracle exists, and must
be labeled lower-confidence. This is why the quality-oracle needs *teeth and a real rubric* (the spec-floor
reference), never vibes; and why loops are downstream of oracles, not a separate feature.

## 3. Grounding (integrate, do not re-derive)

- `office/docs/vision/baseline-v2-deliberation-system.md` (Ledger #0001) — Executive Office / Factory Floor,
  attention as a governed resource, the Decision Ledger, "approval is not review."
- `office/docs/vision/decision-ledger-0002-governance-sufficiency-model.md` (Ledger #0002, **approved**) —
  D1–D8, Threat-Tier ⟂ Governance-Class, the evidence-shape ladder (D/C/B/A), provenance-as-substrate,
  reasoning-preserved-not-graded. **This is the spec for the input half.**
- `office/docs/vision/baseline-v1-thought-compiler.md` — oracle-bound maker/checker, adversarial
  oracle-authors (§5.1), floor+ceiling termination (§5.4), threat/value tier dial (§5.5), the 8-piece
  decomposition. **This is the spec for the enforcement half.**

## 4. The cure program (sequenced)

### Phase 0 — immediate policy (no code): freeze the machine-churn
Stop starting governance/tooling/roadmap-planner workflows unless a *product* workflow is provably blocked.
The 42% churn (roadmap-planner rebuilt 3× in a week, etc.) is the biggest reclaimable pool and moved the
product nowhere. This is a standing decision, not a build. Record it in `decisions.md`.

### Phase 1 — INPUT HALF (the bar gets set)

**CO-A — Brainstorm-critic: operationalize the Governance Sufficiency Model.** *(the keystone; likely its own epic)*
- **Problem.** Thin human input → thin spec. `brainstorm` is opt-in and was skipped on spec-derived UI work;
  even when it runs it doesn't push thinking, and multiple-choice `AskUserQuestion` induces satisficing
  (crude provenance = a click, not cognition).
- **Outcome.** A critic that elicits substantive input on load-bearing decisions at a depth set by the
  **Governance Class** (D8 mechanical floor), producing rich-provenance evidence — without grading (D7) or
  spoonfeeding. Authorization becomes *Demonstrated Understanding + Risk Acceptance* (Ledger #0002 core).
- **Design direction (from #0002 + the ERP session):**
  - **Governance Class classifier** with a mechanical floor from blast radius (a diff touching `seed.md` /
    `CLAUDE.md` / an Article / security globs floors at Class A). Claude may *raise*, never *lower* (D8).
  - **Evidence-shape ladder:** D (authorize) · C (understanding) · B (+reasoning) · A (+alternatives +tradeoffs +confidence).
  - **Socratic elicitation, open questions, NO multiple-choice.** Multiple-choice is structurally the weakest
    provenance rung — extend `discipline.mjs → scanTurn` to forbid it, not only to forbid proposing solutions.
  - **Provenance-by-channel:** the human's reasoning (esp. risk acceptance, D5) enters through the forge-proof
    `consent_gate_grant` UserPromptSubmit boundary. Verify shape + presence, not correctness (D6/D7).
  - **Selective depth:** only load-bearing / Class A–B decisions get the full Socratic push; Class C/D pass
    light (forcing deep thinking on trivia manufactures the fatigue-slack it's meant to prevent).
- **Acceptance.** (1) A Class-A/UI decision can't reach `/approve-spec` without evidence of the required
  *shape*. (2) The critic asks open questions, never multiple-choice, on load-bearing decisions. (3) The Class
  floor is mechanical and un-lowerable by Claude. (4) AI assistance is never penalized (shape is
  method-agnostic — D3). (5) Risk acceptance enters only through the forge-proof channel.
- **Constraints.** Baseline-owned: `brainstorm` skill, `discipline.mjs`, consent-gate machinery, the
  `skip_brainstorm` flag, and a seed.md amendment for the Class model. Class-A change; regenerate manifest.

**CO-B — Spec quality floor.** ✅ *captured* → `docs/handoff/spec-quality-floor.md`. The bar encoded in the spec
artifact (reference-target + quality ACs on UI specs). This is the *hand-off point* between input and
enforcement: what the critic makes the human set becomes what the oracle enforces.

### Phase 2 — ENFORCEMENT HALF (the bar gets enforced)

**CO-C — Quality-oracle with teeth.** *(the other keystone)*
- **Problem.** No oracle for quality; the pipeline measures conformance. The ERP's ADR-0044 design-judge
  exists only as an *advisory on one UI* — no teeth, not general.
- **Outcome.** A general **checker-bound-to-ground-truth-oracle** capability (thought-compiler §2.2/§5) that
  **FAILS the build** when an artifact misses its bar. First instance: a **design-judge** that captures the
  rendered screen (Playwright) and scores it against the spec's **reference target** (from CO-B), failing
  below threshold.
- **Design direction (thought-compiler §5.1–§5.5):**
  - Checker = adversarial oracle-author: finding **with a concrete artifact** → blocks; **assertion-only** →
    advisory, labeled lower-confidence, backlogged with its proof obligation. Never silently dropped.
  - **Floor** (quality threshold — design-judge score, mutation score) + **ceiling** (effort budget).
    Ceiling-hit-below-floor → **red state, yield to human** (never a silent downgrade — that is the
    `verify_pass_guard` PASS-when-FAIL failure mode reappearing).
  - The design-judge is one checker; the **mutation oracle** (TDD), SAST (security), AC-conformance (merge)
    are siblings. A **threat/value tier dial** (`project.json`) sets floors/ceilings per checker (§5.5).
  - The rubric is CO-B's reference target — **this is what closes the input→enforcement loop.**
  - Runs in `verify` / governance-review; the oracle-bound verdict BLOCKS.
- **Acceptance.** (1) A UI artifact scoring below its reference threshold **FAILS** `verify` (not advisory).
  (2) The judge scores against the spec's reference target, not unanchored taste. (3) Oracle-bound findings
  block; assertion-only findings advise and are backlogged. (4) Ceiling-below-floor yields to a human.
- **Dogfood, not symptom-fix.** Prove it on the baseline's own `site-src` UI and, as a convenient real
  consumer target, the ERP FMCG screens — as a **means** to validate the general capability, never as an
  end to "make FMCG pretty." Graduation: the proven ERP ADR-0044 prototype folds into this general checker.
- **Constraints.** Baseline-owned: `verify`, governance machinery, a new checker/oracle framework. **Depends
  on CO-B** (needs the rubric). Class-A; regenerate manifest. Grounds in thought-compiler v1 Slices A/B.

### Phase 3 — VELOCITY (reclaim calendar; periphery to the center)

**CO-D — Notifier.** Push at consent-gate yields, batched, gates-only (Vision V2 "attention as a governed
resource"). Deletes most of the ~37% gate-idle. Cheap; big calendar win. Can be prototyped as an ERP-owned
Stop hook first, then graduated to the baseline harness.

**CO-E — Gate-collapse.** Fold the three human gates into two higher-signal ones (approve-direction =
intake+reference; approve-landing = commit). Depends on CO-D (notifier) + CO-A (sufficiency model, so a
single gate carries real evidence).

### Periphery — already captured (quality/reuse, not the center)
- **context7 outcome-mandate** ✅ **shipped** (`2c3007e`) → brief archived at `docs/archive/2026-07-08/context7-outcome-mandate/change-order.md`.
- **read-before-write (VI.7)** ⬜ was §8 of the context7 brief; **dropped from `2c3007e`**, re-captured as `docs/handoff/read-before-overwrite-convention.md`.
- **research retrieve-first** ✅ captured → `docs/handoff/research-retrieve-first.md`.

## 5. Dependency graph / build order

```
Phase 0 freeze (now, policy)
        │
Phase 1 INPUT:   CO-A brainstorm-critic ──┐   CO-B spec-floor ✅
                                          │        │  (reference target = the rubric)
Phase 2 ENFORCE: CO-C quality-oracle ◄────┴────────┘  (depends on CO-B; consumes CO-A's better specs)
        │
Phase 3 VELOCITY: CO-D notifier → CO-E gate-collapse (CO-E also needs CO-A)
```
Critical path is **CO-A → CO-B → CO-C** (set the bar → encode it → enforce it). CO-D is parallelizable and
should land early for the calendar win. Periphery (context7, research) is independent.

## 6. Status ledger

**Two distinct columns — a written brief is not a shipped change.** *Brief* = the requirement is
captured and pickup-ready; *Shipped* = the change has landed on `main`. Conflating them once let a
shipped change (context7) read as still-pending — keep them separate.

| CO | Cure | Half | Brief | Shipped |
|---|---|---|---|---|
| Phase 0 | Freeze machine-churn | policy | — (standing policy) | ⬜ record in `decisions.md` |
| CO-A | Brainstorm-critic (Ledger #0002) | INPUT | ✅ `brainstorm-critic.md` | ⬜ **(keystone; execute first)** |
| CO-B | Spec quality floor | INPUT | ✅ `spec-quality-floor.md` | ⬜ |
| CO-C | Quality-oracle with teeth | ENFORCE | ✅ `quality-oracle.md` | ⬜ (depends on CO-B) |
| CO-D | Notifier | velocity | ✅ `velocity-notifier-and-gate-collapse.md` | ⬜ |
| CO-E | Gate-collapse | velocity | ✅ same doc | ⬜ (depends on CO-A, CO-D) |
| — | context7 outcome-mandate | periphery | ✅ archived → `archive/2026-07-08/context7-outcome-mandate/change-order.md` | ✅ `2c3007e` |
| — | read-before-write (VI.7) | periphery | ✅ `read-before-overwrite-convention.md` | ⬜ (dropped from `2c3007e`) |
| — | research retrieve-first | periphery | ✅ `research-retrieve-first.md` | ⬜ |

## 7. Out of scope (explicitly)

- **Hand-fixing the FMCG UI** (real shadcn, a reference, an advisory judge on one screen) is **symptom-fixing**
  and is NOT part of this program. Real shadcn for FMCG is product work, deferred; the FMCG screens may serve
  as a *dogfood target* for CO-C, but making them pretty is never a goal here.
- The v2 signal-driven OS (thought-compiler Part 1.3 / Slice C) — deferred until the v1 cure is trusted.

## 8. Execution note

Each CO runs in the **baseline repo** through the baseline's own governance (feature branch off protected
`main`, its consent gates, `bash scripts/build-template.sh` to regenerate the manifest after touching hashed
files). CO-A and CO-C are large enough to be their own epics — expand each into a full change-order (or run
its own `epic` discovery) when picked up. This roadmap is the spine; the per-CO briefs hang off it.
