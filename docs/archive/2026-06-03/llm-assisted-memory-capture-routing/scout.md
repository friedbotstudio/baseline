# Codebase Scout Report — llm-assisted-memory-capture-routing

Scope: the memory subsystem touched by cf4a (capture + routing, durable resume thread) and 91a3 (shelve-capture boilerplate). Read-only scout. Source intake: `docs/intake/llm-assisted-memory-capture-routing.md`.

## Primary touchpoints

### Capture (cf4a core + 91a3 Tier-1)
- `.claude/hooks/lib/memory_stop.mjs:34-51` — `INTENT_TRIGGERS`: the anchored regex set that bounds capture recall. This is the recall floor cf4a wants to raise (mid-sentence intent is invisible to these line-anchored patterns).
- `.claude/hooks/lib/memory_stop.mjs:99` — `NOISE_PREFIXES = ['<system-reminder>', '<command-name>', '<local-command-']`. The canonical noise list.
- `.claude/hooks/lib/memory_stop.mjs:123-126` — `filterNoise(text)` (head-of-text prefix check).
- `.claude/hooks/lib/memory_stop.mjs:141-167` — `normalizeIntent` / `deriveKey` (key = slug + 4-char sha; `<8-word-kebab>-<4hash>` shape).
- `.claude/hooks/lib/memory_stop.mjs:169-355` — `runMemoryStop` main: transcript → landmark/library/intent candidates → appends `## CANDIDATE:` blocks to `_pending.md` with dedup. This is the per-turn path that MUST stay cheap (intake constraint).
- `.claude/hooks/lib/shelve_capture.mjs:35-69` — `extract(events)`: pushes every user-role text as a verbatim cue (line ~44) with **NO noise filter**; caps `CUE_CHARS=800`, `MAX_CUES=8`. This is the 91a3 Tier-1 fix site.

### Resume / durable thread (cf4a point 2)
- `.claude/hooks/lib/resume_writer.mjs:80-84` — inline noise filter (duplicates the three `NOISE_PREFIXES` literals, NOT importing them). DRY-convergence target #1.
- `.claude/hooks/lib/resume_writer.mjs:153-286` — `composeSnapshot` / `writeSnapshot`: builds and **overwrites** `_resume.md` every turn (the per-turn snapshot that does not survive `/clear`).
- `.claude/hooks/lib/thread_store.mjs:26-126` — durable `_thread.md` trail: base64-JSON entries + readable markdown, `appendEntry`, `pruneTrail` (max 20 sections), `readMostRecent`/`readMostRecentMarkdown`, cursor + staged-candidate sidecars. This is the existing local+durable class (Article IX.8) the "durable resume thread" must relate to.
- `.claude/hooks/memory_session_start.mjs` (+ `lib/memory_session_start.mjs:141-382`) — `buildIndex`: reads canonical + `_pending`, injects `_resume.md` snapshot (≤9500 char budget) and the most-recent shelved `_thread.md` section at session start. Consumer of both continuity artifacts.
- `.claude/hooks/memory_pre_compact.mjs:45` — `writeSnapshot({trigger:'pre-compact'})` before compaction.
- `.claude/hooks/memory_stop.mjs:36,44,61` — Stop hook: `runMemoryStop` → `_pending`; `writeSnapshot('stop')` → `_resume`; shelve-candidate detect.

### Shared-utility seam
- `.claude/hooks/lib/common.mjs` — exports path/consent/git utilities (`canonicalSlug`, `writeMarkerAtomic`, `writesConsentPath`, etc.). **No `NOISE_PREFIXES` here today** → this is where the shared noise list should live (intake AC-6).

### Curation contract (the IX.3 gate — must NOT change)
- `.claude/skills/memory-flush/sweep.mjs` — modes `auto-close`, `prose-scan`, `stale-sweep`, `stamp-closure`; `splitEntries` parses `_pending` CANDIDATE blocks. Promotion to canonical happens only here, curator-driven.
- `.claude/memory/README.md:20-57` — canonical entry schema + Source-provenance/verbatim rule (Article IX.6); `_pending` CANDIDATE block schema; continuity-vs-knowledge taxonomy (`:127-131`).

## Entry points that reach this code
- **Stop hook** `memory_stop.mjs` (end of every turn) → capture + resume snapshot + shelve detect.
- **SessionStart hook** `memory_session_start.mjs` → index + resume + thread injection.
- **PreCompact hook** `memory_pre_compact.mjs` → resume snapshot.
- **`/memory-flush` skill** (Phase 10.6 + ad-hoc) → curation; `sweep.mjs`.
- **`/commit` Phase 11 Step 6** → `sweep.mjs --mode stamp-closure` (backlog closure).

## Existing tests
- `tests/memory-stop-recall.test.mjs` — inline + end-of-line marker capture (the recall surface cf4a changes; will need new mid-sentence cases).
- `tests/memory-stop-dedup.test.mjs` — within/cross-session dedup.
- `tests/memory-session-start*.test.mjs` (size-cap, head-decay, mid-flight, pending-nag) — index + snapshot injection.
- `tests/thread-shelving.test.mjs`, `tests/thread-trail-rolloff.test.mjs` — shelve capture, cursor, trail pruning (the 91a3 fix surface).
- `tests/memory-flush-phase.test.mjs` — Phase 10.6 curation contract (must stay green — AC-9).
- `tests/atomic-writes-and-slug.test.mjs` — atomic writes + slug derivation.
- `tests/thread-shelving-governance.test.mjs` — governance counts unchanged (NOTE: flaky under parallel `npm test`; see landmine `live-objtemplate-rebuild-races-parallel-test-readers` — run serial for a clean verdict).

## Constraints and co-changes
- **Article IX.3 (human-curation gate)** — auto-routing stages to `_pending` only; canonical writes only via `/memory-flush`/`sweep.mjs`. Enforcement is by convention in these hooks (no PreToolUse guard blocks hook writes to canonical), so the design must keep the discipline. Intake AC-3.
- **Article IX.6 (verbatim preservation)** — `source: user-instruction/user-feedback/assistant-deferral` candidates carry a verbatim blockquote; LLM routing must not discard it. README.md:20-38. Intake AC-10.
- **Per-turn cost budget (hard)** — `runMemoryStop` + `writeSnapshot` run on EVERY Stop. A synchronous LLM call here violates the intake constraint; heavy reasoning must defer/batch. Intake AC-8.
- **DRY noise list** — three sites carry the prefixes: `memory_stop.mjs:99` (constant), `resume_writer.mjs:81-82` (inline dup), and `shelve_capture.mjs` (absent). Converge on a `common.mjs` export. Intake AC-6.
- **Shipped-helper rules** — new helpers under `.claude/skills/<slug>/` must be `.mjs`/`.js`/`.sh` (no Python) and listed in `obj/template/.claude/manifest.json` (spec-shippability-review enforces). Hooks live under `.claude/hooks/lib/`.
- **Governance counts** — adding a hook would bump the "22 hooks" count cascade (CLAUDE.md/seed.md/README/audit). Strongly prefer folding changes into existing hooks/libs, not a 23rd hook.

## Patterns in use here
The subsystem separates **capture** (mechanical, verbatim, cheap — `memory_stop`, `shelve_capture`), **transform** (noise-filtered context rendering — `resume_writer`, `memory_session_start`), and **curation** (interactive promote/close — `sweep.mjs`). Hooks are thin `.mjs` wrappers over `lib/*.mjs`; libs are pure functions tested directly via `node:test` + tmpdir fixtures driven by `spawnSync`. State files are written atomically (`writeMarkerAtomic`/`writeJsonAtomic`). `_thread.md` entries are base64-JSON for byte-identity (CWE-116 mitigation).

## Risks / landmines
- **Capture-verbatim-vs-filter philosophy clash.** `shelve_capture` deliberately captures verbatim and defers transformation to resume-render time (the capture/transform/curation split above). 91a3 Tier-1 ("filter boilerplate cues") can be satisfied EITHER at capture (filter in `extract`) OR at render (filter in `thread_store.readMostRecentMarkdown` / `memory_session_start` injection). `/research` + `/spec` must pick where filtering lives; check `decisions.md` for any prior "capture verbatim, transform later" decision before changing `extract` (re-verify before citing).
- **Per-turn LLM cost is the load-bearing tension** (intake open-question #1). cf4a "extraction at capture time" vs the cheap-per-turn budget. The likely resolutions: improved deterministic capture per-turn + LLM semantic pass deferred to `/memory-flush` (already main-context LLM), or async/batched, or a small-tier model. This is research's job.
- **Durable-thread overlap with `_thread.md`.** A "durable resume thread" risks duplicating the existing `_thread.md` shelve/resume machinery. Scope precisely in spec (extend `_thread.md` vs new artifact vs promote `_resume` content into the durable trail).
- **IX.3 has no structural guard.** Unlike consent paths, nothing blocks a hook from writing canonical files; the gate is convention-only. An LLM routing step that writes must be carefully bounded to `_pending`.
- **Recall-vs-noise has no metric yet** (intake open-question #3). "Capture-more" needs a measurable false-positive target on a fixture corpus, else `_pending` curation burden grows unbounded.
