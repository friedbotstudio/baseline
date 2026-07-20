---
name: retrospective
owner: baseline
description: Cycle-end retrospective converting recurring judgment failures into durable enforcement. Reviews the cycle's friction — repeated user corrections, guard trips, RCA themes, integrate failures — and turns each recurring one into a landmines.md entry, then proposes graduation candidates up the enforcement funnel (landmine → advisory hook → hard gate). Pairs with standup: standup says what shipped and what's next; retrospective says what kept going wrong and how to stop it structurally. Writes only memory entries and a report — graduation proposals are advisory and require the normal seed.md amendment path to become enforcement. Invoke at the end of a release cycle, an epic, or any stretch of work with repeated friction.
---

# retrospective — from recurring friction to structural enforcement

The baseline's enforcement funnel has three rungs: a **landmine** (a remembered failure pattern surfaced by advisory memory hooks), an **advisory hook** (a PreToolUse hook that surfaces the landmine inline before the risky call), and a **hard gate** (a blocking hook or consent gate). Friction that recurs should climb this funnel instead of being re-litigated every session. This skill is the climb's entry point.

**This skill is a generator, not a workflow phase.** It enters no Track Guard ordering and blocks nothing. It writes ONLY memory entries (via the canonical entry shape) and an inline report. It never edits hooks, never touches `seed.md`/`CLAUDE.md`, never creates enforcement — those are amendment-path changes the user drives.

# Inputs

Gather in main context (Article II — no subagent judgment):

- The cycle window: since the last release tag, the epic's first commit, or a user-named range.
- The `landmines` and `decisions` categories under `.claude/memory/` — what is already recorded. Read them shape-agnostically: a sharded store keeps one fact per file under `<category>/`, a flat one keeps `## key` blocks in `<category>.md`.
- Friction evidence inside the window: guard-trip messages in `.claude/state/logs/` (hook log lines), `docs/rca/*.md` postmortems, integrate-failure yields in `.claude/state/harness/*.log`, and user corrections you can cite verbatim from the session or `_resume.md`.

# Method

## 1. Collect candidate frictions

Sweep the inputs for events that happened **more than once** in the window, or once with high cost (a broken commit, a failed release, a consent near-miss). One-off annoyances are not retro material.

## 2. Classify each recurring friction

- **Already a landmine?** Re-verify the entry (Article IX.2); refresh `last-touched` and strengthen the entry body with the new occurrence.
- **New pattern?** Draft a `landmines.md` entry in the canonical shape (stable key, occurrence citations, `verified-at`, verbatim quote when the source is a user correction).
- **Not memory-shaped** (a spec gap, a missing test)? Route it to `backlog.md` as an entry instead — the retro records it; a future workflow fixes it.

## 3. Propose graduations

For each landmine with ≥ 2 recorded occurrences ACROSS cycles, assess the next rung:

| Current rung | Graduation | What it takes |
|---|---|---|
| landmine entry | advisory hook surfaces it inline (e.g. `process_lifecycle_guard` pattern) | seed.md §4.1 amendment + hook change — user-driven |
| advisory hook | hard block / consent gate | same amendment path, stronger justification |

A proposal names: the landmine key, occurrence count, the proposed rung, the hook/gate shape, and the cost of NOT graduating. It is **advisory** — put it in the report, not in any enforcement file.

## 4. Report

```
# Retrospective — <window>

## Recurring frictions (N)
- <key> — <occurrences, cost, where recorded>

## Memory writes
- <landmines.md/backlog.md key> — new | strengthened | re-verified

## Graduation candidates (advisory)
- <key> — landmine → advisory hook: <one-line shape> — evidence: <counts>

## Not retro material (dropped)
- <item> — <why>
```

# Constraints

- **Memory writes only** — `landmines.md` / `backlog.md` / `decisions.md` in the canonical entry shape, respecting `size-cap: 500` and verbatim-provenance rules (Article IX). No other file writes.
- **No enforcement changes.** Proposing is this skill; amending is the user's seed.md §4.1 path.
- **Evidence or it didn't happen.** Every friction cites its occurrences (log line, RCA path, commit, or verbatim correction). No vibes-based landmines.
- **Read-only outside memory.** No state files, no workflow.json, no consent paths.
