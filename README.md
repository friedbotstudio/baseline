# Claude Code Baseline Setup

A drop-in baseline for running Claude Code on any software project. Ships a
set of defensive hooks, structured subagents, and a workflow-aware slash
command set that enforce the engineering rules declared in
[`docs/init/seed.md`](docs/init/seed.md).

Claude Code becomes usable on a real codebase without you having to remember
to say "don't push, don't `--amend`, don't self-approve specs" every session —
the hooks enforce it.

## What you get

- **22 baseline hooks** — 17 write/run-boundary guards plus 4 lifecycle hooks plus 1 input-boundary hook
  (`memory_session_start.sh` injects the memory index + resume snapshot,
  `memory_stop.sh` extracts memory candidates and refreshes the resume
  snapshot at end of every turn, `memory_pre_compact.sh` captures the
  resume snapshot before context compaction so SessionStart can re-inject
  it after). The guards block unauthorized commits, `.env` edits,
  destructive shell commands, spec self-approval, PASS claims that
  contradict test output, artifact writes missing required sections,
  specs with broken or missing PlantUML diagrams, and more.
- **1 subagent** — `swarm-worker`, the only subagent in the baseline.
  Executes pre-decided recipes inside isolated git worktrees during
  `/swarm-dispatch`, invoking `Skill(scenario)` then `Skill(implement)`.
  Makes no design decisions. Every other capability that might have been
  a subagent (code authoring, test scenario design, scouting, security
  review, prose writing, UI design) lives instead as a **skill** that
  runs in main context with full conversation visibility — see the skill
  enumeration below.
- **36 skills**, organised into nine categories that mirror seed.md §4.3:
  - **Artifact drafting (4)** — `intake`, `brd`, `spec`, `rca`. Each ships
    a `SKILL.md` plus a `template.md`; the `spec` template is
    diagram-driven (C4 + UML + PlantUML dependency graph). Templates
    travel with their skill, not scattered in `docs/`.
  - **Workflow phases (10)** — `triage`, `scout`, `research`, `tdd`,
    `simplify`, `security`, `integrate`, `document`, `archive`, `commit`.
    Each is auto-invocable so `/harness` can chain them.
  - **Phase workers (5)** — `scenario`, `implement`, `verify`, `prose`,
    `design-ui`. Each executes a pre-decided recipe and mandatorily
    invokes a sub-skill: `scenario` and `implement` invoke
    `code-structure`; `design-ui` invokes `impeccable`; `prose` invokes
    `humanizer` always (and `copywriting` / `documentation` /
    `technical-tutorials` conditionally by register). `verify` is
    mechanical (run tests, stamp `.claude/state/last_test_result`).
  - **Spec helpers (4)** — `spec-lint` (preflight syntax / required
    diagrams / AC traceability), `spec-render` (PlantUML to SVG, user-only),
    `spec-diagram-review` (cross-consistency audit), `spec-traceability-review`
    (upstream AC linkage).
  - **Orchestration (3)** — `harness` (user + model invokable; a single
    `Skill(harness)` invocation loops internally through every non-gated phase
    boundary in one user turn, exiting cleanly at consent gates, phase failures,
    or workflow done; the `harness_continuation` Stop hook is a safety net for
    incomplete chains), `swarm-plan`
    (decompose an approved spec into a wave-scheduled plan), `swarm-dispatch`
    (parallel execution of waves with worktree isolation and merge audit).
    `harness` delegates to the swarm pair for specs with ≥3 independent
    components. `/triage` seeds a `TaskCreate`-backed checklist when a
    workflow starts so `/harness` can claim the next pending task,
    yield at consent-gate placeholders (`needs_user: true`), and
    cross-session-resume by re-seeding from `workflow.json → completed`.
  - **Memory (1)** — `memory-flush`. Reviews the auto-extracted candidate
    inbox at `.claude/memory/_pending.md` and curates keepers into the six
    canonical memory files.
  - **Shared globals (7)** — `claude-automation-recommender` (Apache 2.0,
    vendored from Anthropic's `claude-code-setup` plugin; modifications
    recorded in its `NOTICE`), `code-structure` (mandatory on every
    code-generation step), `humanizer`, `documentation`, `technical-tutorials`,
    `copywriting`, `impeccable` (the design global; modifications recorded
    in `PROJECT_NOTES.md`). Several ship Apache 2.0 with project-side
    modifications under §4(b); see each skill's `NOTICE` or `PROJECT_NOTES.md`.
  - **Drift defender (1)** — `audit-baseline`. Checks the implementation
    against `seed.md` (hooks/agents/skills/commands names + counts,
    settings wiring, project.json keys, MCP servers, helper scripts,
    vendored license files, cross-doc count claims). Read-only; runs in CI.
  - **Alternate tracks (1)** — `chore`. A stripped-down workflow for tasks
    that need no TDD (documentation, governance counts, vendored-skill
    content updates, configuration tweaks, formatting, dependency bumps,
    skill consolidations). Skips `/scenario` and `/implement`; routes
    through `simplify` / `integrate` / `document` only when their triggers
    apply. `verify`, `archive`, `/grant-commit`, `/commit` always run.
    Not a bypass — silent skips of triggered conditional phases are
    forbidden.
- **4 slash commands** — three consent gates (`/approve-spec`, `/approve-swarm`,
  `/grant-commit`) plus one bootstrap gate (`/init-project`). Commands differ
  from skills in exactly one way: Claude **cannot** invoke them via the Skill
  tool. They exist to make the human-in-the-loop guarantee structural rather
  than flag-based.
- **`CLAUDE.md`** — distilled non-negotiables (no stubs, no mocks of internal
  modules, no commented-out code, YAGNI, context7 for every library call,
  task discipline for in-flight workflows) kept in-session as project memory.

## Requirements

- Unix/Linux/macOS (bash scripts per seed.md § Baseline Truth).
- `bash` ≥ 4 and `python3` on `PATH`. No `jq` or other non-stdlib tools
  required.
- `node` + `npx` on `PATH` (for the three MCP servers: context7, plantuml, playwright — see below).
- `plantuml` CLI on `PATH` for strict diagram validation in `docs/specs/*.md`
  (`brew install plantuml` / `apt-get install plantuml`). If absent, the
  syntax guard runs in guide mode and `/spec-render` will refuse.
- Claude Code installed and authenticated.

## MCP servers

Three servers are declared in `.mcp.json` at the repo root so their capabilities
travel with the repo.

**`context7`** — library-docs lookup (required by seed.md § Context7 Rule).

- **Transport**: stdio via `npx -y @upstash/context7-mcp`. First invocation
  downloads and caches the package; subsequent runs are fast.
- **No API key required** for baseline use. To raise rate limits, swap the
  config to the HTTP transport and set `CONTEXT7_API_KEY`:

  ```json
  "context7": {
    "url": "https://mcp.context7.com/mcp",
    "headers": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}" }
  }
  ```

**`plantuml`** — interactive render and validation for the diagram-driven
`spec` template. Backs the `plantuml_syntax_guard` hook conceptually and
lets Claude preview diagrams while drafting.

- **Transport**: stdio via `npx -y plantuml-mcp-server`.
- **Server URL**: defaults to the public `https://www.plantuml.com/plantuml`
  (set via `PLANTUML_SERVER_URL`). For regulated repos, self-host Kroki
  and point the env var at it.

**`playwright`** — Microsoft-official browser automation MCP (Apache 2.0).
Drives Chromium, WebKit, and Firefox via stdio. Used by `design-ui` for
cross-engine visual checks (screenshots per breakpoint, accessibility-tree
snapshots, reserved-accent grep over the rendered DOM) and conditionally
by `integrate` for cross-engine smoke when the diff touches the rendered
UI.

- **Transport**: stdio via `npx -y @playwright/mcp@latest`.
- **First run** downloads ~300 MB of browser binaries; cost is paid once
  per machine.
- **Skills check `.mcp.json` for the server's presence before invoking**;
  a project that drops the declaration silently disables those steps
  without breaking either skill. Backend-only repos can omit it.

**First load**: Claude Code prompts each user to approve unknown MCP
servers from `.mcp.json`. This is intentional and cannot be pre-approved
from the repo — review and accept once per machine.

## Install into a target project

This repo is the baseline. To apply it to a real codebase, use the
`create-baseline` CLI:

```bash
# From anywhere — npx fetches and runs the published package:
npx create-baseline ./my-target

# Force-overwrite an existing baseline (interactive — type 'overwrite'):
npx create-baseline ./my-target --force

# Three-way merge against a previously-installed baseline:
# - Adds new baseline files
# - Refreshes baseline files the user hasn't touched
# - Preserves user-customized files (exit 3 if any)
# - Deletes baseline files removed upstream IFF the user hadn't touched them
npx create-baseline ./my-target --merge

# Skip the install-time PlantUML jar download:
npx create-baseline ./my-target --no-plantuml

# Preview without writing anything:
npx create-baseline ./my-target --dry-run

# Report drift between a previously-installed target and its install snapshot:
npx create-baseline doctor ./my-target
# Reports counts of matched / customized / missing / added files.
# Exit 0 if clean, 1 if any baseline files are missing, 2 if no manifest.

# Detect post-install tampering. Each customized file is printed as a
# TAMPERED: line with shipped vs observed sha256, and the command exits 1
# on any drift. Without --strict, customized files stay informational.
npx create-baseline doctor --strict ./my-target
```

Fresh install also writes `<target>/.npmrc` with `ignore-scripts=true` and `min-release-age=7`, so downstream consumers inherit the hardened npm defaults at install time.

The CLI is zero-runtime-dependency Node ≥ 18.17. It writes the four
sentinel paths (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`)
plus `.claude/bin/{LICENSE,NOTICE}` for the deferred-fetch PlantUML jar.
A sha256-keyed manifest at `.claude/.baseline-manifest.json` enables
deterministic upgrades via `--merge`.

### `.mcp.json` merge semantics

On every install (fresh or `--merge`), the CLI merges the baseline's
`.mcp.json` into yours with **baseline-refresh** behavior:

- **Servers named in the template are baseline-canonical**. The merge
  refreshes them from the template — so `--merge` delivers baseline arg
  and env updates (e.g., a new flag on the playwright server) to existing
  installs. **A user who customized a baseline-named server (currently
  `context7`, `plantuml`, `playwright`) loses that customization on the
  next merge.** Intentional customizations belong under a non-baseline
  name (e.g., `playwright-custom`) — those are preserved untouched.
- **Servers absent from the template are user-added** and are preserved
  byte-for-byte across merges.
- **Top-level JSON keys** outside `mcpServers` are additive: template
  keys are added when missing; the target's existing keys win.

For a manual install (e.g., from a local checkout without npm):

```bash
# From the root of your target project:
cp -R /path/to/setup_exp/.claude .
cp /path/to/setup_exp/CLAUDE.md .
cp /path/to/setup_exp/.mcp.json .        # context7 MCP for library docs
# Optional — the docs/ scaffolding (intake, specs, rca, brd templates):
cp -R /path/to/setup_exp/docs/{intake,specs,rca,brd,site} docs/
```

Then open Claude Code in that project and run:

```
/init-project
```

This detects your stack (Node/TS, Python, Go, Rust, …), proposes a
`.claude/project.json` with `test.cmd` / `lint.cmd` / TDD conventions, and
flips the `configured` flag. Until `/init-project` completes, the `setup_guard`
hook is **advisory only** — it emits a one-shot reminder (rate-limited to
10 minutes) on Write/Edit/MultiEdit so you don't forget, but writes are not
blocked. The bypass is intentional: you may want baseline-only behaviour.
The other guards (commit, env, spec-approval, verify-pass, track,
swarm-boundary, etc.) remain hard regardless of `configured` state.

## First-run quickstart

```
# 1. Configure the project
/init-project

# 2. Triage an incoming request — picks the workflow entry point and
#    records exceptions (e.g. skip OWASP review for a quickfix)
/triage "add retry logic to the webhook worker"

# 3. Run the phase commands that triage directed you to:
/intake      # Phase 1 — capture the request (intake skill)
/scout       # Phase 2 — map the touched code (scout skill)
/research    # Phase 3 — candidate approaches grounded in context7 (research skill)
/spec        # Phase 4 — draft docs/specs/<slug>.md (no self-approval)
/spec-lint <slug>       # optional — preflight syntax/presence/traceability
/spec-render <slug>     # optional — render PlantUML to SVG for reviewers
/approve-spec docs/specs/<slug>.md    # ← user only
/tdd         # Phase 6 — main context decides recipe; scenario skill writes
             #          failing tests, implement skill turns them green, verify
             #          stamps the verdict
             # OR for large specs: /swarm-plan → /approve-swarm → /swarm-dispatch
/simplify    # Phase 7 — cleanup pass + re-verify
/security    # Phase 8 — OWASP review (security skill, optional)
/integrate   # Phase 9 — full suite (integrate skill calls verify)
/document    # Phase 10 — docs (document skill orchestrates prose/documentation/technical-tutorials)
/archive     # Phase 10.5 — move slug artifacts to docs/archive/<date>/<slug>/
/grant-commit    # ← opens a 5-min consent window
/commit          # Phase 11 — archives workflow.json, stages named paths, commits
```

Or run the whole thing top to bottom:

```
/harness     # sequences all of the above; yields at each consent gate
             # (user runs /harness again to resume after approving)
```

Entry rules (per seed.md):
- New feature → enter at `/intake`
- Bugfix → enter at `/spec` or `/tdd` (triage decides)
- Quickfix → enter at `/tdd`
- Chore (no TDD-driven code change needed: documentation, governance counts,
  vendored content, config tweaks, formatting, dependency bumps,
  consolidations) → enter at `/chore`. Skips `/scenario` + `/implement`;
  routes through `simplify` / `integrate` / `document` conditionally based
  on what the diff touches.

## How the enforcement works (quick reference)

Hooks run at the Claude Code tool-use boundary. Every file write, every Bash
command, every spec approval passes through these gates before it happens:

| Hook | Runs on | What it enforces |
|------|---------|------------------|
| **setup_guard** | Write/Edit/MultiEdit/NotebookEdit | Advisory only when `configured: false` — emits a one-shot reminder (rate-limited to 10 min) that `/init-project` has not run. Does **not** block writes; bypass is intentional |
| **destructive_cmd_guard** | Bash | Hard-block catastrophic cmds (`rm -rf /`, fork bombs, `dd of=/dev/sd*`), `ask` on risky ones (`rm -rf <path>`, `git reset --hard`, `drop table`) |
| **git_commit_guard** | Bash | `git commit` requires a fresh consent token from `/grant-commit` (5-min TTL); `push`, `--amend`, `--no-verify`, `reset --hard`, etc. are hard-blocked regardless |
| **env_guard** | Write/Edit | Block `.env*` writes except clear template files (`.env.example`, `.env.sample`) |
| **spec_approval_guard** | Write/Edit | Block Claude from writing `Status: Approved` in specs or from writing anything to `.claude/state/spec_approvals/` — only `/approve-spec` may grant approval |
| **verify_pass_guard** | Write/Edit | Block Claude from writing `PASS` in a verify artifact when `.claude/state/last_test_result` says `FAIL` |
| **track_guard** | Write/Edit | Enforce workflow phase ordering — can't create a spec before intake, can't integrate before simplify, etc. Exceptions come from `/triage` |
| **artifact_template_guard** | Write/Edit | Block writes to `docs/{intake,brd,specs,rca}/*.md` that are missing required section headings — forces use of the corresponding micro-skill's template |
| **plantuml_syntax_guard** | Write/Edit | Validate every ```plantuml``` fence in `docs/specs/*.md` via `plantuml -checkonly -pipe`. Block writes on any parse error. Guide-mode if the CLI is absent |
| **spec_diagram_presence_guard** | Write/Edit | Block writes to `docs/specs/*.md` that omit required diagram kinds — C4 Context/Container/Component, sequence, class, dependency graph (configured in `project.json → artifacts.required_diagrams.spec`) |
| **tdd_order_guard** | Write | Require a corresponding test file before creating a new source file |
| **test_runner** | PostToolUse Write/Edit | Run `.test.cmd {file}` after each code change (guide mode until configured) |
| **lint_runner** | PostToolUse Write/Edit | Run `.lint.cmd {file}` after each code change (guide mode until configured) |

Configuration for test/lint commands, TDD conventions, and destructive
patterns lives in `.claude/project.json`. Consent/approval/verdict state
lives in `.claude/state/` (`commit_consent`, `spec_approvals/`,
`workflow.json`, `last_test_result`).

## Repository layout

```
.mcp.json                  # project-level MCP servers (context7, plantuml, playwright)
.claude/
  settings.json            # hook wiring + permissions
  project.json             # per-project config (test/lint cmd, TDD, artifacts)
  hooks/                   # 22 hook scripts: 17 write/run-boundary guards + 4 lifecycle hooks + 1 input-boundary hook
                           # (bash + python3, no jq)
    lib/common.sh          # shared helpers
  agents/                  # 1 subagent: swarm-worker (executes pre-decided recipes)
    swarm-worker.md        # rendered from src/agents/swarm-worker.template.md
  commands/                # 4 consent / bootstrap gates (user-only — Claude cannot invoke)
    approve-spec.md        approve-swarm.md       grant-commit.md        init-project.md
  skills/                  # 36 skills — both user- and model-invocable
    intake/   brd/   spec/   rca/                       # artifact drafting (4)
    triage/  scout/  research/  tdd/  simplify/         # workflow phases (part of 10)
    security/  integrate/  document/  archive/  commit/ # workflow phases (rest of 10)
    scenario/  implement/  verify/  prose/  design-ui/  # phase workers (5)
    spec-lint/  spec-render/                            # spec helpers (part of 4)
    spec-diagram-review/  spec-traceability-review/     # spec helpers (rest of 4)
    harness/  swarm-plan/  swarm-dispatch/              # orchestration (3)
    memory-flush/                                       # memory (1)
    claude-automation-recommender/  code-structure/     # shared globals (part of 7)
    humanizer/  documentation/  technical-tutorials/    # shared globals (part of 7)
    copywriting/  impeccable/                           # shared globals (rest of 7)
    audit-baseline/                                     # drift defender (1)
    chore/                                              # alternate tracks (1)
  memory/                  # 6 canonical knowledge files + _pending.md (staging) + _resume.md
  state/                   # runtime: workflow, consent, approvals, verdicts
src/                       # pristine ship-time templates (overlay source for `npx create-baseline`)
  CLAUDE.template.md       project.template.json     seed.template.md
  .mcp.template.json       settings.template.json
  agents/swarm-worker.template.md
  memory/<6 canonical>.template.md
CLAUDE.md                  # in-session project memory — the constitution
docs/
  init/seed.md             # the source of truth for this setup
  intake/ specs/ rca/ brd/ scout/ research/ security/ archive/
                           # produced artifacts live here (not templates)
  specs/_rendered/<slug>/  # build output from /spec-render (gitignore this)
```

## Customizing

- **Change the destructive denylist**: edit
  `.claude/project.json` → `destructive.hard_block_patterns` /
  `ask_patterns`. Patterns are Python regexes.
- **Change TDD mapping**: edit `.claude/project.json` → `tdd.source_globs`,
  `test_globs`, `exempt_globs`.
- **Change workflow phases**: edit `.claude/project.json` → `workflow.phases`
  and `workflow.artifacts`. Phase commands under `.claude/commands/` should
  match.
- **Replace a hook entirely**: each script in `.claude/hooks/` is independent
  bash. Projects are expected to replace `test_runner.sh` / `lint_runner.sh`
  with stack-specific logic once mature — the baseline versions are
  config-driven guides, not a final answer.

## Troubleshooting

- **"Setup Guard: not configured yet"** — you haven't run `/init-project`.
  That's intentional. Run it.
- **"Git Commit Guard: no consent granted"** — run `/grant-commit` first,
  then re-issue the commit within 5 minutes.
- **Hook produces no output but also doesn't block** — check
  `.claude/state/logs/<hook>.log` for an audit trail, and verify
  `/usr/bin/python3` resolves (the hooks require it).
- **`env: bash: No such file or directory`** when invoking hooks manually —
  your shell has a stripped PATH. The hooks defend against this when run by
  Claude Code itself, but a manual test may need `/usr/local/bin/bash` or
  similar explicitly.

## License

See LICENSE if present. The seed's rules (`docs/init/seed.md`) are intended
as a starting point you adapt — not a frozen standard.
