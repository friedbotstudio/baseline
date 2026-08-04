# Brainstorm brief — living-system-model

## Actor

The engineer maintaining a baseline-governed codebase, and the Claude Code session acting on their behalf — specifically `scout` at Phase 2, and any phase about to edit a path the model governs.

## Trigger

- Every new workflow cycle, when the system model is re-derived from scratch because the previous cycle's model was archived with its spec.
- At diagnosis or edit time, when someone needs to know why code is shaped the way it is and the rationale is not recoverable from the code.
- When a constraint the codebase rested on changes, while decisions made because of it are still standing.

## Current State

- Each spec cycle re-derives the system model, uses it once, and archives it to `docs/archive/`. `scout` exists as a phase because the model is not durable.
- `.claude/memory/decisions/` carries a good record format (Decision / Rationale / Rejected alternatives) but is keyed by slug, not by path — there is no reverse index from a file to the decisions governing it.
- Decision entries declare `scope: [spec]`, so they surface when a new spec is written and never at diagnosis time.
- Decision expiry is age-based: 26 of 30 entries read stale under a predicate designed for landmarks, whose `path:line` pointers genuinely drift. A decision does not rot with age.
- No constraint nodes exist. Architectural constraints of the existing codebase are discoverable only by re-running scout.
- Structural and protocol knowledge lives in each spec's `## Design` section as PlantUML sequences, and is archived per slug.
- `memory_stop.mjs` reads only the session transcript and `_pending.md` — no canonical read, no discard ledger — so a candidate promoted or discarded at one flush is re-derived as fresh at the next.

## Desired State

- PRIMARY (owner-stated success signal): when about to change code, the reason it is shaped that way arrives unprompted, including the alternatives already rejected.
- A durable, indexed, linked model that each cycle contributes to — add / remove / update — rather than rewrites from scratch.
- Two link semantics at different altitudes: structural links (component→diagram, path→component) are a trail with lookup semantics only; constraint→decision is the one proof-carrying edge, where a flipped constraint invalidates every decision that rested on it.
- `scout` reconciles the durable model against the slice being touched rather than rediscovering the system.
- Decision expiry driven by supersession rather than elapsed commits or days.

## Non Goals

- No new workflow track (owner-stated, vision note §1.12).
- No implementation of slices A–F in this workflow — the `epic` track is discovery-only; each slice runs later as a separate `epic-child`.
- `faithful-capture` is already shipped (vision note Part 4) and is not reopened here; it is an input to slice D's extraction discipline, not scope of this epic.

## Solution Leakage

- The request names solution shapes: "model", "decision graph", and the downstream ADR / C4 / UML / knowledge-graph / index vocabulary.
- Captured rather than probed away: the underlying need is separately and explicitly stated at vision note §1.8 (two maintenance risks — misdiagnosis with bug reintroduction, and re-architecting what could have been a one-line fix — both reducing to a missing decision trail) and §1.2 (per-cycle re-derivation cost). The solution shape is deliberate multi-session design work, not an unexamined jump from problem to tool.
