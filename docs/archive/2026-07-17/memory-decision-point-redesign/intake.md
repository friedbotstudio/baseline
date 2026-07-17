# Redesign the project memory system as a graph-indexed, one-fact-per-file store that surfaces lessons at the decision point

<!--
Intake document. Produced by the `intake` skill.
Brief: docs/brief/memory-decision-point-redesign.md
Subsumes: backlog -7f3a (memory-system-redesign-...-at-decision-point), roadmap T4.
-->

## Problem

The project memory at `.claude/memory/` is seven fixed files, each capped at 500 lines, loaded wholesale into context at session start. Two failures follow from that shape:

1. **Passive archive, not active guard.** A captured lesson only helps if some phase happens to open the file holding it. The proof is backlog `-7f3a`: the outcome-AC anti-pattern was written as `AC-007` during `power-track-completion`, explicitly re-recorded during `harden-power-track-debt`'s memory-flush — and still recurred one workflow later as `AC-011`/`AC-012`, caught only when `drift_check` wedged again. The lesson was captured, acknowledged, re-recorded, and did not prevent the next occurrence. Nothing surfaced it at spec-authoring time, which is exactly where it would have stopped the mistake.

2. **The 500-line cap forces destructive pruning of real history.** `landmines.md` is already over cap at 502 lines; the bounding rule says the next write there must delete the oldest unverified entries. Growth trades away memory. There are 191 entries today across the canonical files, and the store is designed to keep accumulating.

The store also loads every entry's body upfront when only a fraction is ever relevant to a given session.

## Goal

Project memory becomes a store that holds unbounded knowledge cheaply and surfaces the *right* captured lesson as an active constraint at the moment a decision is made — instead of a passive archive that only helps if a phase happens to read the right file.

## Non-goals

- **Claude Code's session-level user memory** (the `MEMORY.md`-indexed store *outside* `.claude/memory/`) is not touched — this redesign is scoped to the project memory that travels with the repo, plus its gitignored continuity classes.
- **The content and meaning of existing lessons are not rewritten.** Migration of the ~191 entries is lossless — same facts, same provenance, new storage shape.
- **No runtime dependency and no external graph database.** The index and store stay plain files; the baseline zero-runtime-dep posture (seed.md U6) holds.
- Not changing the seven skills' *ownership* of what they write (scout writes landmarks, research writes libraries, …); the redesign changes *where and how* those facts live, not who authors them.

## Success metrics

- **Largest single memory file** — baseline: 587 lines (`landmarks.md`), 502 (`landmines.md`, over cap); target: no fact file exceeds a small per-fact bound, so the cap-forced-prune failure mode no longer exists — measured via `wc -l` across the store.
- **Upfront context at session start** — baseline: full bodies of 191 entries injected; target: index-only injection (bounded regardless of store size), body fetched on scoped traversal — measured via the `memory_session_start` injection size.
- **Lesson honored at the decision point** — baseline: `-7f3a` recurrence (anti-pattern recurred despite being recorded twice); target: the phase-scoped lesson is surfaced (verbatim) before the relevant write — measured via a regression scenario that reproduces the outcome-AC case and asserts it surfaces at spec-authoring time.
- **Migration fidelity** — baseline: 191 entries with `source:`/`verbatim:` provenance; target: 191 migrated, 0 entries dropped, 0 verbatim lost — measured via a migration audit.

## Stakeholders

- **Requester**: Tushar Srivastava (maintainer)
- **Reviewer**: Tushar Srivastava (gate-A `/approve-direction` approver)
- **Operator** (who runs it in prod): the Claude Code harness and phase skills that read/write memory each session, plus the memory hooks (`memory_stop`, `memory_session_start`, `memory_pre_compact`)

## Constraints

- **Governance precedence (Art. I.4).** Article IX enumerates the seven canonical files by name, so this change amends the constitution: the `docs/init/seed.md` amendment leads, then `CLAUDE.md`, then `.claude/memory/README.md`, then the `src/*.template.md` byte-equal mirrors, then the audit manifest. `CLAUDE.md` stays ≤ 40,000 chars and byte-equal to `src/CLAUDE.template.md`.
- **The memory hook fleet rebinds, it does not break.** `memory_stop`, `memory_session_start`, and `memory_pre_compact` must continue to function against the new model; the redesign covers the canonical files **and** the continuity classes (`_resume`, `_thread`, `_pending`).
- **Provenance semantics survive.** Re-verify-before-cite (Art. IX.2) and verbatim-wins (Art. IX.6) must hold in the new store — the `source:`/`verbatim:` contract is not weakened.
- **Both consumers, machine-weighted.** The store must stay navigable by a human in vault tooling (resolvable wikilinks, individually readable per-fact files) while the index format is optimized for cheap machine context injection. Where the two conflict, machine-traversal wins.
- **`audit-baseline` must pass** after the change — manifest hashes for any shipped skills/templates reconcile against disk.

## Acceptance criteria

1. Given a canonical memory fact, when it is stored, then it lives in its own file (one fact per file) — no shared file accumulates multiple entries toward a line cap.
2. Given session start, when memory loads, then a graph **index** is injected (nodes + links), not the full entry bodies; an entry body is retrieved only when traversal reaches it.
3. Given a phase at its decision point (spec-authoring is the reference case), when the phase is about to make the relevant write, then entries scoped to that phase are surfaced verbatim before the write — reproducing the `-7f3a` outcome-AC case and asserting it now surfaces at spec time.
4. Given the store grows to an arbitrary entry count, when any file is written, then no single file exceeds its bounded per-fact size — the cap-forced destructive prune of `landmines.md` no longer occurs.
5. Given the ~191 existing entries across the seven canonical files, when migrated, then every entry's `source:` and (where required) `verbatim:` provenance is preserved — 0 dropped, 0 verbatim lost, verified by a migration audit.
6. Given the redesign lands, when the store is inspected, then the seven canonical files **and** the continuity classes (`_resume`, `_thread`, `_pending`) are represented in the new model, and Claude Code's session-level user memory is unchanged.
7. Given the model change, when it lands, then `seed.md`, `CLAUDE.md` Article IX, `.claude/memory/README.md`, and the `src/*.template.md` mirrors describe the new model consistently, and `audit-baseline` exits 0.
8. Given the store opened in human vault tooling, when a wikilink is followed, then it resolves to the linked fact file — the store stays human-navigable.

## Open questions

<!-- Resolved by the discovery phases (scout / research / spec), not user-blocking for /scout. -->

- **Graph index shape** — node/edge/scope-tag format, and how each entry declares the phase-scope that makes traversal targeted. (research → spec)
- **Recurrence escalation** — `-7f3a` direction (b): a lesson that fires across N distinct workflows auto-graduates up the enforcement funnel. Whether the first-class requirement is the surfacing (AC-3) alone or also the auto-graduation, and whether escalation ships in the first slice or defers. (spec)
- **Migration cutover** — big-bang replacement vs incremental/dual-read during transition, and how the hooks read both shapes mid-migration. (spec → rollout)
- **Injection seam per phase** — the mechanism by which a phase skill queries its scoped entries (analogous to how `process_lifecycle_guard` surfaces a landmine inline before a matching Bash call). (spec)
- **Epic re-triage** — whether this decomposes into ≥ 3 separately-committed slices (storage-model + migration / graph-index + traversal / decision-point injection / governance amendment). If the spec firms that up, re-triage `intake-full` → `epic`. (spec)
