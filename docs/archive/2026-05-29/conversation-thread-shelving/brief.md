# Brainstorm brief — conversation-thread-shelving

## Actor

The developer working in this repo across Claude Code sessions. The trail is local to that developer — not shared, not committed.

## Trigger

- A mid-session pivot from one line of work to a different, higher-priority one.
- Loss of continuity across /clear, context compaction, or /memory-flush.
- Session start, when trying to recall 'what were we working on, and why.'

## Current State

_resume.md is per-turn-overwritten AND gitignored, so the 'what we were working on + why' narrative is ephemeral; /memory-flush curates/wipes _pending. There is no concept of a mid-session work-thread transition — the workflow model knows only phase-advance and end-flush. The continuity narrative is lost across /clear or a flush. This very session, it had to be reconstructed by hand from the ephemeral _resume.md snapshot.

## Desired State

A durable, LOCAL (gitignored, never committed) SINGLE ROLLING TRAIL that survives /memory-flush and /clear. Per shelve-event it captures: a summary of where the thread stood, verbatim cues (exact decision wording + the framing that drove them, preserved literally per Article IX.6), open questions, and in-flight files + next step. Shelving fires BOTH automatically when a topic/feature switch is noticed (with a human-in-the-loop confirm) AND on explicit request. Resuming reads the trail so a later session feels continuous without re-deriving the thread by hand.

## Non Goals

- NOT committed to git — the trail stays local to the developer; committing it would introduce cross-developer noise (user's explicit reasoning, 2026-05-30).
- NOT the whole transcript — summary + verbatim cues only ('even if not the whole conversation').
- NOT multiple discrete resumable threads — a SINGLE ROLLING TRAIL, to avoid duplicating what backlog already does for discrete future-work items (user: 'I can see benefit in having multiple threads, but then what's backlog doing? So, it should be single rolling trail').
- NOT a change to the committed/canonical memory model — this is a new LOCAL memory class beside the seven canonical files, neither committed nor flush-curated.
- LLM-assisted capture-time extraction/routing (backlog cf4a) is OUT of scope — a separate follow-up workflow.

## Solution Leakage

- Stop-hook detector that fires a switch-detection check each turn-end.
- Background worker that performs the shelve (summarize active thread + append cues).
- /shelve and /resume slash commands as the explicit-trigger interface.
- A new _thread.md-style file (gitignored content, committed structure like _pending.md) as the trail's on-disk home.
- (All captured per PM-mode protocol; the actual mechanism is /spec's decision, not committed here.)

## Open questions

- Bounding / lifecycle: the trail is durable and never auto-wiped by /memory-flush — how is unbounded growth kept readable over time (size cap? roll-off of oldest sections? periodic curation)? Resolve in /spec.
- Auto-detect signal: what distinguishes a genuine topic/feature switch from a normal follow-up turn, and how is a false-positive shelve made cheap to undo? For /research + /spec.
- Relationship to _resume.md: does the rolling trail subsume _resume.md, or sit beside it (trail = durable narrative; _resume = per-turn ephemeral snapshot)? For /scout + /spec.
- Human-in-the-loop on auto-shelve: per Article IX.3, an auto-detected switch must stage/confirm rather than silently write — what is the confirm surface (AskUserQuestion at turn-end? a stged entry the user reviews)?
