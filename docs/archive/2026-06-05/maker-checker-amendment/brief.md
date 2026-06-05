# Brief — maker-checker-amendment

Captured via `Skill(brainstorm)` on 2026-06-06 (intake-full track, amendment `-c732`). Primary input for `/intake` (task #1). Builds on the archived PoC brief at `docs/archive/2026-06-05/maker-checker-poc/brief.md`.

## Actor

The baseline maintainer who ratifies the constitutional change, and behind the change the main-context workflow orchestrator (Claude) that will run the governed maker + oracle-bound checker once `seed.md §II.A` legalizes it.

## Trigger

The PoC produced three-axis evidence — (1) a maker→checker round-trip completes on the Workflow runtime, (2) `swarm_boundary_guard` + `verify_pass_guard` were observed firing in the maker context (governance is live, not assumed), and (3) the checker emitted at least one mechanically-grounded finding (a real oracle/proof artifact, not an opinion). With governance proven live, Article II's current text still forbids any maker, so the bounded experiment cannot legally run beyond the throwaway PoC spike until `§II.A` is amended.

## Current state

- `seed.md §II.A` / Article II ships **exactly one** subagent (`swarm-worker`), whose sole sanctioned use is running `Skill(scenario)` then `Skill(implement)` against a fully-specified recipe inside an isolated worktree during `/swarm-dispatch`.
- Subagents SHALL NOT make design decisions, pick abstractions, or expand scope. There is **no** sanctioned maker/checker (adversarial, oracle-bound review) loop.
- No constitutional text authorizes a governed maker or an oracle-bound checker on the Workflow runtime.

## Desired state

An approvable `seed.md §II.A` amendment that:

1. **IS the definitive charter** — it absorbs the previously-separate `-9360` "full Article II rewrite" label. There is no separate later charter to write; `-c732` is the real, approvable amendment.
2. **Installs a BOUNDED exception** with hard, immutable caps encoded in the text:
   - exactly **one** governed maker + **one** oracle-bound checker (no fan-out, no waves, no panel, no second maker/checker);
   - on the **named** Claude Code dynamic Workflow runtime;
   - **governed by the existing PreToolUse hooks** (the experiment runs inside the constitution's enforcement layer, never ungoverned).
3. **Carries a graduation gate** — the text names the evidence/decision under which a FUTURE permanent Article II rewrite would make the maker/checker provision permanent. Until that future amendment lands, the provision remains a **bounded exception**, not a permanent architectural rule.
4. Is **mechanically correct** as a constitutional amendment: edit `docs/init/seed.md` FIRST (Art I.4), carry the four mirror files in the write_set (`docs/init/seed.md`, `CLAUDE.md`, `src/CLAUDE.template.md`, `src/seed.template.md`), and respect the `landmines.md` constitutional-amendment tripwires (CLAUDE.md byte budget, seed.template parity, python3 line-ledger).

## Non-goals

- The full agent-team architecture, the tier dial (`-1a2d`), the mutation oracle (`-f029`), the durable plan schema (`-424f`), the gate taxonomy / debugging skill / v2 (`-9008`) — all remain separate backlog pieces.
- More than one maker and one checker. No fan-out, no waves, no panel.
- **Writing the future permanent Article II rewrite itself.** This amendment only NAMES the graduation criteria for it; it does not author it.

## Decisions captured (this dialogue)

- **Boundedness = scope caps + graduation gate.** The `§II.A` text fixes immutable caps (1 maker + 1 checker, named runtime, governed by existing hooks) AND names the evidence/decision that would graduate the experiment into a permanent rewrite. The bound is "this stays an exception until criteria Y are met and a full amendment lands."
- **`-c732` has absorbed `-9360`.** This amendment IS the full charter now; the prior brief's split (minimal-now `-c732` / full-later `-9360`) is superseded. The graduation gate therefore points at a *future* permanent rewrite, not at the retired `-9360` label.

## Open questions

- The precise **graduation criteria** — what specific evidence/decision triggers the future permanent rewrite — needs sharpening in scout/research/spec.
- Whether boundedness needs a **numeric or temporal backstop** (commit-count, date, re-ratification clause) IN ADDITION to the graduation gate, or whether the graduation gate alone is sufficient. Flagged for `/spec`.

## Notes

The request is heavily solution-shaped (maker / checker / Workflow runtime / oracle-binding / hooks) **by design** — it encodes decisions made across prior sessions plus two empirical probes (worktree isolation, hooks-fire-in-workflow) and the archived PoC's evidence. Recorded as decisions already made, not unexamined solution leakage to unwind.
