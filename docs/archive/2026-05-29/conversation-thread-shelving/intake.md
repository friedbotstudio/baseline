# Durable local conversation-trail with context-switch shelving for the memory system

<!--
Intake document. Produced by the `intake` skill.
Primary input: docs/brief/conversation-thread-shelving.md (brainstorm brief).
Source backlog: shelve-conversation-on-context-switch-with-verbatim-cues-b7e2 (primary),
llm-assisted-memory-capture-routing-cf4a (companion, out of scope here).
-->

## Problem

A developer working in this repo across Claude Code sessions loses the "what were we working on, and why" narrative whenever they pivot to a higher-priority task mid-session, run `/clear`, hit context compaction, or run `/memory-flush`. The only continuity artifact today is `_resume.md`, which is **per-turn-overwritten and gitignored** — it captures the *latest* turn's snapshot, not a durable thread. `/memory-flush` curates and resets `_pending.md`. There is no concept of a mid-session work-thread *transition*: the workflow model knows only phase-advance and end-of-workflow flush.

Concrete scenario observed this session: after a `/clear`, recovering "what we were working on before the CLAUDE.md size issue" required hand-reconstruction from the ephemeral `_resume.md` snapshot — exactly the work the developer wants to never repeat.

## Goal

A developer can shelve the current line of work and later resume it — across sessions and across `/memory-flush` — without manually reconstructing where things stood.

## Non-goals

- **Not committed to git.** The trail stays local to the developer; committing it would introduce cross-developer noise (user's explicit reasoning, 2026-05-30).
- **Not the whole transcript.** A shelve captures a summary plus verbatim cues only ("even if not the whole conversation").
- **Not multiple discrete resumable threads.** A *single rolling trail*, to avoid duplicating what `backlog.md` already does for discrete future-work items (user: "I can see benefit in having multiple threads, but then what's backlog doing? So, it should be single rolling trail").
- **Not a change to the committed/canonical memory model.** This is a new *local* memory class beside the seven canonical files — neither committed nor flush-curated. Any change to the *committed* memory taxonomy would require a `seed.md` amendment (Art. I.4) and is out of scope.
- **LLM-assisted capture-time extraction/routing** (backlog `cf4a`) is out of scope — a separate follow-up workflow.

## Success metrics

- Manual continuity reconstruction after a pivot or `/clear` — baseline: hand-reconstructed from `_resume.md` (this session), target: a single `/resume` surfaces it, measured via: dogfooding the feature on this repo's own workflows.
- Trail survival across `/memory-flush` — baseline: narrative lost, target: 100% of trail content retained, measured via: the AC-1 regression test.
- Trail kept out of commits — baseline: n/a, target: 0 trail-content bytes staged on any commit, measured via: AC-2 test + `.gitignore` assertion.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner, `razieldecarte@gmail.com`).
- **Reviewer**: Tushar Srivastava (owns the constitution + memory-system design; approves the spec at gate A).
- **Operator** (who runs it in prod): each developer running the baseline harness locally — the trail is a per-developer local artifact, so the operator is the same person as the end user.

## Constraints

- **Memory-model boundary (Article IX).** The new class is local-only; it must not write into the seven canonical files outside the existing `/memory-flush` path, and must not alter the committed memory taxonomy.
- **Stop-hook coexistence (Article VIII).** A switch-detector at the `Stop` event must coexist with the existing `memory_stop` and `harness_continuation` Stop hooks without breaking their gates (e.g., `harness_continuation`'s three-rung gate, `stop_hook_active`).
- **Human-in-the-loop (Article IX.3).** An auto-detected switch must stage/confirm rather than silently write — auto-routing stages for review.
- **Background-worker discipline (Article II).** Any background worker executes a pre-decided recipe (summarize active thread + append cues); it makes no design decisions and expands no scope.
- **On-disk shape parity.** The trail file follows the `_pending.md` pattern: content gitignored, file structure committed.
- **All 22 hooks remain active.** This feature adds capability; it removes no enforcement.

## Acceptance criteria

1. Given a populated rolling-trail file, when `/memory-flush` runs (including its reset of `_pending.md`), then the trail file's existing content is unchanged (durable across flush).
2. Given the rolling-trail file, when the repo is committed, then none of the trail's *content* is staged or committed (gitignored content; only file structure is tracked, mirroring `_pending.md`).
3. Given an active work-thread, when the developer runs `/shelve`, then one entry is appended to the single rolling trail containing all four: a summary of where the thread stood, verbatim cues, open questions, and in-flight files + next step.
4. Given a turn-end where the current turn's subject diverges from the active thread, when the Stop-hook switch-detector fires, then a shelve is *proposed* through a human-in-the-loop confirm and is not silently written (auto-detect path honors Article IX.3).
5. Given a populated trail, when the developer runs `/resume`, then the most-recent thread's summary + verbatim cues + open questions + in-flight files/next step are surfaced into context, so work continues without manual reconstruction.
6. Given multiple shelve-events over time, when they are recorded, then they append to one single rolling trail file (not separate per-thread files) — the single-rolling-trail invariant.
7. Given verbatim cues captured at shelve time, when they are surfaced at resume, then the user's exact wording is preserved literally (Article IX.6).

## Open questions

- Bounding / lifecycle: the trail is durable and never auto-wiped by `/memory-flush` — how is unbounded growth kept readable over time (size cap? roll-off of oldest sections? periodic curation)? Resolve in `/spec`.
- Auto-detect signal: what distinguishes a genuine topic/feature switch from a normal follow-up turn, and how is a false-positive shelve made cheap to undo? For `/research` + `/spec`.
- Relationship to `_resume.md`: does the rolling trail subsume `_resume.md`, or sit beside it (trail = durable narrative; `_resume` = per-turn ephemeral snapshot)? For `/scout` + `/spec`.
- Confirm surface for auto-shelve: per Article IX.3, what is the human-in-the-loop confirm surface for an auto-detected switch (turn-end `AskUserQuestion`? a staged entry the developer reviews on next turn)? For `/spec`.
