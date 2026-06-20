# Codebase Scout Report — per-phase wall-clock timing instrumentation

Scope: how workflow phase boundaries are currently observed/recorded, where durable run-state lives, and where a per-phase duration table could render into the archive bundle. Read-only survey; no approach recommendation (that is `/research`'s job).

## Primary touchpoints

- `.claude/state/harness/<slug>.log` — **already records ISO-8601-timestamped boundary events**: `entered <phase>`, `completed <phase> (notes)`, `yielded at /<gate>`, `resumed; <gate> satisfied`. This is the closest existing artifact to the goal. Format is `<ts> <free-text event>`. Written by the **model** following harness `SKILL.md` prose (Bash append), so it exists **only on `/harness`-driven runs** and is **not a structured schema**.
- `.claude/skills/harness/SKILL.md` — defines the loop boundary points where the model logs transitions and refreshes `harness_state`. The "marker-then-state ordering" and per-iteration `entered`/`completed` log lines are the model-driven stamp sites. No code chokepoint — the harness loop is prose the model executes.
- `.claude/state/workflow.json → completed[]` — **deterministic phase-end markers**. Every phase skill appends its phase name here on success (see "Entry points" below), independent of `/harness`. Carries **no timestamps** today — it is an ordered set of phase names only.
- `.claude/skills/archive/archive.sh` — Phase-10.5 executor. `PAIRS[]` array maps `docs/<phase>/<slug>.md` → `<bundle>/<name>.md` and `git mv`s them into `docs/archive/<YYYY-MM-DD>/<slug>/`. `set -u` bash, exit codes 0/1/2, idempotent. A duration table would be a **generated** file in the bundle (e.g. `timing.md`), not a move — there is no generation step here today.
- `.claude/skills/archive/SKILL.md` — Step 2 invokes `archive.sh <slug>`, then Step 4 appends `"archive"` to `completed`. The render-the-table step would slot at/after Step 2.
- Consent-gate tokens — `.claude/state/spec_approvals/<slug>.approval`, `.claude/state/swarm_approvals/<slug>.approval`, `.claude/state/commit_consent`, `.claude/state/push_consent`. When present, each file's **mtime is a deterministic timestamp for when human consent landed** = the end of a human-wait gap at that gate. (Currently empty/absent for this slug — no active approval.)

## Entry points that reach this code

- **`/harness`** (model-driven loop) — the only path that writes `harness/<slug>.log`. Stamps every boundary as a side effect of loop prose.
- **Manual phase invocation** — `/intake`, `/scout`, `/research`, `/spec`, `/tdd`, `/integrate`, `/document`, `/archive`, etc. each append to `completed[]` directly. These produce **no harness log**. This is the intake's open question: manual runs are observable only via `completed[]` growth + token mtimes, not the harness log.
- Skills that append to `completed[]` (deterministic phase-end signal, harness-independent): `intake`, `brd`, `scout` (this skill, Step "after writing"), `research`, `spec`, `security`, `integrate`, `document`, `archive`, `memory-flush`, `commit`, `chore`, plus `harness` itself. ~14 sites.

## Existing tests

- `tests/harness_continuation.test.mjs` — harness Stop-hook safety-net behavior.
- `tests/harness-migrator-shipped-path.test.mjs`, `tests/workflow-migrator.test.mjs` — workflow.json shape/migration.
- `tests/archive-brief-pairs.test.mjs` — archive.sh PAIRS coverage (the natural sibling for a new bundle artifact test).
- `tests/workflow-json-defaults.test.mjs` — workflow.json read-time defaults.
- No existing test covers harness-log content or any timing/duration logic — net-new surface.
- Runner: `node --test --test-reporter=spec tests/*.test.mjs` (one `*.test.mjs` per feature; `node:test`).

## Constraints and co-changes

- **Tier-2 state-write discipline** (CONSTITUTION §2) — anything under `.claude/state/` is not guard-blocked but must use the Write tool / shell builtin redirects, never `tee`/`sed -i`. A timing log/state file lives here.
- **Shipped-helper hygiene** (Article XI / spec-shippability) — a new helper must be `.mjs`/`.js` or `.sh` (no Python), top-level in the skill dir, and listed in `obj/template/.claude/manifest.json` or the consumer install won't have it; `audit-baseline` + `spec-shippability-review` enforce.
- **Hooks** — if a deterministic stamp is wanted, the hook layer (PreToolUse/PostToolUse on Write/Edit to `workflow.json`) is where `track_guard` already observes phase state (`completed = new Set(ws.completed)`, line 77). `memory_session_start.mjs` and `harness_continuation.mjs` already **read** `harness/<slug>.log`, so its format is consumed by ≥2 hooks — changing the log shape is a co-change with those readers.
- **Two gates in this workflow** — `approve-spec`, `grant-commit` (swarm gates excepted at triage). Human-wait is measurable at exactly these two yield points.
- Touching harness/archive flow → `audit-baseline` and docs-site count/prose checks must stay green.

## Patterns in use here

State writes are small JSON or append-only logs under `.claude/state/`, written by the model (harness prose) or by shell helpers (`archive.sh`). Timestamps in the codebase use UTC ISO-8601 (`date -u +%Y-%m-%dT%H:%M:%SZ`) for logs and epoch seconds for `workflow.json` (`created_at`/`updated_at`). Helpers are small, single-purpose `.mjs` (ES modules, `node:` imports) or `.sh` (`set -u`). Tests are black-box per-feature `*.test.mjs`.

## Risks / landmines

- **The harness log is model-driven, not an oracle.** AC-001 wants a *durable record at each boundary*; relying on the model to append log lines is exactly the fragility the maker-checker proof-obligation contract (backlog `-d186`/`-4c43`) warns against. A deterministic signal (hook on `completed[]` growth + token mtimes) is the oracle-bound alternative. This is the central design tension for `/research`.
- **Free-form log lines are brittle to parse.** Existing entries carry trailing parentheticals (`completed verify-tick (PASS)`, `completed implement-tick (17 unit tests green)`) and ad-hoc events (`drift exit 1: ...`). Computing a clean duration table off this text is error-prone; a structured record avoids it.
- **Manual-run coverage gap.** No `harness/<slug>.log` exists when phases are run without `/harness`. The only harness-independent timing signals are `completed[]` growth (needs timestamps added) and consent-token mtimes.
- **Log shape is shared.** `memory_session_start.mjs` + `harness_continuation.mjs` read `harness/<slug>.log`; a schema change there is a co-change.
- **archive.sh is move-only `set -u` bash.** Adding table-generation logic inline vs. a separate `.mjs` invoked from archive `SKILL.md` is an approach fork for `/research` (the latter fits the "helpers are .mjs" pattern better and is easier to unit-test).
- **Reflexivity.** This very workflow (`phase-timing-instrumentation`, intake-full) is a live run whose own boundaries are being logged now — it can serve as the first validation dataset, but the instrumentation won't retroactively cover phases already completed before it ships.
