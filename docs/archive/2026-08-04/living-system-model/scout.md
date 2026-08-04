# Codebase Scout Report — living-system-model (durable architecture memory + decision graph)

Scoped from `docs/intake/living-system-model.md` (Problem + Goal) and the six slices in
`.claude/state/epic/living-system-model.json`. Read-only pass; the only write is this file.

## Primary touchpoints

**Staleness predicate (slice A)**
- `.claude/hooks/lib/memory_session_start.mjs:19-20` — `STALE_COMMITS = 30`, `STALE_DAYS = 30`. One predicate, applied uniformly to every category.
- `.claude/hooks/lib/memory_session_start.mjs:18` — `STALE_EXEMPT_FILES = new Set(['backlog'])`. **A per-category exemption mechanism already exists.** `backlog` is exempt because intent does not verify against code.
- `.claude/hooks/lib/memory_session_start.mjs:113-122` — decay reads `verified-at` (git SHA distance), falling back to `last-touched` days. The comment at :121 records that a prior `verified-at: HEAD`-is-permanently-fresh hatch was removed.
- `.claude/hooks/lib/memory_session_start.mjs:131-148, 191-237` — sharded and flat counting paths, both feeding one `staleRecords` list.

**Surfacing path (slice C — the AC-1 root cause)**
- `.claude/hooks/process_lifecycle_guard.mjs:31-37` — `PHASE_BY_PREFIX` maps `docs/specs/`→`spec`, `docs/intake/`→`intake`, `docs/scout/`→`scout`, `docs/research/`→`research`, `docs/security/`→`security`. **Every entry is a `docs/` prefix.**
- `.claude/hooks/process_lifecycle_guard.mjs:39-49` — `phaseForPath()` returns null for any path outside those prefixes, and the guard calls `emitAllow()` immediately. A Write/Edit to a source file therefore surfaces nothing, by construction.
- `.claude/hooks/lib/scoped-memory.mjs:42-45` — `scopedFactsIn()` filters on `asArray(entry.fields.scope).includes(phase)`. Scope values are workflow phases; there is no non-phase scope value.
- `.claude/hooks/lib/scoped-memory.mjs:62-68` — `surfaceScopedMemory(phase, {rootDir})`, the single entry point. Returns `[]` when `phase` or `rootDir` is falsy, and on an unmigrated flat store — so it no-ops safely rather than throwing.

**Capture path (slice D)**
- `.claude/hooks/lib/memory_stop.mjs:262-274` — loads the existing `_pending.md` body and builds `existingKeys`.
- `.claude/hooks/lib/memory_stop.mjs:373` — `if (existingKeys.has(key)) continue;` — cross-invocation dedup **does** exist, scoped to the current pending body.
- `.claude/hooks/lib/memory_stop.mjs:287, 338-340` — `seenIntentKeys` dedupes intent candidates within a single turn on `${key}::${sourceValue}`.
- `.claude/hooks/lib/memory_stop.mjs:23, 126-210` — `isSource()`, `extractTextBlocks()`, `filterNoise()`, `isFlushReport()`, `isSelfReferential()`, `stripSkillEnvelope()`, `matchesIntent()` — the heuristic extraction chain. Intent detection is regex over line/sentence blocks.

**Curation actuator (slices A, D)**
- `.claude/skills/memory-flush/sweep.mjs:475-479` — five modes: `auto-close`, `prose-scan`, `stale-sweep`, `stamp-closure`, `backlog-decay`.
- `.claude/skills/memory-flush/route.mjs:22-26` — `classify()` returns one of `landmark` / `open-question` / `backlog` / `decision`. **No `constraint` bucket.**
- `.claude/skills/memory-flush/route.mjs:29-52` — `salience()` + `suggestRoutes()`. Pure; reads and writes nothing.
- `.claude/skills/memory-flush/shape.mjs`, `next-q-id.mjs` — entry-shape helper and Q-NNN allocator.

**Schema and storage**
- `.claude/memory/README.md:98` — sharded shape: `<category>/<key>.md`, frontmatter carries `key:` verbatim, `category:`, `scope:`. No per-file line cap.
- `.claude/memory/README.md:100` — the scope/surfacing contract, naming `process_lifecycle_guard` → `surfaceScopedMemory(phase)` explicitly.
- `.claude/memory/README.md:115-138` — closure fields. **`superseded-at:` already exists on `decisions.md`** (and on landmarks, libraries, landmines, conventions, backlog); `resolved-at:` is `pending-questions`-only, and the two are mutually exclusive per file.
- `.claude/hooks/lib/frontmatter-parser.mjs:34, 41` — `parseFrontmatter()`, `asArray()`. The shard reader every consumer goes through.
- `.claude/project.json → memory.sharded_store` — `enabled: true`, `activated_at: 2026-07-17`, reverse migration at `.claude/skills/memory-index/migrate.mjs --reverse`.

**Structural / diagram surfaces (slice E)**
- `.claude/hooks/spec_diagram_presence_guard.mjs:74-80` — blocks a spec missing required kinds; points at `.claude/skills/spec/template.md` for skeletons.
- `.claude/project.json → artifacts.required_diagrams.spec` — six kinds, each with a detection marker: `c4_context`, `c4_container`, `c4_component` (via `!include <C4/...>`), `sequence` (`participant`/`actor`), `class` (`class \w`), `dependency_graph` (`'@kind dependency-graph`).
- `.claude/hooks/plantuml_syntax_guard.mjs` — advisory unless `plantuml.strict_syntax_check`.
- `.claude/project.json → artifacts.required_sections.spec` — `Goal, Design, Design calls, Acceptance criteria, Test plan`. The diagrams live inside `## Design`, which archives per slug.

## Entry points that reach this code

- **SessionStart** → `.claude/hooks/memory_session_start.mjs` → lib. Emits the memory index, stale table, and the pending-nag.
- **Stop** → `.claude/hooks/memory_stop.mjs` → lib. Appends candidates to `_pending.md`.
- **PreToolUse / Write|Edit|MultiEdit|NotebookEdit** → `.claude/hooks/process_lifecycle_guard.mjs`. The write leg calls `surfaceScopedMemory`. Advisory; never blocks.
- **PreToolUse / Write|Edit** → `spec_diagram_presence_guard.mjs`, `plantuml_syntax_guard.mjs`, `artifact_template_guard.mjs` on `docs/specs/**`.
- **`/memory-flush`** (user or Phase 10.7) → `sweep.mjs` modes + main-context curation.
- **`/commit` Step 6** → `sweep.mjs --mode stamp-closure` when `workflow.json → source_backlog_keys` is non-empty.
- **`/scout`** (this skill) → no durable-model read exists. It walks the codebase fresh each run; `code-browser` is the navigation accelerator, not a persisted map.

## Existing tests

28 memory-subsystem test files under `tests/`. The ones this work will touch:

- `tests/memory-session-start-head-decay.test.mjs` — the `verified-at: HEAD` decay semantics slice A changes.
- `tests/memory-session-start-size-cap.test.mjs`, `memory-session-start-pending-nag.test.mjs`, `memory-session-start-mid-flight.test.mjs`, `memory-session-start.test.mjs` — the index/nag surface.
- `tests/memory-scoped-surface.test.mjs` — the `scope:`→phase surfacing contract slice C extends.
- `tests/memory-stop-dedup.test.mjs` — header at :1 names it a regression test for a **cross-invocation dedup bug**; `describe()` at :72 is `memory_stop cross-invocation dedup`. Slice D must not regress this.
- `tests/memory-stop-recall.test.mjs`, `memory-capture-noise-filter.test.mjs`, `memory-sentence-capture.test.mjs` — capture heuristics.
- `tests/memory-flush-routing.test.mjs`, `memory-flush-phase.test.mjs` — routing buckets and Phase 10.7 fast-path.
- `tests/memory-shard-store.test.mjs`, `memory-readers-sharded.test.mjs`, `memory-sharded-writeside.test.mjs`, `memory-shard-audit.test.mjs`, `memory-migrate.test.mjs` — the sharded storage contract.
- `tests/sweep-relift-precondition.test.mjs`, `sweep-replace-dollar-injection.test.mjs` — sweep actuator safety.

No test asserts that a source-file edit surfaces a decision — consistent with the intake's baseline of 0.

## Constraints and co-changes

- `.claude/project.json → memory.sharded_store.enabled: true` — the store is sharded here. Readers detect shape presence-based; no flag is consulted at read time, so any new reader must handle both shapes.
- `.claude/project.json → security.sensitive_globs` includes `.claude/hooks/**` — slices C and D modify hooks, so their child workflows carry a mandatory `/security` phase.
- `.claude/project.json → artifacts.required_diagrams.spec` — the six required kinds are config, not code. A durable corpus that changes which diagrams are authoritative co-changes this key.
- `.claude/memory/README.md` is documentation and is **excluded from `/memory-flush` writes** by that skill's own constraints — schema changes edit it directly, outside the flush path.
- `superseded-at:` closure is already wired end to end (`closure-check.mjs`, `sweep.mjs --mode auto-close`, README:115-138). Slice A extends a live mechanism rather than introducing one.
- Baseline-owned skills carry manifest sha256 + a skill count asserted in three places (Article XII). Any new skill triggers `tests/audit-skill-count-drift.test.mjs` and `derive-counts.test.mjs`.

## Patterns in use here

Hooks are thin dispatch wrappers over `.claude/hooks/lib/<name>.mjs`, which holds the logic and is what tests import — new behavior goes in the lib, not the hook file. Storage-shape handling is **presence-based**: readers probe the directory and adapt, and no flag is read at access time, so flat and sharded stores both work without branching at the call site. Memory hooks are advisory and fail-open (`emitAllow()` on any doubt); the blocking guards are a separate set. The curation split is consistent throughout — deterministic `.mjs` actuators do the mutation, main context decides what to mutate, and promotion to canonical stays human-only.

## Risks / landmines

- **The capture leg is not undedup'd — it dedupes against the wrong lifetime.** `memory_stop.mjs:262-274, 373` builds `existingKeys` from the *current* `_pending.md` body, and `tests/memory-stop-dedup.test.mjs` guards it. The observed re-emission on 2026-08-04 happens because `/memory-flush` resets the body, which discards the dedup state along with the candidates. Slice D's problem is therefore **persisting a curation decision across the flush boundary**, not adding dedup. Framing it as the latter would duplicate working code and risk regressing that test.
- **`superseded-at:` already exists on decisions.** Slice A does not need a new closure field. The defect is that the *staleness predicate* (`memory_session_start.mjs:19-20`) ages entries by time regardless of whether supersession is even applicable. The narrow fix is at the predicate, and `STALE_EXEMPT_FILES` at :18 is the existing extension point.
- **`PHASE_BY_PREFIX` has no non-`docs/` entry, and `scope:` values are workflow phases.** Surfacing at edit time is not a config change — it needs either a new scope vocabulary (path globs alongside phases) or a second surfacing trigger keyed on path. This is the largest unknown in slice C and it is a design decision, not a lookup.
- **`route.mjs` has no `constraint` bucket** (`:22-26`), so slice B adds a classification path, not just a storage category.
- **`surfaceScopedMemory` returns `[]` on an unmigrated flat store.** Any new surfacing must preserve that no-op, or the change breaks consumer installs that have not migrated.
- **Diagram authority is split** between `.claude/project.json` (which kinds are required) and `.claude/skills/spec/template.md` (their skeletons). A durable corpus creates a third location; without a decision on which is authoritative this drifts.
- **Slice E has no existing surface to extend.** Every other slice modifies something that runs today; the durable structural corpus does not exist in any form. This supports the triage-time note that E may warrant its own epic.
- The `intake` skill's prerequisite text does not name the `epic` track (already recorded in the intake's Open questions). Unrelated to scope; noted so it is not rediscovered.
