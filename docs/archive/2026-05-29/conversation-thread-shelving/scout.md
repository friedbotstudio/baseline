# Codebase Scout Report — conversation-thread-shelving

Maps the memory/hook/command slice for: a durable LOCAL single-rolling-trail that survives `/memory-flush`, a Stop-hook switch-detector, a background shelve worker, and `/shelve` + `/resume`. Read-only scout; descriptive, not prescriptive (approach is `/research`'s job).

## Primary touchpoints

### Memory files + schema (`.claude/memory/`)
- `.claude/memory/README.md` — the memory contract: seven canonical files, `_pending.md` (auto-extraction inbox), `_resume.md` (continuity snapshot). The "Continuity vs knowledge" + "Files" tables are where a NEW local class must be documented. `/spec` will edit this.
- `.claude/memory/_resume.md` — the existing per-turn continuity snapshot (overwritten every turn-end + pre-compact). The closest existing analogue to the trail; the trail is essentially a *durable, append-only, never-auto-wiped* sibling.
- `.claude/memory/_pending.md` — the model the trail's on-disk shape should mirror: **gitignored content, committed file structure** via a ship-template.

### Ship-template pattern (`src/memory/`)
- `src/memory/_pending.template.md`, `src/memory/_resume.template.md` — pristine ship-time placeholders overlaid by `scripts/build-template.sh` stage 2 and copied by the CLI installer. A new trail file needs an analogous `src/memory/<trail>.template.md` so the committed *structure* travels with the baseline while runtime *content* stays local.

### Hook layer (`.claude/hooks/`)
- `.claude/settings.json:61-68` — the `Stop` event wiring. Two hooks fire in order: `memory_stop.mjs` then `harness_continuation.mjs`. **Only `harness_continuation` emits a `{"decision":"block"}`** (re-prompt) — a new switch-detector at `Stop` must NOT emit a competing block decision. SessionStart wiring at `:54-60`, PreCompact at `:69-76`.
- `.claude/hooks/memory_stop.mjs:1-45` — the Stop entry hook. PASSIVE COLLECTOR: delegates `_pending` extraction to `lib/memory_stop.mjs → runMemoryStop` (`:34`) and refreshes `_resume.md` via `lib/resume_writer.mjs → writeSnapshot` (`:42`). Best-effort: a walk failure never fails the hook (`:35-37`). The natural host (or sibling) for the switch-detector.
- `.claude/hooks/lib/resume_writer.mjs:1-286` — `composeSnapshot()` (`:153`) walks the transcript for `userPrompts / fileWrites / skillCalls / bashCmds / lastAssistantText` (`walk()` `:66-110`) and `writeSnapshot()` (`:275`) overwrites `_resume.md`. **Directly reusable** for composing a shelve entry's summary + cues. Note `:184` already excludes `.claude/state/` and `_pending` paths from the in-flight-files list — the trail file will want the same exclusion.
- `.claude/hooks/lib/memory_stop.mjs:1-322` — `_pending` candidate extraction. `INTENT_TRIGGERS` (`:34`), `USER_INTENT_PATTERNS`/`ASSISTANT_INTENT_PATTERNS` (`:53-54`), `runMemoryStop()` (`:136`), `appendFileSync` to `_pending` (`:309`). This anchored-regex extractor is the target of the COMPANION backlog item `cf4a` — **out of scope for this workflow** (intake non-goal), noted here only because the switch-detector lives at the same hook event.
- `.claude/hooks/memory_pre_compact.mjs:1-49` — writes `_resume.md` before compaction via the same `writeSnapshot`. If the trail should also capture-before-compact, this is the second writer to touch.
- `.claude/hooks/memory_session_start.mjs` + `.claude/hooks/lib/memory_session_start.mjs:1-365` — `buildIndex()` (`:140`) emits the memory index + injects the `_resume.md` body (`resumePath` `:310-336`) into session-start additionalContext under a ~10KB envelope. A trail that should surface on resume needs analogous injection here (or via `/resume`).
- `.claude/hooks/harness_continuation.mjs:1-127` — the OTHER Stop hook. Three-rung gate; rung 1 is `stop_hook_active` (`:52-56`). Documents the constraint that a Stop hook emitting `block` re-fires the turn — relevant to how (or whether) an auto-shelve surfaces a confirm.

### `/memory-flush` reset path (the AC-1 "must NOT touch" boundary)
- `.claude/skills/memory-flush/sweep.mjs:26-31` — `CANONICAL_FILES = [landmarks, libraries, decisions, landmines, conventions, pending-questions, backlog]`. The deterministic sweeper iterates ONLY these + `backlog`. **The trail survives `/memory-flush` for free as long as it is never added to this set.**
- `.claude/skills/memory-flush/SKILL.md:148-150` (Step 5) — the ONLY reset action: rewrites `_pending.md` to the empty skeleton. `_resume.md` is never reset by flush. SKILL.md `:205-206` — "pending body is gitignored content, file committed; do not write to `_pending` outside this skill." The trail must carve out the same "do not auto-wipe" guarantee explicitly so a future flush change doesn't regress AC-1.
- `.claude/skills/memory-flush/sweep.mjs:74` `writeFile()`, modes at `:427` (`stamp-closure`, `backlog-decay`) — none touch `_resume`/trail today.

### Command vs skill surface (`/shelve`, `/resume`)
- `.claude/commands/` holds only 6 USER-typed prompt commands (`approve-spec.md`, `approve-swarm.md`, `grant-commit.md`, `grant-push.md`, `init-project.md`, `init-project-doctor.md`) — these pair with `consent_gate_grant` (UserPromptSubmit). All OTHER capabilities are **skills** invoked via the `Skill` tool (`.claude/skills/<slug>/SKILL.md`). `/shelve` + `/resume` could be either pattern; `/research` + `/spec` decide. (Both `.claude/commands/*.md` and `.claude/skills/*/SKILL.md` are live precedents.)

## Entry points that reach this code
- **Stop event** (every turn-end) → `memory_stop.mjs` → `harness_continuation.mjs` (`.claude/settings.json:61-68`). The switch-detector's trigger point.
- **PreCompact event** (`/compact` or auto) → `memory_pre_compact.mjs` (`:69-76`).
- **SessionStart event** (startup / resume / clear / compact) → `memory_session_start.mjs` (`:54-60`). Where a trail would be re-injected.
- **`Skill(memory-flush)`** — Phase 10.6, and ad-hoc. The reset actor.
- **User slash command** — `/shelve` / `/resume` (new), and the manual `/memory-flush`.

## Existing tests
- `tests/memory-stop-dedup.test.mjs` — `memory_stop` candidate de-duplication. Touches the extraction path the switch-detector sits beside.
- `tests/memory-session-start.test.mjs` + `…-head-decay`, `…-mid-flight`, `…-pending-nag`, `…-size-cap` — session-start index/injection + the 10KB envelope + the debt-mode nag. A trail injected at session start must not break the envelope budget these assert.
- `tests/memory-flush-phase.test.mjs` — Phase 10.6 flow + the N-file enumeration (parameterizes over skill files; historically brittle — see backlog `triage-skill-md-still-duplicates…`). Adding a trail-survival assertion likely lands here.
- `.claude/hooks/tests/memory_stop_intent_test.sh`, `memory_session_start_test.sh`, `regenerate_ac008_test.sh` (+ `fixtures/`) — shell-level hook tests. NOTE: some sibling tests still reference ported `.sh` helpers (backlog `stale-sh-refs-in-tests-after-mjs-port`); new helpers ship as `.mjs` (Article XI / spec-shippability rule).
- `.claude/skills/memory-flush/tests/run.sh` — memory-flush helper tests.

## Constraints and co-changes
- `.gitignore:14-19` — `_pending.md`, `_pending.md.body`, and `_resume.md` are gitignored. A new trail file needs its own gitignore entry (content gitignored), plus the `src/memory/*.template.md` committed structure (`.gitignore:1-30` documents the rationale inline).
- `scripts/build-template.sh` stage 2 — overlays `src/memory/*.template.md`; a new trail template must be wired here and into the CLI install copy + `obj/template/.claude/manifest.json` (Article XI manifest; shipped-helper hash drift).
- `.claude/memory/README.md` — the "Files" + "Continuity vs knowledge" tables are the schema-of-record; a third memory class must be documented here (intake non-goal keeps it LOCAL, so no `seed.md` taxonomy amendment expected — but `/spec` must confirm the boundary).
- Article VIII — any hook add/modify needs the hook table in `CLAUDE.md` + `src/CLAUDE.template.md` (byte-mirror) updated, and `seed.md §4.1` if it's a new enforcement hook. A passive collector (non-enforcing) is lighter, but still counts toward the "22 hooks" governance count audited by `audit-baseline` (count duplicated across surfaces — see backlog `canonical-track-count-duplicated…` for the analogous count-sync landmine).
- Article II — a background shelve worker may only execute a pre-decided recipe; it makes no design calls. If implemented as a subagent, that collides with "ships exactly ONE subagent (swarm-worker)" — `/research` must weigh subagent vs `run_in_background` Bash vs inline.

## Patterns in use here
Hooks are `.mjs`, shebang `#!/usr/bin/env node`, import from `lib/common.mjs`, read payload via `readPayload()`/`payloadGet()`, and are **best-effort** (try/catch, never fail the turn) — the memory hooks especially. Library logic lives in `lib/*.mjs` with pure exported functions (`composeSnapshot`, `runMemoryStop`, `buildIndex`) that the thin top-level hook wires to I/O — this seam is tested directly. Deterministic actuators (`sweep.mjs`) use `parseArgs` and emit JSON reports. Skills are main-context SOPs in `SKILL.md` with `.mjs` helpers beside them.

## Risks / landmines
- **Stop-hook block-decision collision.** Two Stop hooks already chain; `harness_continuation` owns the `block` decision. A switch-detector that also emits `block` (or any stdout JSON decision) could fight it. Safest is a passive collector that STAGES a candidate; the confirm/surface happens elsewhere (session-start injection or `/resume`). `/spec` must pin this down (intake AC-4 + open-question 4).
- **`_resume.md` is the wrong durability model to copy wholesale** — it is overwritten every turn (`writeSnapshot`). The trail is append-only and never auto-wiped; reusing `composeSnapshot` for *content* is fine, but the *write semantics* differ fundamentally.
- **Unbounded growth.** Nothing wipes the trail (that's the point), but `_resume` injection lives under a 10KB session-start envelope (`memory-session-start-size-cap` test). A growing trail injected at session start could blow the budget — intake open-question 1 (bounding/lifecycle).
- **Companion-item bleed.** `lib/memory_stop.mjs` extraction (`cf4a`) is tempting to touch since the switch-detector sits at the same hook — but it is an explicit intake non-goal. Keep the surfaces separate.
- **Governance count + mirror churn.** Adding a hook touches the audited "22 hooks" count and the `CLAUDE.md`/`src/CLAUDE.template.md` byte-mirror — a known multi-surface-sync landmine in this repo.
