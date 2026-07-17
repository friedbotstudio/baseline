# Codebase Scout Report — memory-system redesign (graph-indexed, one-fact-per-file, decision-point surfacing)

Scope from intake: replace the 7-file/500-cap store with a one-fact-per-file store + a network-graph index (cheap upfront load, phase-scoped traversal that surfaces a lesson as an active constraint at the decision point). In scope: the seven canonical files **and** the continuity classes (`_resume`, `_thread`, `_pending`). Out: CC session-level user memory.

## Primary touchpoints

### The store itself (`.claude/memory/`)
- `.claude/memory/README.md` — the **storage contract**: entry shape (`## <stable key>` + verbatim blockquote + `source:`/`verified-at:`/`last-touched:`), per-file stable-key table (README:59-67), self-healing/re-verify rule (README:69-71), **bounding rules** (`size-cap: 500`, prune-oldest-unverified, decay ≥30 commits/days; README:73-76), closure fields (README:78-114), continuity-vs-knowledge split (README:127-131). Every one of these must survive the model change or migrate explicitly.
- Seven canonical files: `landmarks.md` (587 lines), `landmines.md` (**502 — over the 500 cap now**), `decisions.md`, `backlog.md`, `conventions.md`, `libraries.md`, `pending-questions.md`. ~191 entries total (session-start index).
- Continuity classes: `_pending.md` (extraction inbox), `_resume.md` (per-turn snapshot), `_thread.md` (durable local thread). All gitignored bodies; pristine structure ships from `src/memory/*.template.md`.

### The index builder (session-start load)
- `.claude/hooks/lib/memory_session_start.mjs` (420 lines) — builds the compact index injected at session start: `DEFAULT_SIZE_CAP = 500` (line 20), per-file frontmatter `size-cap:` parse (line 27), stale counting (lines 165-189), over-cap flag (line 191), the rendered index table (lines 216-233). **This is the file that already does "index, not bodies" at session start** — the redesign extends it from a per-file summary to a graph index with traversable links.
- `.claude/hooks/memory_session_start.mjs` — the hook wrapper (SessionStart event).

### The decision-point injection precedent (the AC-3 anchor)
- `.claude/hooks/process_lifecycle_guard.mjs` — **the working model for "surface a lesson at the decision point."** A hardcoded trigger→key map (`[['landmines.md','lsof-port-kill-takes-firefox-with-it'], ['conventions.md','dev-server-ownership']]`, lines 43-45) reads the file, and on a matching Bash command surfaces the entry **verbatim then interpretation** via `emitInfo`, explicitly citing "Article IX clause 7: … prefer verbatim over interpretation" (lines 66-70). AC-3 generalizes exactly this: from a hardcoded key-map keyed on Bash patterns, to phase-scoped traversal keyed on the workflow phase (spec-authoring → spec-authoring landmines).

### Extraction + continuity hooks (rebind, don't break — Constraint)
- `.claude/hooks/lib/memory_stop.mjs` (453 lines) — Stop-hook extractor: touched paths→landmarks, context7 queries→libraries, intent lines→backlog; appends to `_pending.md`; refreshes `_resume.md`.
- `.claude/hooks/lib/resume_transform.mjs` (44), `resume_writer.mjs`, `thread_store.mjs` (218), `shelve_detect.mjs` (65), `shelve_capture.mjs` — the `_thread`/`_resume` machinery.
- `.claude/hooks/memory_pre_compact.mjs` — PreCompact snapshot.

### Curation skill
- `.claude/skills/memory-flush/{SKILL.md,sweep.mjs,route.mjs,next-q-id.mjs}` — promotes `_pending` → canonical (human-gated, Art IX.3); `sweep.mjs` is the only sanctioned writer to `backlog.md` during closure-stamping; Step 0a auto-close on `superseded-at:`.

## Entry points that reach this code
- **SessionStart** → `memory_session_start.mjs` → index injection (the upfront-context surface, AC-2).
- **Stop** → `memory_stop.mjs` (extraction) + `notify.mjs stop` + `harness_continuation`.
- **PreCompact** → `memory_pre_compact.mjs`.
- **PreToolUse / Bash** → `process_lifecycle_guard.mjs` (inline surfacing — AC-3 precedent).
- **`/memory-flush`** skill (Phase 10.7) — curation.
- **Every phase skill** writing canonical entries as a byproduct (scout→landmarks, research→libraries, spec/rca→decisions, security/integrate→landmines, …). The seven owners are named in README:120 and the file table.

## Existing tests
- `tests/memory-session-start*.test.mjs` (×5: base, size-cap, head-decay, mid-flight, pending-nag) — cover the index builder; **the size-cap + index-shape tests will need rewrites** for the new model.
- `tests/memory-stop-dedup.test.mjs`, `memory-stop-recall.test.mjs`, `memory-sentence-capture.test.mjs`, `memory-capture-noise-filter.test.mjs` — extraction.
- `tests/memory-flush-phase.test.mjs`, `memory-flush-routing.test.mjs`, `upgrade-pending-precedence.test.mjs` — curation.
- `tests/memory-durable-thread.test.mjs`, `thread-shelving*.test.mjs`, `thread-trail-rolloff.test.mjs` — continuity classes.
- All passing (no skipped noted).

## Constraints and co-changes
- **Governance precedence (Art I.4).** `CLAUDE.md` **Article IX spans lines 226-240** and enumerates the seven files by name (line 230). Changing the model requires: `docs/init/seed.md` amendment FIRST (memory refs at seed.md:117, 167, 172, 179, 238), then Article IX, then `.claude/memory/README.md`, then the `src/*.template.md` mirrors, then the audit. `CLAUDE.md` ≤ 40,000 chars and byte-equal to `src/CLAUDE.template.md`.
- **The audit hard-codes the seven names (a blocking coupling).** `expected-baseline.mjs:34` (`EXPECTED_MEMORY_FILES`) + `derive-counts.mjs:12-15` (`CANONICAL_MEMORY`) list the seven. `audit.mjs:401-402` FAILs on any **unexpected** `.md` in `.claude/memory/` and `audit.mjs:411-425` validates each file has a YAML preamble + counts `##` entries. **A one-fact-per-file store (potentially hundreds of files, per-fact not preamble+many-entries) breaks both checks** — the audit must be reworked in lockstep, or the per-fact files live in a subdirectory the audit treats differently.
- **`.gitignore` (lines 16-37).** Canonical seven are committed; `_pending`/`_resume`/`_thread` bodies gitignored. A per-fact model changes *what* is committed vs ignored — decide and update gitignore + the `src/memory/` pristine templates.
- **Provenance semantics must hold** — verbatim-wins (Art IX.6), re-verify-before-cite (Art IX.2), `source:` field, closure fields. AC-5 migration must carry these per entry.
- **`src/memory/*.template.md`** — 10 pristine templates ship (`landmarks`…`_thread`); `audit.mjs:432+` checks `src/` templates against disk.

## Patterns in use here
- Memory is **markdown-first**: entries are `##`-headed blocks with a YAML frontmatter preamble per file, `[[wikilink]]` cross-refs already present in all seven files, verbatim as blockquotes so grep and human-read both work. Helpers are plain `.mjs` (no deps — zero-runtime-dep posture). Hooks read files directly (`readFileSync`), emit via stdout/stderr envelopes. The `process_lifecycle_guard` pattern — trigger → scoped key → read → surface verbatim+interpretation inline — is the idiom the injection redesign should follow.

## Risks / landmines
- **`landmines.md` is already over cap (502/500)** — the very failure the redesign removes is live now; migration must not lose the over-cap entries.
- **The audit coupling is the highest-risk co-change**: `EXPECTED_MEMORY_FILES` + the per-file preamble/entry-count shape (`audit.mjs:411-425`) assume exactly-seven-preamble'd-files. This is a hard FAIL surface, not advisory — the redesign is not landable until the audit understands the new shape. This is the strongest signal that the work decomposes (storage+audit / index / injection / governance) and may re-triage to an epic.
- **Pending question Q-002** (`landmarks.md` `size-cap: 700` vs the documented 500) is an open inconsistency in the exact frontmatter field the redesign replaces — the migration should resolve it rather than carry it forward.
- **Mid-migration dual-read**: the hooks (`memory_session_start`, `memory_stop`, `process_lifecycle_guard`) all read the current shape; a cutover must keep them working against whichever shape is on disk during transition (an intake open question, deferred to spec).
