# LLM-assisted memory capture and routing, with a durable resume thread and boilerplate-free cues

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Source brief: docs/brief/llm-assisted-memory-capture-routing.md
Source backlog: llm-assisted-memory-capture-routing-cf4a, shelve-capture-grabs-skill-sop-boilerplate-not-decisions-91a3
-->

## Problem

The baseline's memory subsystem loses salient information at three moments, and pollutes what it does keep:

1. **Mid-sentence intent is dropped at capture.** `memory_stop.mjs` extracts candidates with anchored, line-start regex (`INTENT_TRIGGERS`). Intent stated mid-sentence is never captured. Concrete case: the cf4a instruction itself — "actually this means we need to fix our memory feature… let us work on this feature in next session (add to backlog)" — matched no trigger and was dropped; it only survived because it was hand-promoted. The auto-extractor's recall is bound to phrasing and sentence position, not meaning.

2. **The resume thread does not survive `/clear`.** `_resume.md` is overwritten every turn (a point-in-time snapshot). After `/clear` or a fresh session, the durable "what we were working on and why" narrative is gone — only the latest snapshot remains, and prior-session decisions (e.g. brainstorm/codesign work) are recoverable only by luck.

3. **Boilerplate is captured as signal.** `shelve_capture.mjs → extract` pushes every user-role event's text as a verbatim cue with no noise filter. SKILL.md bodies (which arrive as user-role text prefixed `Base directory for this skill:`) and `<command-name>` / `<system-reminder>` / `<local-command-*>` wrappers get recorded as "cues." The one existing shelf entry (2026-05-31) was dominated by injected SKILL.md bodies.

Who experiences it: whoever resumes a thread of work — the next-session or post-`/clear` agent **and** the human developer — plus the `/memory-flush` curation step, which must sift signal from an increasingly noisy `_pending`/cue stream.

## Goal

Salient decisions and intent are reliably captured regardless of phrasing or sentence position, routed to the right `_pending` bucket, and a durable curated thread restores real working context on resume — without boilerplate noise and without ever bypassing human curation.

## Non-goals

- **Canonical entry schema stays unchanged.** The shapes of `landmarks` / `decisions` / `landmines` / `conventions` / `pending-questions` / `backlog` entries are not modified. Only how candidates are captured and routed into `_pending` changes.
- **Not the baseline-v1 agent-team / thought-compiler epoch.** This is memory capture and routing only; the maker/checker/orchestrator work (`baseline-v1-thought-compiler-...-9d4c`) is a separate epoch.
- **No change to the human-curation gate.** Article IX.3 stays: promotion to canonical is human-only via `/memory-flush`; auto-routing only ever stages to `_pending`. (This is a constitutional invariant, restated here as an explicit boundary.)

## Success metrics

- Capture recall on salient intent — baseline: mid-sentence intent is missed (the cf4a case was dropped), target: salient intent is captured regardless of sentence position, measured via: a fixture corpus of decision/intent utterances (line-start and mid-sentence) scored against expected candidates.
- Cue noise rate in shelve capture — baseline: SKILL.md bodies + wrapper tags captured as cues, target: zero boilerplate cues from the known prefixes/markers, measured via: a fixture transcript containing SKILL.md bodies and wrapper tags.
- Resume-thread durability — baseline: 0 (per-turn overwrite, lost on `/clear`), target: the curated "what/why" thread is available after `/clear`, measured via: a test that simulates `/clear` and asserts the thread is still recoverable.

## Stakeholders

- **Requester**: Tushar (project owner; razieldecarte@gmail.com).
- **Reviewer**: Tushar (approves the spec at gate A; this is the design-only checkpoint).
- **Operator** (who runs it in prod): the in-session baseline harness — `memory_stop` (Stop hook), `memory_session_start` (SessionStart), `memory_pre_compact` (PreCompact), and `/memory-flush`.

## Constraints

- **Per-turn capture must stay cheap (hard budget).** End-of-turn capture must not block every turn with heavyweight processing; heavier LLM reasoning should defer or batch (e.g. at `/memory-flush` or asynchronously). This tensions directly with cf4a's "LLM extraction at capture time" and is the central design decision for `/research`.
- **Article IX.3 (human curation gate) is constitutional.** Any auto-routing stages to `_pending` only; no canonical write without `/memory-flush`. Changing this would require a seed.md amendment and is out of scope.
- **Shipped-helper rules.** New helpers under `.claude/skills/<slug>/` must be `.sh` or `.mjs`/`.js` (no Python); modules must be in the manifest so consumer installs have them (spec-shippability-review enforces).
- **Source provenance preserved.** `source: user-instruction` / `user-feedback` candidates must keep their verbatim blockquote (Article IX.6); any LLM routing must not discard the verbatim.
- **DRY noise list.** The thread_store landmark already notes "noise filters must mirror resume_writer.mjs" — the fix should converge `memory_stop` / `resume_writer` / `shelve_capture` on one shared noise source rather than adding a fourth copy.

## Acceptance criteria

1. Given a salient intent stated mid-sentence (not at line start), when end-of-turn capture runs, then a candidate is emitted to `_pending` (where the current line-start regex drops it).
2. Given a captured candidate, when it is staged, then it carries a suggested route to exactly one of {landmark, decision, open-question, backlog}, and it is written only to `_pending` (no canonical file is modified).
3. Given any auto-capture or auto-routing operation, when it runs, then no canonical memory file is modified without `/memory-flush` (Article IX.3 invariant holds).
4. Given a session that performed work and then `/clear` (or a new session), when the next session starts, then a curated "what we were working on and why" thread is available and reflects the prior work (it survived `/clear`), distinct from the per-turn-overwritten snapshot.
5. Given shelve capture over a transcript containing a SKILL.md body (prefixed `Base directory for this skill:`) and `<command-name>` / `<system-reminder>` / `<local-command-*>` wrappers, when cues are extracted, then none of those boilerplate texts appear as cues.
6. Given the noise-filtering logic, when `memory_stop`, `resume_writer`, and `shelve_capture` filter noise, then all three reference a single shared noise source (in `lib/common.mjs`) rather than divergent copies.
7. Given a transcript mixing real decision/intent text with SOP boilerplate, when the capture pass surfaces candidates, then decision/intent text is favored over boilerplate (Tier-2 semantic weighting).
8. Given end-of-turn capture, when it runs, then it stays within the cheap per-turn budget — the heavyweight LLM reasoning path is not invoked synchronously on every turn (it is deferred/batched).
9. Given the existing memory test suite, when this change lands, then it still passes (canonical entry schema and the `/memory-flush` curation contract are unchanged).
10. Given a `source: user-instruction`/`user-feedback` candidate, when it is captured and routed, then its verbatim text is preserved (Article IX.6).

## Open questions

- **Where does the LLM pass run?** Per-turn capture must stay cheap (constraint above), but cf4a's core is smarter extraction. Options to weigh in `/research`: (a) keep capture cheap with improved deterministic heuristics + defer the LLM semantic pass to `/memory-flush` (already LLM-assisted, main-context); (b) async/batched LLM pass between turns; (c) a small/fast model tier per-turn. This is the load-bearing decision.
- **Relationship to `_thread.md`.** Article IX.8 already defines a local + durable thread class (`_thread.md`, shelve/resume, outside `/memory-flush` reset). Does the "durable resume thread" (cf4a point 2) extend `_thread.md`, replace `_resume.md`, or introduce a third artifact? `/spec` must scope this precisely to avoid overlap.
- **Recall/precision target.** "Capture-more" is the chosen disposition, but what false-positive rate in `_pending` is acceptable before curation becomes a burden? Needs a measurable target for the fixture corpus.
- **Model/tier and cost.** If an LLM pass is used, which tier (Haiku for cheap per-turn vs Opus/Sonnet at flush), and what is the cost envelope? Ties to the per-turn budget constraint.
