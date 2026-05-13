# Close the loop on the memory lifecycle so resolved and stale entries don't linger

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The project memory system at `.claude/memory/` has a one-way ingest path (`memory_stop.sh` → `_pending.md` → `/memory-flush` → canonical) but no symmetric closure path. Entries that get implicitly resolved by later work stay on disk indefinitely, and the system's stale-detection signal is too coarse to act on.

Concrete recent incident (2026-05-13, this session):

- `pending-questions.md` carried three entries. **Q-002** (raised 2026-04-29 during the `site-react-ssg-seo` workflow) contained the line `**Resolution path taken (2026-04-29 ~16:35 UTC):**` inside its body and ended with `Site is now shippable per /integrate re-verdict`. **Q-003** (raised 2026-05-12 about harness pause behavior) was implicitly resolved by the `harness-active-marker` workflow that landed the same day and removed the runtime-semantics bug it described. Both lingered for ≥ 14 days as live questions until the user manually deleted them today.
- The SessionStart index reported `stale (>=30 commits old): 0` per file because `verified-at: HEAD` resets on every flush, so the count never flagged them as candidates for review.
- `/memory-flush` Step 2 enumerates outcomes as `Promote | Discard | Defer` — all three apply to *incoming* candidates in `_pending.md`. There is no `Close` outcome for *existing* canonical entries.

This is not a one-off — it's a structural gap: the self-healing contract (CLAUDE.md Article IX clause 2; README.md §Self-healing) only fires when a skill **cites** a memory entry, and `pending-questions.md` entries are never cited by phase skills, only read as part of the session-start index. So they never trigger self-heal regardless of how stale they are.

## Goal

Closed questions and resolved entries leave canonical memory automatically (or surface for one-shot review), so the running set of "open" knowledge is genuinely open and the user never has to manually audit `pending-questions.md` again.

## Non-goals

- Inventing a new "memory archive" file or directory. Closed entries leave canonical files; they do not move to a graveyard.
- Backfilling provenance (`source:` + `verbatim:`) for pre-schema-bump entries. The schema-drift gap surfaced today is acknowledged in Open questions but is out of scope here.
- Re-architecting the citation-driven self-heal contract. Self-heal stays as-is for cited entries; this work adds a parallel sweep path for entries that never get cited.
- Adding new hooks. The three existing memory hooks (`memory_session_start`, `memory_stop`, `memory_pre_compact`) plus the `memory-flush` skill are the only surfaces in scope.
- Changing the gitignore policy on `_pending.md` / `_resume.md`.

## Success metrics

- Entries containing structured resolution prose (a `resolved-at:` field OR a `Resolution path taken:` / `Resolved by:` line in the body) leave `pending-questions.md` within one `/memory-flush` invocation after they're marked resolved — baseline: never; target: same-session; measured via: a regression test that asserts the entry is gone after `/memory-flush` runs.
- The SessionStart index lists each stale entry's stable key (not just a count) when `stale > 0` — baseline: count-only line; target: per-entry list capped at top-N (default 5) with overflow indicator; measured via: a hook-output assertion on a fixture memory tree.
- `/memory-flush` Step 2 outcomes grow from 3 (promote / discard / defer) to 4 (+ close); the skill's report names how many canonical entries were closed each run — baseline: skill ignores canonical; target: report shows `Closed (M)` block; measured via: skill SOP review + an end-to-end run on the fixture.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner; raised the gap after manually pruning Q-002/Q-003 today).
- **Reviewer**: razieldecarte@gmail.com — single-operator project; spec approval gate (Article IV gate A) is the formal review.
- **Operator**: razieldecarte@gmail.com — runs `/memory-flush` and reads the SessionStart index every session.

## Constraints

- **Schema additions must be optional.** The 23 existing entries across the six canonical files (none of which carry a `resolved-at:` today) SHALL remain valid. Backwards compatibility check is part of the spec.
- **Preserve provenance.** README.md §Source provenance mandates `source:` on every entry and `verbatim:` for `user-instruction` / `user-feedback`. Any new field SHALL slot into the existing per-entry shape without displacing the verbatim blockquote.
- **Respect size-cap and decay rules** from CLAUDE.md Article IX clause 5 (`size-cap: 500`, ≥30 commits / ≥90 days = stale). Closure SHALL NOT shortcut decay — a still-open question past 90 days is stale, not closed. Closure and decay are different lifecycles.
- **Non-git project.** This codebase is not a git repo today (`git rev-parse --is-inside-work-tree` exits 128). Decay rules referencing "commits behind HEAD" already gracefully fall back to date-based when HEAD is unavailable (`memory_session_start.sh` line 88); the new closure path SHALL keep working in both modes.
- **No new hooks.** Article VIII enumerates 22 hooks (17 write/run-boundary + 4 lifecycle + 1 input-boundary). Adding a hook is a constitutional amendment; this work stays within the existing surface.
- **Backwards-compat for the SessionStart index format.** The header line currently consumed by Claude at session start is `HEAD: ... · total entries: N · stale (>=30 commits old): M`. Any addition SHALL be additive — new lines BELOW the existing line, not in place of it — so older session transcripts re-injected via `_resume.md` still parse.

## Acceptance criteria

1. **Given** a canonical entry on any file (incl. `pending-questions.md`) carries `resolved-at: <ISO date>` in its key/value block, **when** `/memory-flush` runs, **then** the entry is removed from that canonical file and a one-line summary appears under `Closed (M)` in the skill's terminal report.
2. **Given** a canonical entry on `pending-questions.md` contains a body line matching the regex `^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b` (case-insensitive), **when** `/memory-flush` runs, **then** the skill surfaces the entry to the user for confirm-and-close (does NOT auto-close — implicit closure requires explicit user confirmation in the same turn) and proceeds per the user's answer.
3. **Given** at least one canonical entry whose `verified-at` SHA is ≥30 commits behind HEAD (or whose `last-touched` is ≥90 days behind today on a non-git tree), **when** the SessionStart hook fires, **then** the hook output includes a `## Stale entries` block listing each entry's `<file>:<stable-key>` (capped at top 5 by oldest `last-touched`; overflow shows `… and N more`).
4. **Given** the SessionStart hook reports stale entries, **when** the user runs `/memory-flush`, **then** the skill iterates the listed stale entries and offers re-verify / delete / mark-closed for each one (mirroring its existing promote/discard/defer pattern but for canonical, not pending).
5. **Given** an entry with `resolved-at:` AND a still-fresh `verified-at:` SHA, **when** the SessionStart hook computes the stale count, **then** the entry is NOT counted as stale (closure and decay are distinct lifecycles — closure is the answer to "is this still open?", staleness is the answer to "has this been re-verified recently?").
6. **Given** a `pending-questions.md` entry pre-dating this schema bump (no `source:` field, no `resolved-at:` field, no resolution prose), **when** any of the three lifecycle paths run (session-start, flush, decay), **then** the entry survives unchanged and is NOT auto-deleted. Existing entries are grandfathered; their absence of `source:` is a separate schema-drift question (Open questions §1) not in scope here.
7. **Given** the work lands, **when** `.claude/skills/audit-baseline/audit.sh` runs, **then** it exits 0 (no drift in hook/skill counts, settings.json wiring, project.json keys, etc.). The audit is the binding test runner; failing it = failing integrate.
8. **Given** the SessionStart hook output grows new lines, **when** an old `_resume.md` snapshot from before this change is re-injected, **then** session start does not crash and the `HEAD: ... total entries: N · stale (>=30 commits old): M` header line remains byte-equal to today's format (only NEW lines are added below).

## Open questions

- **Schema drift for `source:` / `verbatim:`.** Q-001 in `pending-questions.md` (open since 2026-04-27) and the pre-schema entries on `pending-questions.md` Q-001, Q-002 (now deleted), Q-003 (now deleted) lacked `source:`. README.md §Source provenance says it's mandatory; `/memory-flush` should reject promotions missing it — but doesn't audit existing entries. Is backfilling existing entries with `source: unrecorded` in scope of this intake, or a separate cleanup? **Recommendation**: separate cleanup. This intake closes the *resolution* lifecycle; the *provenance backfill* is a different lifecycle question and should ride a follow-up intake to avoid scope drift.
- **What does "closure" mean for `landmarks.md` / `libraries.md` / `decisions.md` / `landmines.md` / `conventions.md`?** `resolved-at:` makes intuitive sense for `pending-questions.md`. For the other five files, the natural lifecycle is *invalidation* (the file moved, the library was removed, the convention was replaced), not closure. Should AC-1 apply to all six files, or only to `pending-questions.md`? **Recommendation**: AC-1 applies universally; the field is `resolved-at:` on `pending-questions.md` and `superseded-at:` on the other five — same lifecycle shape, register-appropriate name. Spec decides the exact field naming.
- **Auto-close vs surface-and-confirm.** AC-1 (structured `resolved-at:`) is unambiguous — auto-close. AC-2 (resolution prose in body) is ambiguous — surface-and-confirm. Is this asymmetry the right default, or should both auto-close to reduce user friction? **Recommendation**: keep AC-2 surface-and-confirm because today's incident showed that resolution prose can be wrong (Q-002's "now shippable" was a user-call, not a system-derivable fact). Trusting body prose alone would auto-delete entries the user still considers open.
- **Top-N cap for stale listings.** AC-3 picks 5 as default; should it be configurable via `project.json → memory.stale_listing_cap`? **Recommendation**: ship with a hard-coded 5; promote to project.json only when a real second project asks for a different value. YAGNI per CLAUDE.md VI.4.
