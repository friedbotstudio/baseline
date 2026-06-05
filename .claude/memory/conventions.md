---
owners: [scenario, implement]
category: repo-specific test and code conventions
size-cap: 500
key: short slug
verifies-against: codebase
---

# Conventions

Repo-specific patterns the `scenario` and `implement` skills should match. Fixture locations, helper idioms, naming, file layout quirks. Not generic best practices — specific facts about *this* codebase.

Each entry's stable key is a short slug.

---

## user-shipped-tooling-lives-in-claude-directory

> verbatim (user, 2026-05-21):
> always add user-shipped tooling inside .claude directory. The only thing that is outside of this directory is CLAUDE.md and .mcp.json (this can be added as convention so that we avoid this question in future)

- source: user-instruction
- Convention: all user-shipped baseline tooling — config files, state files, skills, hooks, agents, commands, memory, manifest — SHALL live under `.claude/`. The only two project-root exceptions are `CLAUDE.md` (the in-session constitution) and `.mcp.json` (the MCP server registry). Documentation files (`README.md`, `CHANGELOG.md`, `docs/init/seed.md`, `docs/specs/`, etc.) are project artifacts, not "tooling," and are out of scope of this convention — they live where existing conventions place them.
- Why: directory placement was an open question at workflow-extension-via-workflows-json's /approve-spec gate (OQ-2: should `workflows.jsonl` go at project root or under `.claude/`?). The user's answer codifies the broader principle to avoid re-asking on every future "where does this new file live?" decision. Resolution: `.claude/workflows.jsonl` (not `workflows.jsonl` at project root).
- How to apply: any future spec phase proposing a new shipped file checks: is it CLAUDE.md or .mcp.json? If neither, it goes under `.claude/`. The choice is no longer open for discussion unless the user explicitly raises it.
- Reference: docs/init/seed.md §3 Directory structure (this convention should be cited there at the next seed.md edit; tracked as part of the workflow-extension-via-workflows-json scope).
- verified-at: HEAD
- last-touched: 2026-05-21

## scout-coverage-on-governance-and-hook-changes

- Convention: when a workflow's write_set will touch `CLAUDE.md`, `docs/init/seed.md`, any hook implementation, or the consent-gate / commands surface, the `scout` phase SHALL enumerate `site-src/**` and `README.md` as touchpoints in addition to the obvious code paths. Also: every bash hook has a multi-paragraph header comment in its `.sh` body; when porting a hook to `.mjs` or renaming a peer hook's filename, the OTHER bash hooks' header comments need updates too (they reference the file by path).
- Why: in branch-aware-git-policy (2026-05-15), the original scout report listed CLAUDE.md/seed.md/audit but missed `site-src/index.njk` (the homepage SVG diagram + "Eleven phases, X gates" copy), `site-src/hooks.njk` (consent-gates section), `site-src/skills/{core,third-party}.njk`, `README.md` line 151, and the header comments inside `spec_approval_guard.sh`, `swarm_approval_guard.sh`, and `lib/common.sh` (which reference `consent_gate_grant.sh` even after the port to `.mjs`). The user caught all of these post-implementation; we did three drift sweeps before commit.
- How to apply: in the scout report's "Primary touchpoints" section, add a `## Rendered surfaces` subsection enumerating site templates and README files that mention the feature. Add a `## Peer-hook header comments` subsection for hook ports listing every `.claude/hooks/*.sh` whose header comment references the file being renamed.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16

## hook-script-shape

- Convention: every `.claude/hooks/*.mjs` script imports `lib/common.mjs` and calls `readPayload()` first. Decision emitters: `emitAllow`, `emitBlock`, `emitAsk`, `emitInfo`. JSON parsing native (no `jq`, no python heredoc); skill helpers follow the same Node ESM pattern.
- Why: ~5x faster startup than the legacy bash + python3 chain; one runtime to install; uniform error handling.
- Verified-at: HEAD
- Last-touched: 2026-05-28

## skill-ownership-frontmatter

- Convention: a `.claude/skills/<slug>/SKILL.md` is baseline-owned iff its YAML frontmatter declares `owner: baseline` on the line directly after `name:`. Every other on-disk skill — those without an `owner:` field, or those declaring `owner: user` — is user/third-party and out-of-scope of baseline audit checks. Absence-of-`owner` is the deliberate default so a project that already has its own skills can install the baseline without annotating any of those files. The build script `scripts/build-manifest.mjs` reads each `owner:` and emits `obj/template/manifest.json → owners.skills` as the canonical baseline-skill enumeration; `audit-baseline` consumes that map and verifies per-file sha256 drift for every baseline-owned skill.
- Why: provenance + zero-friction install. Baseline-owned skills can be re-overlaid by a future `npx @friedbotstudio/create-baseline upgrade` while user-owned skills are left alone. The absence-default policy means a user with 20 pre-existing skills doesn't have to annotate any of them when installing the baseline — only baseline-shipped SKILL.md files carry `owner: baseline`.
- Constraint: a SKILL.md with no `owner:` field is silently skipped (treated as user/third-party). A SKILL.md whose `owner:` value is present but malformed (anything other than `baseline` or `user`) fails the audit with `invalid owner=<value>`. Stripping `owner: baseline` from a baseline-listed slug surfaces as a `hash mismatch` row plus a `missing: [<slug>]` row in the names-match check — never as `missing owner frontmatter` (that error no longer fires).
- Reference: CLAUDE.md Article XI, seed.md §17.
- Verified-at: HEAD
- Last-touched: 2026-05-15

## dev-server-ownership

> verbatim (user, 2026-04-29, recorded in `_resume.md` snapshot):
> "if dev server is running (on 4321) do not start a new server and kill; only use playwright to open chrome; test and kill chrome; not the server; but if server is started by claude (in background shell) then kill it"

> verbatim (user, 2026-04-30, clarification after observed drift across multiple `/impeccable` passes that churned the dev server up/down):
> "if dev server is already running (say I manually started it), then do not kill the pid; else if dev server was started by claude (via bg shell) then it can choose to kill it after the work is finished."

- source: user-instruction
- key clause: **"after the work is finished"** — ownership lifetime is **session-end** (or explicit user signal that the server is no longer needed), **not per-task or per-pass**. Iterative work across multiple Edits, Plays, and verifications shares one server. The 2026-04-30 clarification was issued after Claude killed and respawned the server three times across a single conversation; that pattern is the failure mode to avoid.
- detection: before any spawn, run `lsof -ti:<PORT> -sTCP:LISTEN`. If something is listening, the user owns it: connect Playwright to the existing server, never kill the listener. If nothing is listening, Claude may spawn (capture PID at spawn) and owns the lifecycle until session-end.
- cleanup pattern: kill **only the captured PID** (`kill "$(cat /tmp/devserver-<PORT>.pid)"`). Never `lsof -ti:PORT | xargs kill` — see `landmines.md → lsof-port-kill-takes-firefox-with-it`.
- session-end signals: end of conversation, explicit user message ("done with the server", "kill it now"), `/grant-commit` typed, or context window exit. Mid-conversation pauses, edits, Playwright runs, or test cycles are NOT session-end.
- **Pattern (single-spawn, session-lifetime):**
  ```bash
  PORT=4321
  PID_FILE="/tmp/devserver-$PORT.pid"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    SERVER_OWNED_BY_CLAUDE=1                 # already spawned earlier this session
  elif lsof -ti:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    SERVER_OWNED_BY_CLAUDE=0                 # user owns it; don't touch
  else
    npx eleventy --serve --port=$PORT &      # spawn once, hold across passes
    echo $! > "$PID_FILE"
    SERVER_OWNED_BY_CLAUDE=1
  fi
  # … iterative work: edits, playwright open/close, verification, more edits …
  mcp__playwright__browser_close                # always close the browser between checks
  # … only at session-end (or on explicit user signal) …
  if [ "$SERVER_OWNED_BY_CLAUDE" = 1 ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
  fi
  ```
- applies-to: every skill or session needing a live preview — `impeccable live`, `verify` smoke, `integrate` browser tests, ad-hoc visual review during `/design-ui` or `/polish`, multi-pass `/impeccable` runs. Cross-reference with `landmines.md → lsof-port-kill-takes-firefox-with-it`.
- surfaced-by: `process_lifecycle_guard` PreToolUse hook on Bash matching `kill|pkill|lsof|fuser|npm run.*serve|npm run.*dev|eleventy --serve|vite|next dev|astro dev|http.server`.
- verified-at: HEAD
- last-touched: 2026-04-30

## test-yaml-line-parsing

- source: inferred-from-code
- convention: this repo enforces empty `dependencies` via `scripts/check-files-diff.mjs` (the `DEPS_FORBIDDEN` sub-check), so YAML-invariant tests cannot add `yaml` as a devDependency. Instead, parse `.github/workflows/*.yml` with line-based regex helpers that exploit YAML's indent structure: `topLevelBlock(text, key)` returns the body of a column-0 key (e.g., `on:`, `jobs:`, `concurrency:`); `jobBlock(text, name)` returns the body of a `  <name>:`-indented job under `jobs:`; `subBlock(blockText, subKey)` returns the body of an inner `    <key>:`-indented section (e.g., `permissions:`, `steps:`); `parsePermissions(blockText)` turns a permissions sub-block into a flat `{key: value}` map for `assert.deepEqual` checks; `usesDirectives(text)` returns every `uses:` line's value verbatim for SHA-pin assertions; `inputBlock(onBlockText, inputName)` returns the body of an `      <name>:`-indented input under `workflow_dispatch.inputs:`.
- why: the project's tarball-shape contract (`check-files-diff.mjs → DEVDEP_RANGE_FORBIDDEN`, `DEVDEP_NON_REGISTRY`) blocks loose devDep additions, and the runtime `dependencies` array is asserted empty. Importing a yaml parser would break either invariant or push churn.
- placement: helpers live ~10 lines each inside the test file that needs them. Do not extract a shared YAML utility module just for one or two test suites; DRY emerges from structure, not from premature extraction.
- reference: `tests/release-workflow.test.mjs:30–87` (the 6 helpers).
- applies-to: any test asserting on `.github/workflows/*.yml` shape or other project-controlled YAML.
- verified-at: HEAD
- last-touched: 2026-05-13

## test-esm-env-cache-bust

- source: inferred-from-code
- convention: ESM tests that dynamically import a target module under multiple env states MUST cache-bust the import URL by appending a unique query suffix: `pathToFileURL(file).href + '?t=' + Date.now() + '-' + Math.random()`. Node's ESM loader caches modules by URL string; without a unique suffix, the second `import()` returns the first call's evaluation regardless of env changes between calls. Save/restore `process.env.<VAR>` in a try/finally so concurrent test files don't pollute each other.
- why: eleventy global data files at `site-src/_data/*.js` read `process.env.GITHUB_RUN_ID` at import time. The same module needs to return `'gha-…'` in one test and `'dev'` in the next; without cache-busting, the second test sees the first test's frozen value.
- reference: `tests/site-build-id.test.mjs:39–58` (`importBuildData` helper).
- applies-to: any eleventy-data-file test or env-driven ESM module test where the import surface depends on `process.env`.
- verified-at: HEAD
- last-touched: 2026-05-13

## test-regression-trap-semantics

- source: inferred-from-code
- convention: when `/scenario` authors a new test suite, the per-test report must distinguish three pre-implement states: **RED** (test fails as expected, awaiting implement), **PASS_UNEXPECTEDLY** (test passes when it shouldn't — the assertion is probably too soft, or the implementation already accidentally satisfies it), and **REGRESSION_TRAP_PRE_PASSING** (test defends an invariant that must hold both before and after the change, e.g., "key X is absent from the manifest" — passing pre-implement is the correct initial state).
- why: the third category is easy to misclassify as PASS_UNEXPECTEDLY, which prompts implement-tick to "fix" a test that's actually working as designed. Surface it explicitly in the `## Written` block so implement leaves it alone.
- example: `tests/build-template-build-id.test.mjs` has two tests — one for `GITHUB_RUN_ID` set (RED pre-implement; goes green after stamping logic lands) and one for unset (REGRESSION_TRAP_PRE_PASSING — must continue to pass after implement adds the conditional stamp; ensures the dev manifest stays byte-identical when env is unset).
- reference: `.claude/skill-memory/scenario/MEMORY.md` (the originating note, now scratch-only after promotion).
- applies-to: `/scenario` per-test report; any TDD pass where an AC is "X is absent" or "X is unchanged".
- verified-at: HEAD
- last-touched: 2026-05-13

## action-labels-centralized-in-merge-js

- source: code-pattern
- convention: User-facing labels for the per-file upgrade-action report live exclusively at `src/cli/merge.js → ACTION_LABELS` (a frozen object mapping each `ACTION_KIND` enum value to a plain-language string) and `ACTION_LABEL_WIDTH` (the `Math.max(...labels.length)` width). Both render paths consume the same map: `bin/cli.js → runPlainUpgrade` (non-TTY) and `src/cli/tui/upgrade.js → run` (TTY dry-run + final report). Adding a new `ACTION_KIND` requires extending `ACTION_LABELS` in the same edit; otherwise the renderer's `?? action.kind` fallback exposes the raw SCREAMING_SNAKE_CASE enum to end users.
- why: prior to 2026-05-21 each render site padded `action.kind` directly to 28 cols; users saw `MECHANICAL_MERGE_CLEAN  .claude/...` etc. The centralization keeps the two render paths byte-identical without duplicating the label dictionary, and it gives `/cli-copy-review` a single place to audit instead of every render call site.
- how to apply: when introducing a new merge outcome, (1) add the enum to `ACTION_KINDS`, (2) add the label to `ACTION_LABELS` in the same `Object.freeze` block, (3) rebuild — `ACTION_LABEL_WIDTH` recomputes automatically. The rendered docs site (`site-src/cli.njk`'s action table) mirrors the same map manually; update it in the same commit to keep doc/CLI parity.
- applies-to: any new ACTION_KIND added to `src/cli/merge.js`; any new render call site that displays per-file upgrade actions.
- verified-at: cb1d511
- last-touched: 2026-05-21

## brainstorm-stage2-discipline-assertor-pattern

- source: code-pattern
- convention: When a skill emits user-facing dialogue turns that must obey a structural rule (e.g., "no solution-shaped tokens"), implement the rule as a **discipline assertor**: a pure-function scanner that runs against every model-emitted text BEFORE emission. `.claude/skills/brainstorm/discipline.mjs → scanTurn(text)` is the canonical example: regex bank covering solution verbs (`implement`, `refactor`, `add X`), library names (Redis, PostgreSQL, etc.), and proposal phrasing (`we could`, `I recommend`). The scanner returns `violations[]`; the calling skill rewrites the turn until the array is empty. Tests assert the violation behavior with conforming + counter-example fixtures.
- why: structural discipline is harder to drift than prose-only rules. The discipline assertor is a piece of code with a test; the alternative ("Stage 2 SHALL NOT propose solutions" as prose-only guidance) is unenforceable across drift.
- how to apply: when a new skill has a dialogue surface with a "shall not say X" rule, write the assertor as a Foundation-layer .mjs module beside the SKILL.md; reference it from the SKILL.md Stage description; add tests with both conforming and violating fixtures. The assertor is the structural enforcement; the SKILL.md prose is the documentation.
- applies-to: any new skill with multi-turn dialogue + a structural rule on emission content. The brainstorm Stage 2 discipline is the first instance; the pattern generalizes.
- verified-at: 8436ede
- last-touched: 2026-05-29

## workflow-json-read-time-defaults

- source: code-pattern
- convention: When extending `workflow.json` with a new optional field, implement read-time defaults via a **defaults helper** (`.claude/skills/<owner-skill>/workflow-defaults.mjs → withDefaults`) that every reader calls. The helper applies `?? false` (or the field's documented default) on missing fields and returns a NEW object (no mutation). Legacy `workflow.json` files lacking the field continue to work without a migration write — the defaults materialize at read time, not at on-disk migration time.
- why: in-flight workflows on disk pre-date the new field. Forcing a migrator write on every reader is brittle (race conditions, partial writes, lockfile coordination). Read-time defaults keep the on-disk shape ungoverned at the cost of slightly more code per reader; the centralized helper keeps the per-reader cost ~3 lines.
- how to apply: (1) add the helper at `.claude/skills/<owner>/workflow-defaults.mjs` with `export function withDefaults(workflowJson) { return { ...workflowJson, <new_field>: workflowJson?.<new_field> ?? <default> }; }`; (2) every skill that reads the field calls `withDefaults(JSON.parse(readFileSync(...)))` first; (3) test the default-applied path AND the explicit-true path AND the no-mutation invariant. AC-008 of brainstorm-and-codesign codifies this pattern.
- applies-to: any future `workflow.json` schema additions. The pre-§18 → §18 migrator at `src/cli/workflow-migrator.js` is a different category (one-shot shape migration); the read-time defaults pattern is for additive optional fields.
- verified-at: 8436ede
- last-touched: 2026-05-29

## state-write-discipline-tool-mandate

- source: user-feedback
> verbatim (user, 2026-06-02):
> I'd say use constitution style legalese to harden the SOP for all such skills so that it doesn't take detour.
- convention: Every SOP that writes under `.claude/state/` obeys a two-tier tool mandate. Canonical text: `.claude/CONSTITUTION.md` §2 "State-write discipline". **Tier 1 — consent artifacts** (`commit_consent`, `push_consent`, `*.approval` under `spec_approvals/`·`swarm_approvals/`, `.*_grant` markers): written with the **Write tool only**. Bash writes (`>`/`>>`, heredoc, `tee`, `cp`, `sed -i`) are blocked by `destructive_cmd_guard → writesConsentPath`, and the approval guards validate the gate marker only on Write/Edit/MultiEdit. **Tier 2 — workflow/runtime state** (`workflow.json`, `harness_state`, `last_test_result`, `.harness_active`, `tdd/<slug>.json`): prefer the Write tool; Bash only via shell builtins (`>`), with `rm -f` the sole external-binary exception (marker deletes). **Path/existence checks** use Read/Glob, never `dirname`/`basename`/`[ -f ]`.
- why: the enforcement layer is tool-aware. An SOP that says "write the token" without binding the tool invites a Bash redirect that is structurally guaranteed to be blocked — observed: `/approve-spec` tried a Bash heredoc → destructive-guard block, then `command not found: dirname` under a stripped PATH. Binding the tool removes the detour.
- how to apply: the 4 gate commands (approve-spec, approve-swarm, grant-commit, grant-push) and the harness/integrate/tdd/verify SKILLs cite §2 directly and name the tier. New SOPs that write state cite §2. Never grant `Bash(tee:*)` in a gate command's `allowed-tools` (it's a consent-path write-verb the destructive guard blocks).
- applies-to: any command/skill SOP that writes under `.claude/state/`.
- verified-at: ba5d91b
- last-touched: 2026-06-02

## test-repo-clone-helpers-exclude-config-and-copy-cow

- source: code-pattern
- convention: A test that clones the working tree into a tmpdir (via `rsync` directly or `tests/helpers/clone-and-build.mjs → cloneAndBuild`) SHALL exclude `.config` alongside `node_modules`/`obj`/`.git`/`docs/archive`/`.playwright-mcp`. When a test makes many writable copies of one pristine built tree, copy them copy-on-write where the platform supports it: `cp -ac` (APFS clonefile) on macOS, `cp --reflink=auto` on Linux, with a plain `cp -a` fallback (`tests/skill-ownership.test.mjs → cowCopyTree`).
- why: `.config` is Claude Code's own gitignored local state (memory, transcripts, file-history) and reaches a few hundred MB on a dev machine, so an unfiltered clone drags it into every `rsync` and every per-test copy though it is irrelevant to any build or audit. Excluding it took `skill-ownership.test.mjs` from ~40-50s to ~10s and the default suite median from ~90-285s to ~34s. The exclude is a no-op in CI / fresh checkouts (where `.config` lives under `$HOME`, not the repo), so it only ever helps. COW copies make per-consumer clones near-instant; mutating tests diverge correctly on first write.
- how to apply: add `'--exclude=.config'` to the rsync exclude list in any clone helper; for many-copy patterns route the copy through a portable COW helper. Five inline clone sites + the shared `cloneAndBuild` helper carry the exclude as of this entry.
- applies-to: `tests/helpers/clone-and-build.mjs` and any test that rsync-clones the repo (skill-ownership, audit-baseline-post-amendment, upgrade-project, workflows-install-upgrade, manifest, build-lock-dir, …). Measurement discipline: single-shot suite timings are noise-dominated — profile per-test `duration_ms` and take a median across runs. Cross-ref: `docs/testing.md → Tests that need a built template`; landmine `live-objtemplate-rebuild-races-parallel-test-readers`.
- verified-at: c32aaaa
- last-touched: 2026-06-05
