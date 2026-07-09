# Change Order — CO-D + CO-E: Velocity (notifier + gate-collapse)

> **Pickup instructions.** Two related velocity cures in one brief. **CO-D (notifier)** is small and
> independent — do it first (it's the biggest calendar win per effort, and it unblocks CO-E). **CO-E
> (gate-collapse)** depends on CO-D **and** CO-A (the brainstorm-critic), and is a Class-A consent-flow
> change. Authored from the ERP consumer session 2026-07-08. Periphery to the input→enforcement center, but
> CO-D is the cheapest win on the whole board. Grounds in Ledger #0001 ("attention as a governed resource").

---

## CO-D — Notifier

### Problem
Measured on the ERP: **~37% of a feature's wall-clock was human-latency at consent gates** — not the human on
vacation, the human working on something else and **not knowing it was their turn**. The system finishes a
phase and silently waits.

### Outcome
The harness **pings the human when their attention is actually needed** — at consent-gate yields and
failure-yields — so the idle collapses.

### Design direction
- Emit a notification **at the harness yield path** (`harness_state: yielded`), for **consent gates**
  (`/approve-spec`, `/approve-swarm`, `/grant-commit`) and **failure/integrate-needs-spec-change yields** —
  **not** on every phase transition (that becomes noise the human learns to ignore).
- **Batch**: "2 things need you" in one ping rather than one per event.
- Delivery via the available `PushNotification` tool / OS notification; keep it dependency-light (U6) — no
  irreplaceable third-party push service.
- **Prototype path:** can be built first as an **ERP-owned Stop hook** (in the consumer's `settings.json`,
  not baseline-hashed) to prove the trigger + payload, then graduated to the baseline harness yield path as
  the general capability.

### Acceptance criteria
1. A consent-gate yield or failure-yield emits exactly one (batched) notification naming what needs the human.
2. Ordinary phase transitions emit **no** notification.
3. No irreplaceable third-party dependency is introduced.

### Constraints
- Baseline home: the harness yield path + `harness_continuation` interaction. ERP-owned prototype is fine
  first. Regenerate the manifest if baseline-hashed files change.

---

## CO-E — Gate-collapse

### Problem
Three separate human gates per workflow (`/approve-spec`, `/grant-commit`, plus governance-review attention)
mean three context-switches and three latency windows. Each is a place the human is pulled back in.

### Outcome
Fold the human touch-points into **two higher-signal gates**: **approve-direction** (intake + reference/quality
bar) and **approve-landing** (commit). The human answers the load-bearing question well, once, and is never
again asked to eyeball structure.

### Design direction
- **Depends on CO-A** (brainstorm-critic + Governance Sufficiency Model): a collapsed gate is only safe when
  the single approval carries **real evidence** (the Ledger entry with understanding + risk acceptance).
  Collapsing gates without CO-A just removes review; collapsing *with* it concentrates review into one
  high-signal decision.
- **Depends on CO-D** (notifier): fewer gates only helps if the human is told when each fires.
- The **approve-direction** gate carries the CO-A evidence + the CO-B reference target; **approve-landing**
  stays the commit consent. Class C/D work (low blast radius) may collapse to a single direct authorization.
- This is a **consent-flow restructuring** → an **Article IV amendment** (the gate sequence) + `seed.md`
  precedence. Keep the structural anti-forgery property: every gate still generated from a provenance-anchored
  entry (CO-A), never self-satisfiable by Claude.

### Acceptance criteria
1. A standard workflow presents **two** human gates (direction, landing), not three, without losing the
   provenance-anchored consent property.
2. The direction gate carries the CO-A evidence + CO-B reference; it cannot be satisfied without them.
3. Low-Class work collapses further (single direct authorization) per the Governance Class floor.
4. No consent gate becomes Claude-satisfiable (the forge-proof channel still owns every approval).

### Constraints
- Baseline-owned, Class-A: consent-gate machinery, Article IV (gate sequence), `seed.md`. Regenerate manifest.
- **Sequence:** ship CO-D and CO-A first; CO-E lands on top of both.

---

## Cross-references

- `office/docs/vision/baseline-v2-deliberation-system.md` — attention as a governed resource; work blocks.
- `docs/handoff/brainstorm-critic.md` (CO-A) — the evidence that makes a collapsed gate safe (hard dep for CO-E).
- `docs/handoff/baseline-system-redesign-roadmap.md` — the program spine and sequencing.
