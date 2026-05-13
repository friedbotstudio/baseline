# Codebase Scout Report — harness-active-marker

## Primary touchpoints

- `.claude/hooks/harness_continuation.sh:1-106` — primary code change. Structure:
  - `:23-27` Rung 1 (`stop_hook_active` guard) — **KEEP**.
  - `:29-31` Rung 2 (file presence) — **KEEP** (will be re-numbered).
  - `:34-37` heredoc opener with env-pass `HARNESS_STATE`, `PROJECT_JSON`, `LOG_PATH`.
  - `:55-63` Rung 3 (state == "continue") — **KEEP**.
  - `:65-77` tunable reads (`window`, `cap`) — **REMOVE**.
  - `:80-86` Rung 4 (freshness `now - written_at <= window`) — **REMOVE**.
  - `:88-95` Rung 5 (tick_count cap) — **REMOVE**.
  - `:97-105` block-decision emission — **KEEP**.
  - `:106` bottom log line — **KEEP** (may extend to also write SessionStart-cleanup events; see Q19 below).
  - Add: **NEW** Rung 2.5 — marker presence check (`[ -r "$STATE_DIR/.harness_active" ]`).
  - Add: marker-vs-workflow slug sanity-check + WARN logging.

- `.claude/hooks/memory_session_start.sh:1-182` — SessionStart extension target. Uses `bash + python3` only (confirmed). Source helper at `:13` (`. "${BASH_SOURCE[0]%/*}/lib/common.sh"`). Heredoc starts ~`:24` and runs until ~`:170`. Splice the marker-cleanup block as a **separate bash stanza** before or after the heredoc — keep it independent of the memory-index emission so a python error in the heredoc never blocks the cleanup. `:181` `log_line memory_session_start "emitted memory index"` is the existing log call (uses `memory_session_start.log`, not the continuation log).

- `.claude/skills/harness/SKILL.md:11-15` — Per-tick atomicity intro (3 states).
- `.claude/skills/harness/SKILL.md:17-30` — "Stop hook reads..." paragraph (mentions five-rung silence ladder) + state-file shape JSON block (5 fields). **REWRITE** to three rungs + 3 fields.
- `.claude/skills/harness/SKILL.md:32-36` — Tunables block (`continue_window_seconds`, `max_ticks_per_session`). **REMOVE** entirely.

- `CLAUDE.md:200` — Article VIII hook table row for `harness_continuation`. References the 5-rung silence ladder and project.json tunables. **REWRITE**.
- `CLAUDE.md:105` — Article V "Per-tick atomicity" paragraph. Mentions one harness_state write per tick (doesn't mention rungs by name, but says "Stop hook re-fires harness on the same turn when state is continue") — light edit to mention the marker.
- `src/CLAUDE.template.md` — **byte-identical mirror** enforced by `tests/template-drift.test.mjs` (MIRROR_PAIRS at `:23-28` of that test). Same edits as CLAUDE.md.

- `docs/init/seed.md:167` — §4.1 hook-table row for `harness_continuation`. Currently describes the 5-rung silence ladder with explicit thresholds. **REWRITE**.
- `docs/init/seed.md:141` — §4.1 prose intro mentions "harness auto-continuation signal (`harness_continuation` reads `.claude/state/harness_state` on every Stop event and emits a `decision:block` directive when the harness has left a `state: 'continue'` marker..." — light edit to also mention the active marker.
- `docs/init/seed.md:358` — §7 "Auto-continuation" paragraph: "when `state == 'continue'` with fresh `written_at` and `tick_count` under cap" → rewrite to remove the freshness + tick-cap clauses.
- `src/seed.template.md` — mirror. §16 reservation preserved (audit enforces — `audit.sh: src templates: seed.template.md  PASS  §16 reserved`).

- `.claude/project.json → harness` key — currently `{continue_window_seconds: 10, max_ticks_per_session: 20}`. Remove both keys; the `harness` key itself can stay as `{}` or be removed entirely. **Spec must decide**: removing the key entirely is cleaner; leaving `{}` makes future tunable additions less surgical.
- `src/project.template.json` — mirror. Same edit.

- `.claude/state/.harness_active` — **NEW file**. Lives in runtime state dir. Not present today (confirmed via `ls .claude/state/`). Created/deleted by the harness skill SOP. Cleaned by `memory_session_start.sh`.

- `.claude/state/harness_state` — existing runtime file. Shape change: `{state, slug, reason}` after redesign. Written by harness skill SOP. Read by `harness_continuation.sh` (state field only; other fields ignored). Six callers across `chore/SKILL.md:84`, `integrate/SKILL.md:51`, `simplify/SKILL.md:60-61`, `tdd/SKILL.md:83`, plus `harness/SKILL.md` itself — **every one currently specifies `written_at` and `tick_count` in the write recipe**. All five caller SKILL.md files need updating to drop those fields.

- `tests/harness_continuation.test.mjs:73-133` — 7 existing tests:
  - `test_stop_hook_emits_block_when_state_is_continue_fresh_and_under_cap` (`:73-87`) — **rewrite** to drop the "fresh and under cap" condition; assert marker present.
  - `test_stop_hook_silent_when_stop_hook_active_true` (`:89-94`) — **keep as-is**.
  - `test_stop_hook_silent_when_harness_state_missing` (`:96-100`) — **keep**.
  - `test_stop_hook_silent_when_harness_state_malformed_json` (`:102-110`) — **keep**.
  - `test_stop_hook_silent_when_state_is_yielded` (`:112-117`) — **keep**.
  - `test_stop_hook_silent_when_written_at_is_stale` (`:119-125`) — **DELETE** (the mechanism it tests is being removed).
  - `test_stop_hook_silent_when_tick_count_at_cap` (`:127-132`) — **DELETE** (same).
  - **ADD**: `test_stop_hook_silent_when_marker_absent` (state=continue but no marker → silent).
  - **ADD**: `test_stop_hook_emits_block_when_marker_and_state_present` (state=continue + marker present → emit block, no time check).
  - **ADD**: `test_stop_hook_logs_warn_on_slug_mismatch` (marker slug != workflow slug → WARN in log, decision unchanged).
  - **ADD**: `test_memory_session_start_removes_stale_marker` (in `tests/memory_session_start.test.mjs` if it exists, or new file).

## Entry points that reach this code

- **Stop hook**: fires at every model turn-end via `.claude/settings.json` Stop chain (`memory_stop.sh` → `harness_continuation.sh`).
- **SessionStart hook**: fires once per new Claude Code session via the `SessionStart` event chain (currently only `memory_session_start.sh` is wired).
- **`/harness` slash command** (`Skill(harness)` invocations): the harness skill SOP is what writes `harness_state` and (post-redesign) the marker.
- **`/<phase>` slash commands** that themselves write `harness_state`: chore, integrate, simplify, tdd. These all need updating.

## Existing tests

- `tests/harness_continuation.test.mjs` (163 lines, 9 tests in two `describe` blocks). All currently passing per the most recent audit. Tests use a temp-project fixture (`createTempProject` at `:17`) and invoke the hook directly via `child_process.execFileSync` (typical pattern). The "post-refactor invariants" block (`:135+`) asserts harness/SKILL.md does NOT carry `disable-model-invocation` and verify-caller skills don't invoke `Skill(verify)` — orthogonal to this redesign.
- `tests/template-drift.test.mjs:23-28` — MIRROR_PAIRS enforces byte-equal between CLAUDE.md / settings.json / .mcp.json and their `src/*.template.*` siblings. Constrains my CLAUDE.md edits.
- `tests/template-payload.test.mjs:48-49` — DISALLOWED_CLAUDE_PATTERNS includes `^\.claude\/state(\/|$)`. **Confirmed**: `.claude/state/` (including the new `.harness_active` marker) is excluded from the npm payload. No change needed.
- `tests/manifest.test.mjs`, `tests/build-template.test.mjs`, `tests/cli.test.mjs` — orthogonal; the manifest doesn't hash `.claude/state/*`.

## Constraints and co-changes

- **Five SKILL.md files write `harness_state` and all currently spell out `written_at` + `tick_count`**: `harness`, `chore`, `integrate`, `simplify`, `tdd`. Every one needs the same recipe-update so they stop emitting those fields AND start managing the marker. The marker create/delete responsibility must be specified consistently across all five.
- **Hook event chain is bash, no jq**: the marker create/delete is just `echo "$slug" > marker` and `rm -f marker`. The hook check is `[ -f marker ]`.
- **audit-baseline (`audit.sh:441-460`) does NOT verify the `harness.*` keys** — only `tdd.*`, `swarm.*`, `consent.*`, `destructive.*`, `artifacts.*`, `additions.*`. Removing `harness.continue_window_seconds` and `harness.max_ticks_per_session` from `project.json` will not break the audit. Spec should still note that the keys are gone so future maintainers don't add them back.
- **`memory_session_start.sh` already writes to its OWN log** (`.claude/state/logs/memory_session_start.log`) via `log_line memory_session_start "..."`. The SessionStart marker-cleanup could:
  - (a) write its log entry to `memory_session_start.log` — matches the source hook; OR
  - (b) write to `.claude/state/logs/harness_continuation.log` — keeps everything harness-related in one place for diagnostics.
  Both are reasonable. Spec decides. **Scout position**: (b) — the continuation log is the diagnostic source of truth for the harness-continuation lifecycle; SessionStart cleanup is part of that lifecycle.
- **`.claude/state/` is runtime-only** — never shipped via `npm pack`, never committed to template, regenerated per session. The new marker fits this convention cleanly.
- **No backward compat layer needed for `harness_state`**: it's a runtime file overwritten on every tick. Old shape on disk gets read once (hook only looks at `.state`), then overwritten by the next harness write.
- **The harness skill's state-write is executed in main context by the model**, not by a script. The redesign means updating five SKILL.md SOPs (text instructions to the model). No code script writes `harness_state` today, and that does not change.
- **archived `harness-auto-continuation` workflow** at `docs/archive/2026-05-12/harness-auto-continuation/` contains the original spec for the current freshness-window design. Mentioned for context; not modified.

## Patterns in use here

- **Hooks are bash + python3 heredoc**: bash for env-passing and short logic, python3 for JSON parsing and numeric comparison. The harness_continuation hook follows this pattern at lines 33-104. New rungs follow the same shape: bash for `[ -f marker ]` (cheap), python3 inside heredoc for slug-equality WARN.
- **State-file writes are model-executed via Write tool**: described in SKILL.md SOPs. The pattern is "write `.claude/state/harness_state` with field X, Y, Z" — straight instructions to the model. The redesign drops two fields and adds the marker create/delete to the same instruction block.
- **Mirror invariant**: `src/CLAUDE.template.md` ↔ `CLAUDE.md` enforced byte-equal; `src/seed.template.md` ↔ `docs/init/seed.md` allowed to drift only at §16 reservation; `src/project.template.json` ↔ `.claude/project.json` not byte-equal (project.json has `configured: true`, template has `configured: false`).
- **Hook silence is the default failure mode**: every parse failure, every missing field, every bool false leads to `exit 0` silent. The hook is best-effort and never blocks the model. The redesign preserves this.
- **Logs go under `.claude/state/logs/<hook>.log`** with one-line entries `<ISO timestamp>  <message>`.

## Risks / landmines

- **Five callers of `harness_state` must update in lockstep.** If we update `harness/SKILL.md` but forget e.g. `simplify/SKILL.md`, the simplify phase will keep writing `written_at` and `tick_count`, and the marker won't be created when simplify writes `state: continue`. The redesign isn't complete until all five SKILL.md files match.
- **The marker create + state write are not atomic.** If the harness skill writes state=continue but then crashes before creating the marker, the next Stop event sees state=continue but no marker → silent. This is acceptable (auto-continuation is best-effort), but the SOP should write the marker FIRST, then `harness_state` — so the hook never sees the inverse (marker present but state stale) which would be more confusing.
- **Three of the existing tests are now ill-shaped** (`stale written_at`, `tick_count at cap`, and the `_fresh_and_under_cap` assertion in the happy-path test). They must be deleted or rewritten in the same diff as the hook change, or the test suite will fail.
- **The `harness_continuation.log` history** is a useful audit trail. The redesign should not delete the existing log; it should keep appending. SessionStart cleanup that writes to this log mixes two event types — distinguishable by prefix ("INFO removed stale .harness_active" vs "ran end-of-turn continuation check").
- **No `tests/memory_session_start.test.mjs` exists today** (confirmed by `ls tests/`). Adding the marker-cleanup behavior means creating that test file from scratch, or adding the test to `harness_continuation.test.mjs` as a `describe('memory_session_start marker cleanup')` block. Spec should decide.
- **Project.json key removal is a schema change** — even though the audit doesn't verify them, any external tooling that reads project.json (none today, but future) could break. The harness_continuation hook itself reads them via `.get('continue_window_seconds')` which returns None on missing → falls back to defaults `window = 10` / `cap = 20`. So even mid-redesign, missing keys do not error. Safe.
- **No swarm-worker prompt or other agent mentions `continue_window_seconds`** — the global ref grep showed only the files listed above plus the archive. Safe.
- **The hook currently logs every fire** at line 105 (`log_line harness_continuation "ran end-of-turn continuation check"`). 21 entries this session, 100% of fires. Post-redesign that doesn't change — the log shape stays the same. New SessionStart cleanup adds a different line shape; downstream parsers (none today) would need to recognize both.
- **`.claude/state/setup_guard_last_warn`** is an analogous "dot-prefixed marker" already in the state dir — confirming the dot-prefix convention for ephemeral markers is correct.
- **`workflow.skill-ownership.paused.json`** is in `.claude/state/` — confirming `.claude/state/` is used for non-state-file artifacts too (snapshots). Not a problem for the marker; just noting that the dir has heterogeneous contents.
