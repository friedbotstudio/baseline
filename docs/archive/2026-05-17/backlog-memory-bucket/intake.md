# Add a backlog bucket to the auto-extraction memory system

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Future-intent statements surfaced during conversation — "next we should X", "let's also Y", "TODO: Z", "backlog this" — have no durable home in the project's memory system. The six canonical memory files (`landmarks.md`, `libraries.md`, `decisions.md`, `landmines.md`, `conventions.md`, `pending-questions.md`) hold verified facts about the current state of the codebase. None of them are designed to capture *intended future work*.

Today, when the user (or Claude) verbalizes a follow-up task mid-conversation, that intent lives only in the transcript. The `memory_stop.sh` hook does end-of-turn extraction but only inspects `tool_use` blocks — it pulls file-touch and `context7` query signals into `_pending.md`, never text content from user prompts or assistant responses. After `/clear` or session compaction, follow-up intent disappears unless the user or Claude manually wrote it down.

This is the bedrock blocker for a future `/pm` (PM mode) skill that would surface and prioritize backlog items, draft intakes from them, and track open vs picked-up vs dropped status. Without a structured capture mechanism, `/pm` would have nothing to operate on.

## Goal

Capture obvious future-intent statements automatically at turn-end so they accumulate in `_pending.md`, route through the existing `/memory-flush` curation flow, and land in a new canonical `backlog.md` file with stable status tracking.

## Non-goals

- **NOT building the `/pm` skill in this workflow.** This is foundation only; `/pm` is a downstream consumer with its own workflow.
- **NOT auto-promoting backlog items to intakes.** Promotion to a workflow remains an explicit user action.
- **NOT introducing a new slash command for capture.** Capture is automatic via the existing `memory_stop.sh` extraction path.
- **NOT replacing `pending-questions.md`.** Questions awaiting user answer remain a separate register; backlog is for *future work intent*, not open questions.
- **NOT making `backlog.md` the source of truth for a project's roadmap.** It is a memory bucket, not a planning tool.

## Success metrics

- **Capture coverage** — obvious future-intent phrasings produce backlog candidates: baseline 0%, target ≥ 80% on a hand-curated test set of 20+ true-positive sentences, measured via the intent-detection unit test in `.claude/skills/memory-flush/tests/run.sh` (or a new sibling test file for the hook).
- **False-positive rate** — mid-sentence accidental matches that emit a candidate: baseline N/A, target ≤ 5% on a hand-curated test set of 20+ true-negative sentences, measured via the same test.
- **Regression isolation** — existing file-touch and `context7` candidate extraction still produce identical output before/after the change, measured by a golden-fixture diff in the hook's test harness.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (the user)
- **Reviewer**: razieldecarte@gmail.com — same person owns the harness and approves the spec/commit gates
- **Operator** (who runs it in prod): the `memory_stop.sh` hook fires on every assistant turn-end; the user invokes `/memory-flush` to curate. No prod ops beyond that.

## Constraints

- **Backward-compatibility.** The existing `_pending.md` candidate format (`## CANDIDATE: <key> → <target-file>.md` + bullet fields) must stay byte-compatible. Existing curation flow must not break.
- **False-positive sensitivity.** Detection must err strongly toward precision over recall. The user explicitly stated: "only obvious future-intent phrasings should match; mid-sentence accidental matches should not." A pattern that fires on "the next section we need" inside a quoted doc is unacceptable.
- **Source provenance compliance.** Per `.claude/memory/README.md → Source provenance`, entries with `source: user-instruction` or `source: user-feedback` must include a `verbatim:` blockquote. Backlog candidates derived from user prompts are `user-instruction`; those derived from assistant text are `inferred-from-code` or a new provenance category — needs decision in research/spec.
- **Hook robustness.** `memory_stop.sh` already runs `python3` and "never fails the hook." Extension must preserve that property.
- **Article IX compliance.** Memory accelerates triage; it never authorizes a skip. The backlog bucket is no exception — promotion to `backlog.md` flows through `/memory-flush` curation, not auto-write.

## Acceptance criteria

1. **Given** a user prompt containing "next we should add X", **when** the assistant's turn ends, **then** `memory_stop.sh` appends a `## CANDIDATE: backlog → <quoted intent>` block to `_pending.md` carrying the user's verbatim text, ISO timestamp, and provenance field.

2. **Given** an assistant response containing "Let's also test the empty-state flow", **when** the turn ends, **then** `memory_stop.sh` appends a backlog candidate carrying the assistant's verbatim sentence with provenance flagged distinctly from user-derived candidates.

3. **Given** a turn whose only text mentions "the next section of the document is" (mid-sentence, not future-intent), **when** the turn ends, **then** no backlog candidate is emitted.

4. **Given** a turn where the assistant edits three source files and writes no future-intent text, **when** the turn ends, **then** the file-touch candidates emit identically to today (golden-fixture parity), and no spurious backlog candidate appears.

5. **Given** `_pending.md` contains a `## CANDIDATE: backlog → <intent>` block, **when** the user runs `/memory-flush`, **then** the curator can promote it to `.claude/memory/backlog.md` with a canonical entry shape including `status: open`, `raised-on: <date>`, `raised-in-context: <slug or topic>`, `verified-at: <SHA>`, `last-touched: <date>`, and the user's verbatim blockquote.

6. **Given** `.claude/memory/backlog.md` does not exist before this workflow, **when** the implementation lands, **then** the file exists with frontmatter (`owners`, `category`, `size-cap: 500`, `key`, `verifies-against`), a body header, and at least the prose explaining the bucket's semantics.

7. **Given** `.claude/memory/README.md` documents the six existing canonical files, **when** the implementation lands, **then** the README documents the new `backlog.md` file in the Files table, declares its stable-key format, and adds a `status:` field definition with the three allowed values (`open|picked-up|dropped`).

8. **Given** the audit-baseline script enumerates canonical memory files (if it does — verify in scout), **when** the implementation lands, **then** the audit acknowledges `backlog.md` as the sixth canonical file without flagging it as drift.

## Open questions

- **Q1.** What is the canonical list of intent trigger phrasings the hook should match? Candidates include `next we should`, `let's also`, `we should also`, `backlog this`, `^TODO:`, `^FIXME:` (in chat, not code), `we'll need to`, `after this`, `eventually`, `at some point`. Research should converge on a precision-favoring set, with anchored regexes to avoid mid-sentence false positives.

- **Q2.** Should backlog extraction look at user prompts only, assistant text only, or both? User prompts carry stronger intent signal (user is stating a wish), but assistant text often verbalizes follow-ups the user implicitly accepted. Decision affects which transcript event types the hook walks.

- **Q3.** What `source:` value applies to backlog candidates derived from assistant text? Current allowed values are `user-instruction`, `user-feedback`, `incident`, `inferred-from-code`, `library-pinned`, `unrecorded`. None fit cleanly. Options: extend the enum with `assistant-deferral`, or reuse `inferred-from-code` (semantic stretch), or require manual classification at flush-time.

- **Q4.** Should the hook dedupe backlog candidates across sessions (matching on normalized intent text), or only within a session? Cross-session dedupe matches the existing file-touch pattern but requires string similarity logic. Within-session dedupe is simpler but lets the same backlog item re-emit on every session that mentions it.

- **Q5.** Does `.claude/skills/audit-baseline/audit.sh` enumerate canonical memory files? If yes, the audit must be updated to acknowledge `backlog.md`. If not, only `README.md` and `memory_session_start.sh` need awareness.

- **Q6.** Should the stale-sweep apply to `backlog.md` entries? An open backlog item that goes unverified for 30 commits is *probably* still valid intent. Stale-sweep on backlog should likely re-stamp `verified-at:` automatically rather than offer delete. Decide in spec.
