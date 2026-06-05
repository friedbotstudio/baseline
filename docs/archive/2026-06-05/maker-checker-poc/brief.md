# Brief — maker-checker-poc

Captured via `Skill(brainstorm)` on 2026-06-06 (freeform PoC track). Primary input for the retrospective `/spec` (task #4).

## Actor

The workflow orchestrator (main-context Claude) that dispatches a governed maker + oracle-bound checker. Behind it, the baseline maintainer who needs concrete evidence before committing to the v1 thought-compiler build.

## Trigger

The decision to build the v1 maker/checker architecture on Claude Code's rented dynamic Workflow runtime cannot be made until the substrate is proven on three axes at once: functional (a maker→checker round-trip completes), governable (the constitutional PreToolUse hooks fire on workflow agents), and oracle-capable (a checker can produce a mechanically-grounded finding, not an opinion).

## Current state

- Swarm is model-driven, turn-by-turn (Mirror-lite): main context spawns `swarm-worker`s and runs the loop in its own reasoning; control flow is an LLM following the SOP, not deterministic code.
- There is no maker/checker loop — no adversarial, oracle-bound review stage.
- It is unproven whether the Workflow runtime hosts *governed* makers/checkers under the constitution. (Established this session: `tdd_order_guard` DID fire inside a workflow agent, so the hook layer is live; but the load-bearing write/verify guards have not been confirmed in the maker context.)
- It is unproven whether a checker on the runtime can emit a mechanically-grounded finding (a real oracle/proof artifact) rather than a plausible opinion.

## Desired state

A working 1-maker + 1-checker round-trip on the Workflow runtime where:

1. the maker implements against a contract (worktree-isolated), and
2. the checker reviews the maker's output and emits **at least one mechanically-grounded finding** (a real oracle/proof artifact — e.g. a failing test, a structural violation — not an opinion), and
3. **`swarm_boundary_guard` + `verify_pass_guard` are observed firing in the maker context.**

This evidence is what greenlights the real Article II amendment (`-9360`) and the architecture pieces (`-d186`, `-4c43`, `-424f`).

## Non-goals

- The full agent-team architecture, the tier dial (`-1a2d`), the mutation oracle (`-f029`), the durable plan schema (`-424f`), the gate taxonomy / debugging skill / v2 (`-9008`) — all remain separate backlog pieces.
- More than one maker and one checker. No fan-out, no waves, no panel.
- Finalizing the real Article II amendment. This PoC carries only the *minimal* exception text needed to legally run the bounded experiment; the full charter is `-9360`, written from this PoC's evidence.

## Decisions captured

- **Pass bar:** round-trip **+ a grounded finding**. The checker must demonstrate oracle-binding end-to-end (≥1 mechanically-grounded finding), not just prove the plumbing connects.
- **Prototype disposition:** undecided by design — run the spike, then decide keep-as-seed vs throwaway after seeing how clean it comes out.
- **Guard-fail is a BLOCKER (not a soft split):** if `swarm_boundary_guard` or `verify_pass_guard` does NOT fire in the maker context, halt and re-evaluate the entire Hybrid direction before `-9360`. Governance integrity is non-negotiable — makers will not silently run ungoverned.

## Open questions

- Prototype keep-vs-throwaway (resolved after the spike, per the disposition decision above).

## Notes

The request is heavily solution-shaped (maker / checker / Workflow runtime / Hybrid / Mirror-lite). This is recorded as **decisions already made this session**, grounded in research + two empirical probes (worktree isolation, hooks-fire-in-workflow), not as unexamined solution leakage to unwind.
