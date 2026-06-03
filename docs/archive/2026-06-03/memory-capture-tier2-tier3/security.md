# Security reports — memory-capture-tier2-tier3

## memory-capture-tier2-tier3-2026-06-03.md

# Security Review — main (memory-capture-tier2-tier3) — 2026-06-03

## Summary
Overall risk: **LOW**. Tier 2/3 adds deterministic regex matchers (sentence capture + decision cues in `memory_stop`), a pure `route.mjs` classifier, pin-aware trail pruning in `thread_store`, and a resume distill step. No network, no model call, no new external dependency, no secret handling, no path traversal (all paths are caller-provided trusted hook arguments). Everything runs locally in headless hooks / main-context flush over the developer's own transcript and memory files.

## Findings

### [LOW] New regexes run over transcript/candidate text (ReDoS class)
- **OWASP**: A03 — Injection (ReDoS) | **CWE**: CWE-1333
- **File**: `.claude/hooks/lib/memory_stop.mjs` (`DECISION_CUE_RE`, `SENTENCE_SPLIT`), `.claude/skills/memory-flush/route.mjs` (`PATH_RE`, `FUTURE_RE`, `DECISION_RE`, `CHATTER_RE`)
- **Evidence**:
  ```
  const PATH_RE = /(?:^|\s)[\w./-]+\.[a-z]{2,4}(?:\s|$)|\.claude\//i;
  const SENTENCE_SPLIT = /(?<=[.?!])\s+/;
  ```
- **Impact**: All new patterns are flat alternations / single character-class quantifiers with no nested or overlapping quantifiers, so they are linear-to-polynomial, not exponential. Inputs are bounded (candidate text is capped at `MAX_INTENT_TEXT_LEN`; route candidates are short `_pending` lines). No catastrophic backtracking path was found.
- **Recommendation**: None required.

### [LOW] Capture-more breadth over-stages to `_pending`
- **OWASP**: A04 — Insecure Design (signal/noise) | **CWE**: CWE-693 (over-permissive direction)
- **File**: `.claude/hooks/lib/memory_stop.mjs` (`DECISION_CUE_RE` fires unanchored)
- **Impact**: Broad cues (`going to`, `decided to`) intentionally raise recall and will stage some false-positives to `_pending` (observed live this session). This is the approved "capture-more, curate at flush" disposition; `_pending` is gitignored staging and promotion stays human-only (Article IX.3), so the blast radius is curation effort, not data exposure or integrity. Weighting + `route.mjs` help the human triage.
- **Recommendation**: Accept for iteration 1; tune the cue list from real `_pending` volume (tracked on cf4a).

### [LOW] Resume distill reads workflow.json + transcript each turn
- **OWASP**: A05 — Security Misconfiguration (resource use) | **CWE**: CWE-400 (uncontrolled resource consumption)
- **File**: `.claude/hooks/lib/resume_writer.mjs` (`distillWorkingThread`, `lastUserPrompt`)
- **Impact**: `lastUserPrompt` does one extra bounded read of the transcript per stop; `distillWorkingThread` reads `workflow.json` (small). Both are try/caught so a failure never breaks the resume snapshot, and `appendEntry` + the pin-aware prune collapse working entries to a single pinned one, bounding `_thread.md` growth. Cheap-per-turn budget respected (no model call).
- **Recommendation**: Accept. If the extra transcript read ever shows up in profiling, fold it into `composeSnapshot`'s existing walk.

## Dependencies
No new packages. Node stdlib only. `route.mjs` is pure (no `node:fs`/network). No `@anthropic-ai/sdk`.

## Out of scope / Noted
- Article IX.3 holds: capture stages to `_pending`; `route.mjs` only suggests; promotion is human-only at `/memory-flush`. Article IX.6 (verbatim) holds: capture preserves the matched sentence verbatim.
- The deterministic `route.mjs` is fallible by design (human accepts/overrides); the semantic Sonnet-tier backstop remains a main-context flush concern, not shipped code (recorded on cf4a).

