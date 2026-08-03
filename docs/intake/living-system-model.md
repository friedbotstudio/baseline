# Make architecture memory durable, so the reason a piece of code exists reaches whoever changes it next

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/living-system-model.md (brainstorm, 2026-08-04).
Direction: docs/vision/living-system-model.md (vision note, not a spec).
Epic slices: .claude/state/epic/living-system-model.json
-->

## Problem

Two failures, one cause.

**At diagnosis time, the reason code is shaped a given way is unreachable.** An engineer opens a file to fix a bug. Nothing tells them whether the shape in front of them is forced by a constraint or is arbitrary, and nothing tells them which approaches were already tried and rejected. Two concrete outcomes follow: an approach that was rejected for a known reason gets re-proposed and the original bug returns; or a shape that was load-bearing gets re-architected when a one-line change was correct.

The records that would answer this already exist and are well-formed — `.claude/memory/decisions/` entries carry Decision, Rationale, and Rejected alternatives. They are unreachable for three verified reasons:

- They are keyed by slug (`auth-jwt-vs-session`), not by path. `landmines.md` keys are `path:line`; decisions have no reverse index from a file to the decisions governing it.
- They declare `scope: [spec]`, so `process_lifecycle_guard` surfaces them when a *new spec* is being written and never when source is being edited. Maintenance is not a workflow phase, so it cannot be a scope value.
- Their expiry is age-based. 26 of 30 entries read stale under a predicate designed for landmarks, whose `path:line` pointers genuinely drift. A decision does not rot with age — it is superseded or it stands.

Nothing records constraints at all. "No SSO support" is discoverable only by re-running scout, and when such a fact changes, every decision that rested on it stays standing and unexamined.

**At the start of every cycle, the system model is re-derived from scratch.** Each spec's `## Design` section holds the C4 and sequence diagrams for the slice it touches, and archives them to `docs/archive/` with the rest of the spec. `scout` exists as a phase *because* that model is not durable: it walks the codebase to build a map that dies with the workflow, and the next cycle walks it again. Durable knowledge is being stored in transient, per-slug containers.

A supporting defect in the capture path: `memory_stop.mjs` reads only the session transcript and `_pending.md`. It never reads canonical memory and keeps no discard ledger, so a candidate promoted or discarded at one `/memory-flush` is re-derived as fresh at the next (observed 2026-08-04). Curation decisions do not stick.

## Goal

When an engineer is about to change a piece of code, the reason it is shaped that way — including the alternatives already rejected and the constraints it rests on — reaches them without their going to look for it.

## Non-goals

- **No new workflow track.** Once the model is framed in terms of decisions and decision trails, prototype→promotion becomes a direct logical approach and the bulk of spec writing may dissolve, or remain only for production-code planning. Adding a track ahead of that would build on a shape that is about to change.
- **No implementation of slices A–F in this workflow.** The `epic` track is discovery-only; it produces a sliced spec under one approval. Each slice runs later as a separate `epic-child`.
- **`faithful-capture` is not reopened.** It shipped during the design conversation and is an input to slice D's extraction discipline, not scope of this epic.
- **The existing seven canonical memory categories and the sharded storage shape are not replaced.** This work extends them; a migration that invalidates existing entries is out of scope.

## Success metrics

- **Decisions surfaced at edit time on governed paths** — baseline: 0 (entries declare `scope: [spec]`, so none surface on a source edit), target: a governed path surfaces its governing decisions before the edit completes, measured via the surfacing hook.
- **Decisions reported stale by age alone** — baseline: 26 of 30, target: 0 under a supersession-driven predicate, measured via `memory_session_start`'s stale count.
- **Constraints with invalidation edges to dependent decisions** — baseline: 0 (no constraint nodes exist), target: every decision whose rationale cites a constraint carries the edge, measured by walking the decision corpus.
- **Curation decisions that survive one turn** — baseline: 0 (candidates re-derive every turn), target: a promoted or discarded candidate is not re-emitted as fresh, measured by running `/memory-flush` twice with no intervening work.
- **Cycle re-derivation** — baseline: `scout` walks the codebase every workflow, target: `scout` reconciles a slice against the durable model, measured by whether a second cycle over the same subsystem reads fewer files than the first.

## Stakeholders

- **Requester**: Tushar Srivastava — project owner and sole maintainer of this baseline repo.
- **Reviewer**: Tushar Srivastava — the gate-A approver for this epic; one approval covers all six slices.
- **Operator** (who runs it in prod): Tushar Srivastava for this repo, plus downstream baseline consumers who receive these changes through `create-baseline` install and upgrade. Consumer-facing surface makes manifest, count, and template-mirror obligations binding (Article XII).

## Constraints

- **Article II** — decisions live in main context. This work adds no subagent; read-only advisory subagents may gather, but never decide or write.
- **Article IX** — promotion to canonical memory is human-curated via `/memory-flush` only. Entries sourced from user instruction or feedback require a verbatim blockquote, and verbatim outranks interpretation on conflict.
- **Article XII** — any new baseline-owned skill requires `owner: baseline`, regenerated `manifest.files` sha256, and a skill-count bump in CLAUDE.md, the annex Appendix B, and the Article III session-start greeting. A count drift is a hard `audit-baseline` FAIL.
- **CLAUDE.md is capped at 40,000 characters** and carries binding rules only; narration belongs in the annex. The cap binds the byte-equal mirror `src/CLAUDE.template.md`.
- **Article VI.5** — the prior-art review at `/research` verifies against current documentation, not training recall.
- **Epic track is discovery-only.** No `tdd`, `simplify`, `security`, `integrate`, or `document` node exists in this DAG; those are excepted and run on the children per each slice's `risk[]`.
- **The parked stale sweep depends on slice A.** 173 stale entries were deliberately left unswept on 2026-08-04 because the age-based predicate is wrong for decisions. Slice A's expiry model is the prerequisite for that cleanup.
- **`.claude/hooks/**` is in `security.sensitive_globs`**, so slices C and D carry a mandatory security review on their child workflows.

## Acceptance criteria

1. Given a decision record that governs a source path, when an engineer edits that path, then the decision surfaces before the edit completes.
2. Given a decision entry older than 30 commits that has not been superseded, when the staleness predicate runs, then the entry is not reported stale.
3. Given a decision record, when it is read, then it states whether the shape it describes is load-bearing (forced by a named constraint) or incidental (free to restructure).
4. Given a decision whose rationale cites a constraint, when that constraint's state flips, then every decision resting on it is surfaced as suspect.
5. Given a structural lookup (component to diagram, path to component, AC to sequence), when it is resolved, then it returns without justification semantics — trail behavior, not proof-chain behavior.
6. Given a candidate promoted or discarded at one `/memory-flush`, when the next turn's capture runs, then that candidate is not re-emitted as a fresh candidate.
7. Given a set of related decisions, when a human must decide something those decisions govern, then a summary sufficient to decide is presented, with a walkable graph reachable when the summary is not sufficient.
8. Given a workflow cycle touching one slice of the system, when `scout` runs, then it reconciles the durable model against that slice rather than re-deriving the whole system.
9. Given code carrying an annotation that links to a decision, research doc, or constraint, when `scout` reads that code, then the linked context resolves.

## Open questions

Resolved during brainstorm and recorded here so downstream phases do not re-open them: the **decision trail vs chain-of-proof** ambiguity (vision §3.2) is settled — structural links are a trail with lookup semantics only, and constraint→decision is the one proof-carrying edge. The **primary success signal** is recall at diagnosis, which orders slices A and C ahead of E.

Still open:

- **How are the indices built?** The originating question (vision §1.1, §3.5) and still the least-developed part. Candidate keys exist (§2.10) but no design.
- **Where does "protocol" live structurally?** A category of its own, a property tagging existing entries, or a derived view with no storage. Each implies a different index (vision §3.4).
- **What keeps the durable model honest?** An archived spec can never be wrong, only historical; a durable model can be wrong, and a wrong model is worse than none because `scout` will trust it and stop looking. Candidate mechanisms (scout-as-reconciliation, deriving what is derivable from code, verify-on-cite) compose, but none is chosen (vision §3.6).
- **Who approves or rejects a decision, and how many need human input to unlock an agentic run?** Article XI.12 arguably already answers the first — record by default with an `owner`, batch-review at gate A, only the closed human's-call category surfaces — but this has not been confirmed (vision §3.1).
- **Is the maintained diagram core C4 plus module diagrams, with flowcharts and BPMN as an optional per-domain tail?** That reading is Claude's, from the "(if needed)" markers, and is unconfirmed (vision §3.3).
- **Is slice E one child or its own epic?** Flagged oversized at triage; to be settled at `/spec` before approval.
- **Does `faithful-capture` R1's quote-check hold when the speaker is a transcript rather than a live person?** The extraction leg reading `_pending.md` has quotes but no surrounding intent. May need a ninth rule; may already be R8's job (vision §3.7).
- **Process drift, unrelated to scope:** the `intake` skill's prerequisite names `track_id == "intake-full"` or legacy `entry_phase == "intake"`, and predates §18.9's `epic` track, whose DAG legitimately begins with an `intake` node. The prerequisite text needs updating.
