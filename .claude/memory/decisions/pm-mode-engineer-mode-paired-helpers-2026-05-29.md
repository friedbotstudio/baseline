---
key: pm-mode-engineer-mode-paired-helpers-2026-05-29
category: decisions
scope: [spec]
source: user-instruction
decision: Entry phases (`/intake`, `/spec`, `/tdd`) gain a **PM-mode brainstorm helper** at Step 0.5 that captures requirements via Socratic dialogue before any template-fill — and `/spec` separately gains an **Engineer-mode codesign** internal mode at Step 1.5 that proposes technical approaches and captures engineer verbatim rationale when overridden. The two are paired but independent: brainstorm is unconditional (opt-out via `workflow.json → skip_brainstorm`), codesign is opt-in via `workflow.json → codesign_mode`. Both ship in the same commit but serve different stages of the question-to-code path.
---

- verbatim:
  > "What we want is the 1st stage brainstorms with the user to capture the requirement cleanly before jumping on the solution layer. This is more important problem to solve"
  > "this is good but what I am seeing here (and you might remember) this is very close to PM mode. One additional layer we can add to the brainstorm is assisted coding feature where the actual technical solution is presented to engineer and engineer may approve or suggest an alternative. This may not be needed in all scenarios but in some complex domain problems like computer vision, or when we are designing a new algorithm etc."
- Rationale: the pre-feature intake skill walked template sections sequentially (Problem → Goal → AC), forcing premature commitment to a problem shape; solution-shaped phrasings ("make X faster") leaked through unchecked. The PM-mode helper interposes a Socratic dialogue (actor, trigger, current state, desired state, non-goals, solution-leakage detection) before any template opens. Symmetrically, `/spec` previously made all load-bearing technical decisions unilaterally based on `/research` candidates; for complex-domain problems (CV, novel algorithms, numerical methods, consensus) the engineer's expertise wasn't consulted until `/approve-spec`, which is too late to capture verbatim rationale on overrides. Engineer-mode codesign brings that dialogue forward.
- Rejected alternatives:
  - **Separate `/codesign` phase as Phase 3.5** with its own artifact `docs/codesign/<slug>.md` — user rejected during pre-triage architectural conversation; adds a phase row, triage logic, archive entry, state file for marginal separation. Unification into `/spec` Step 1.5 preserves the existing `/approve-spec` gate.
  - **Mirror design-ui's 5-stage skeleton verbatim for brainstorm** — Stage 2 semantic mismatch (brainstorm is multi-turn probing, design-ui's Stage 2 is recipe translation). Specialized 4-stage protocol chosen instead.
  - **Inline codesign mid-`/spec` drafting** — breaks the "draft each diagram first" invariant in `spec/SKILL.md:31`; harder to compose with `spec_diagram_presence_guard`.
  - **Auto-modify `workflow.json` from `/research` when codesign recommended** — violates Article II "decisions live in main context"; user remains the decider via subsequent `/triage --codesign` or manual edit.
- How to apply: when adding a new entry-point phase, gate it through `Skill(brainstorm)` at Step 0.5 with `workflow-defaults.mjs → withDefaults` for read-time defaults. When a spec author needs engineer collaboration on technical approach, set `codesign_mode: true` in `workflow.json` and `/spec` Step 1.5 fires. When `/integrate` fails with `needs spec change` AND `codesign_mode: true`, `harness/codesign-reentry.mjs` writes `revisit_context` for the next `/spec` invocation to revisit a named decision (cap 3 revisits per decision).
- Source: archived bundle at `docs/archive/2026-05-29/brainstorm-and-codesign/` (spec, security, intake, scout, research, spec.approved).
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
