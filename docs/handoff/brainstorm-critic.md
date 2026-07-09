# Change Order — CO-A: Brainstorm-critic (operationalize the Governance Sufficiency Model)

> **Pickup instructions.** Self-contained requirement brief; no brainstorming needed on the *what/why*
> (Ledger #0002 already settled the model — this is execution). Large enough to run as its own **epic** in
> the baseline (`/triage` → epic, `skip_brainstorm: true`). Class-A change (touches `seed.md` + consent
> machinery). Authored from the ERP consumer session 2026-07-08. This is the **keystone of the input half**
> of the disease-cure roadmap (`baseline-system-redesign-roadmap.md`).

---

## Problem

Thin human input produces a thin spec, and a thin spec passes every downstream gate. Concretely:
- `brainstorm` is **opt-in** (`skip_brainstorm`) and was skipped on spec-derived UI work — the one phase that
  could have forced a quality bar was turned off.
- Even when it runs, it doesn't push thinking, and multiple-choice `AskUserQuestion` **induces satisficing**:
  a click is the weakest possible provenance — a selection, not cognition.
- `/approve-spec` is a rubber-stamp. Ledger #0001: *"clicking an approval button provides no evidence the
  material was understood."* The gate proves authorization, never review.

## Outcome

Authorization becomes **Demonstrated Understanding + Risk Acceptance** (Ledger #0002 core decision). A
redesigned brainstorm-**critic** elicits substantive, rich-provenance input on load-bearing decisions, at a
depth set by the decision's **Governance Class**, and the approval marker is generated **from** that evidence
— *no evidence, no authorization*. It does this **without grading** the reasoning (D7) and **without
spoonfeeding** (no multiple-choice, no proposed solutions).

## Design direction (from Ledger #0002 — execute it; do not re-litigate the model)

- **Governance Class classifier with a mechanical floor (D8).** Class is floored by blast radius: a diff
  touching `seed.md` / `CLAUDE.md` / an Article / `security.sensitive_globs` floors at **Class A**; ordinary
  changes lower. Claude may *raise* a class (more scrutiny is always safe), **never lower** below the
  mechanical floor. This is the highest-leverage anti-gaming defense — the cheapest attack is reclassifying a
  decision down to "trivial," and the floor removes model judgment from that lever.
- **The evidence-shape ladder** (Class determines *shape*, never duration/word-count/authorship):
  `D` authorize · `C` understanding · `B` +reasoning · `A` +alternatives +tradeoffs +confidence.
- **Socratic elicitation, open questions, NO multiple-choice.** Multiple-choice is structurally the weakest
  provenance rung (a click). Extend `discipline.mjs → scanTurn` to forbid multiple-choice on load-bearing
  probes, in addition to the existing ban on proposing solutions. Open free-text answers are what upgrade
  provenance from a click to a cognition trace.
- **Provenance-by-channel (the substrate, D4).** The human's reasoning — and especially **risk acceptance
  (D5, irreducibly human)** — enters through the forge-proof `consent_gate_grant` UserPromptSubmit boundary
  that Claude cannot author. Evidence shape + presence are *checked*; both stand on provenance.
- **Verify presence + shape, not correctness (D6); preserve, don't grade (D7).** The system checks the
  required elements are present, well-formed, and provenance-real. It never scores whether the reasoning was
  wise — that would make the AI grade the human.
- **AI assistance never penalized (D3).** Shape is method-agnostic: a named alternative is a named alternative
  whether the human reasoned solo or the AI surfaced it. This is the wire that lets the critic assist heavily
  without penalizing the assistance.
- **Selective depth.** Only Class A–B (load-bearing) decisions get the full Socratic push; Class C/D pass
  light. Forcing deep thinking on trivia manufactures the fatigue-driven slack the critic exists to prevent.
- **The four-way sufficiency split** (own each correctly): threshold = policy (the Class, human-owned,
  mechanically floored); presence = mechanical oracle; risk acceptance = human via the channel; quality =
  no one (preserved, never graded). The AI saturates *production* of the first three, arbitrates none.

## Integration surface

- Redesign the **`brainstorm` skill** into the critic; wire its depth off the Governance Class.
- New **Governance Class classifier** module (mechanical floor from blast radius; Claude-may-raise-never-lower).
- **`discipline.mjs`** — extend `scanTurn` to forbid multiple-choice on load-bearing probes.
- **Approval-marker generation** — the `/approve-spec` (and other consent) marker is generated *from* a
  ledger entry whose reasoning + risk-acceptance entered through the forge-proof channel (Ledger #0002:
  "the authorization marker is generated *from* a ledger entry, not written alongside it"). This is a
  **retrofit** of the highest-class gate first (spec approval), leaving trivial gates as direct authorization.
- **`workflow.json`** — `skip_brainstorm` becomes Class-driven (Class D skips; Class A–B cannot).
- **`seed.md` amendment** — encode the Governance Class model + the evidence ladder into the constitution.
- Record the adoption in `decisions.md` (the model itself is already Ledger #0002-approved).

## Acceptance criteria

1. A Class-A / UI-touching decision cannot reach `/approve-spec` without evidence of the **required shape**
   for its class (presence + provenance-checked).
2. The critic asks **open questions, never multiple-choice**, on load-bearing probes.
3. The Governance Class has a **mechanical floor** derived from blast radius; Claude can raise it, and there
   is no code path by which Claude lowers it below the floor.
4. AI-assisted evidence is accepted equally (no method penalty); the check is shape + presence + provenance.
5. **Risk acceptance** is recorded only through the forge-proof channel; it is never AI-authored.
6. The system stores evidence but **does not grade reasoning quality** (no score, no pass/fail on wisdom).

## Honest limits (state, don't over-promise)

Provenance + shape make non-thinking *expensive and visible*; they cannot *mechanically guarantee* the human
understood (that would require grading, which D7 forbids). A determined human can still hand-wave — the critic
raises the slope, it is not a wall. The "does the evidence suggest *genuine* understanding" rung (Cognitive
Confidence) is deferred (#0002 Future), and must ride the same provenance substrate when built.

## Constraints / governance

- Baseline-owned, manifest-hashed: `brainstorm`, `discipline.mjs`, consent-gate machinery, `seed.md`.
  Regenerate the manifest (`bash scripts/build-template.sh`) after editing. Hook/consent edits need the
  seed.md §4.1 amendment + user approval (Article VIII).
- Class-A change by its own D8 floor — run it through the baseline's own gates.

## Cross-references

- `office/docs/vision/decision-ledger-0002-governance-sufficiency-model.md` — the approved model (D1–D8, ladder, provenance).
- `office/docs/vision/baseline-v2-deliberation-system.md` — approval-is-not-review, the Decision Ledger.
- `docs/handoff/spec-quality-floor.md` (CO-B) — the spec artifact where the bar the critic elicits is encoded.
- `docs/handoff/quality-oracle.md` (CO-C) — the enforcement half that consumes the better specs this produces.
