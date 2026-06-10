<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/logo-baseline.svg">
  <source media="(prefers-color-scheme: light)" srcset="./.github/assets/logo-baseline.svg">
  <img alt="Claude Code Baseline" src="./.github/assets/logo-baseline.svg" width="160">
</picture>

<br/><br/>

# Claude Code Baseline

A discipline layer for Claude Code. Hooks at every tool boundary, a workflow that runs from intake to commit, and a small constitution that the agent cannot bypass.

<br/>

[![License](https://img.shields.io/github/license/friedbotstudio/baseline?style=flat&color=111111&labelColor=555555)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/friedbotstudio/baseline?style=flat&color=111111&logo=git&logoColor=white&labelColor=555555)](https://github.com/friedbotstudio/baseline/commits/main)
[![Release](https://img.shields.io/github/v/release/friedbotstudio/baseline?style=flat&color=111111&include_prereleases&display_name=tag&label=release&labelColor=555555)](https://github.com/friedbotstudio/baseline/releases)
[![Release CI](https://img.shields.io/github/actions/workflow/status/friedbotstudio/baseline/release.yml?style=flat&logo=githubactions&logoColor=white&label=release&labelColor=555555)](https://github.com/friedbotstudio/baseline/actions/workflows/release.yml)
[![Built with Claude](https://img.shields.io/badge/Built_with-Claude-D4A574?style=flat&logo=anthropic&logoColor=white&labelColor=555555)](https://claude.com/claude-code)

[![Get started](https://img.shields.io/badge/Get_started-Install-ea6a25?style=flat&labelColor=111111)](#installation)
[![Docs](https://img.shields.io/badge/Docs-baseline.friedbotstudio.com-ea6a25?style=flat&labelColor=111111)](https://baseline.friedbotstudio.com/)

<br/>

[Overview](#what-this-is) · [Why](#why-this-exists) · [Install](#installation) · [Quickstart](#quickstart) · [Inventory](#what-gets-installed) · [Enforcement](#how-the-enforcement-works) · [Contributing](#contributing)

---

</div>

> [!WARNING]
> **Public alpha — under active development.** Expect breaking changes, evolving APIs, and shifting structural counts between releases. The constitution and the consent-gate semantics are stable; specifics in `docs/init/seed.md` §16 may move. Pin to a specific `@friedbotstudio/create-baseline@<version>` for repeatable installs across a team.

> [!IMPORTANT]
> **Install in one line:** `npx @friedbotstudio/create-baseline ./your-project`
>
> The CLI fetches the published package, runs the install, and leaves your project with `.claude/`, `CLAUDE.md`, `docs/init/seed.md`, and `.mcp.json`. Re-run with the `upgrade` subcommand to bring an existing install forward (interactive in a TTY, batch-mode in CI). Add `--dry-run` to preview, and run `doctor` to report drift (pass `--json` for machine output).

## What this is

The Claude Code Baseline is a repository overlay shipped via `npx @friedbotstudio/create-baseline ./target`. It installs **23 hooks** at Claude's tool boundaries, **41 skills** organised into thirteen categories, **1 subagent** for parallel work in isolated worktrees, **7 canonical workflow tracks** declared in `.claude/workflows.jsonl` (where `intake-full` runs 11 nodes from intake to commit), and **3 user-typed consent gates** that Claude cannot forge.

Every soft engineering rule a team usually repeats every session — _don't push, don't `--amend`, don't self-approve specs, don't skip phases, don't mock internal modules_ — becomes a structural guarantee because the hooks run **outside Claude's tool boundary**. Claude cannot disable a hook with a flag, cannot write a consent marker, cannot reorder the phases without an explicit exception that triage records on disk.

The contract is small and traceable. `docs/init/seed.md` is the genesis prompt. `CLAUDE.md` is the in-session constitution. The hooks, skills, commands, and config files are the actuators. Order of precedence is `seed.md > CLAUDE.md > implementation`. Every claim in the docs points at a file you can open.

**Read the docs:** <https://baseline.friedbotstudio.com/>

## Why this exists

Claude Code on a real codebase, used unattended, will eventually do things you do not want — push to main without review, amend a published commit, mock the database in a test, mark a phase complete that never ran, sign off on its own spec. None of these are bugs in Claude Code. They are the absence of an opinion the team already has but has never written down in a way the agent must obey.

The baseline is that written-down opinion. It chooses one default for every decision the team would otherwise repeat verbatim every session, and it enforces the default at the layer Claude cannot reach.

A team that installs the baseline stops typing _"don't push, don't `--amend`, don't self-approve specs"_ and starts trusting that the agent simply cannot.

## What gets installed

| What                                                                                                                                                                                                                                                                                                                                                       |                Count | Where it lives                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------: | ---------------------------------------------------- |
| **Hooks** at PreToolUse / PostToolUse / SessionStart / Stop / PreCompact / UserPromptSubmit                                                                                                                                                                                                                                                                |                   23 | `.claude/hooks/`                                     |
| **Skills** across artifact drafting, workflow phases, phase workers, spec helpers, orchestration, memory, navigation, phase helpers, generators, audit, alternate tracks, shared globals, and maintenance                                                                                                                                                  |                   41 | `.claude/skills/`                                    |
| **Subagent** — `swarm-worker`, executes pre-decided recipes inside isolated git worktrees                                                                                                                                                                                                                                                                  |                    1 | `.claude/agents/`                                    |
| **Workflow tracks** declared in `.claude/workflows.jsonl`. Canonical set: `intake-full` (11 nodes), `spec-entry`, `tdd-quickfix`, `chore`, `freeform` (ad-hoc batch of edits with relaxed phase ordering; all hooks remain active), `epic` (discovery once, sliced spec), `epic-child` (inherits epic discovery). Two sub-tracks (`swarm-implementation`, `tdd-worker-chain`) are referenced by selector nodes inside the canonical set. | 7 selectable + 2 sub | `.claude/workflows.jsonl`, enforced by `track_guard` |
| **Consent gates** — `/approve-spec`, `/approve-swarm`, `/grant-commit`. User-typed; structurally un-invokable by Claude                                                                                                                                                                                                                                    |                    3 | `consent_gate_grant` UserPromptSubmit hook           |
| **MCP servers** declared in `.mcp.json` — `context7` (third-party API docs), `plantuml` (diagram render), `playwright` (cross-engine smoke)                                                                                                                                                                                                                |                    3 | `.mcp.json`                                          |

Every count is asserted by `audit-baseline` against `docs/init/seed.md` on every build. Drift fails CI.

## Installation

### Requirements

- Node 18.17 or newer (the CLI runs as a Node script)
- `git` — required for the commit phase, swarm worktrees, and the post-archive consent gate. Workflows on non-git projects auto-except `commit` and end at `/archive`.
- `java` (JDK 8+) — needed by both the `plantuml_syntax_guard` hook (write-boundary syntax check) and `/spec-render` (PlantUML to SVG). Install fetches the SHA-pinned `plantuml.jar` (~19 MB); you supply the JVM. Skip with `--no-plantuml` to bypass entirely, or pass `--require-plantuml` to make a missing Java a fatal install error.

### One-line install

```bash
# Install the baseline into ./your-project
npx @friedbotstudio/create-baseline ./your-project
```

### Modes

```bash
# Default — install into a fresh or empty target
npx @friedbotstudio/create-baseline ./your-project

# Force-overwrite an existing install (interactive — type 'overwrite')
npx @friedbotstudio/create-baseline ./your-project --force

# Upgrade an existing install against a newer baseline version.
# In a TTY, each tier-1 customised file prompts: keep-mine / take-theirs / merge / abort
# prompt; tier-2 files auto-merge via `git merge-file --diff3`; tier-3 files
# stage for the /upgrade-project Claude Code skill to reconcile. In CI / piped
# stdout, every per-file action is reported with a user-facing label:
#   - adds new baseline files
#   - refreshes baseline files the user has not touched
#   - keeps customised files (exit 3 if any preserved)
#   - removes baseline files removed upstream that the user had not touched
#   - exit 4 if a mechanical merge produced conflict markers
#   - exit 5 if any tier-3 file was staged for /upgrade-project
npx @friedbotstudio/create-baseline upgrade ./your-project

# Preview without writing anything
npx @friedbotstudio/create-baseline ./your-project --dry-run

# Skip the install-time PlantUML jar download
npx @friedbotstudio/create-baseline ./your-project --no-plantuml

# Materialize a security-hardened target/.npmrc (opt-in)
npx @friedbotstudio/create-baseline ./your-project --with-npmrc
```

By default the scaffolder writes only inside `.claude/`, plus `CLAUDE.md`, `.mcp.json`, and `docs/init/seed.md`. Pass `--with-npmrc` to also drop `ignore-scripts=true` + `min-release-age=7` into `target/.npmrc`. Those defaults blunt the npm post-install-hook attack class and delay consumption of fresh malicious publishes. An existing `target/.npmrc` is preserved verbatim. Operators who already set these defaults in `~/.npmrc` don't need the flag.

### Doctor

```bash
# Report drift between a previously-installed target and its install snapshot.
# Counts matched / customised / missing / added files.
# Exit 0 clean, 1 if any baseline file is missing, 2 if no manifest.
npx @friedbotstudio/create-baseline doctor ./your-project

# Strict mode — print TAMPERED: shipped vs observed sha256 for every
# customised file and exit 1 on any drift.
npx @friedbotstudio/create-baseline doctor ./your-project --strict

# JSON mode — emit the structured report on stdout for CI parsers.
# Same exit codes; honours --strict.
npx @friedbotstudio/create-baseline doctor ./your-project --json
```

## Quickstart

After `npx @friedbotstudio/create-baseline ./your-project`:

```bash
cd ./your-project

# 1. Configure the project — runs the recommender, asks the questions,
#    flips .claude/project.json from configured: false to true.
#    The setup_guard hook surfaces a one-shot reminder until this runs.
/init-project

# 2. Triage an incoming request — picks the entry phase (intake, spec,
#    tdd, or chore) and writes .claude/state/workflow.json with any
#    exceptions the request needs.
/triage "your request in plain English"

# 3. Run the pipeline. /harness chains every non-gated phase in one
#    invocation; it yields at consent gates so you can review.
/harness
```

The three workflow-phase consent gates pause the workflow until you type the corresponding command:

- **`/approve-spec <slug>`** — after the spec phase, before any code is written
- **`/approve-swarm <slug>`** — after `/swarm-plan`, before parallel dispatch
- **`/grant-commit`** — after `/archive` and `/memory-flush`, before the commit lands

A fourth consent gate sits outside the phase pipeline:

- **`/grant-push`** — opens a 5-minute window for `git push` on a protected branch (per `project.json → git.protected_branches`). Pushes on non-protected branches need no consent.

Each gate writes a short-lived consent marker via a UserPromptSubmit hook that runs _before_ Claude is invoked on the body. Claude cannot forge the marker; the write-boundary guard validates it on disk before allowing the approval token through.

## How the enforcement works

The 23 hooks declared in `.claude/settings.json` fire at every Claude tool boundary — PreToolUse for Bash / Write / Edit / MultiEdit, PostToolUse for the same, plus SessionStart, Stop, PreCompact, and UserPromptSubmit. Each hook is a Node ESM script (`.mjs`) invoked as a subprocess outside Claude's reach. Their output is JSON; their exit decides whether the tool call proceeds.

The architectural rule is simple: **decisions live in main context; subagents only execute pre-decided recipes**. The baseline ships exactly one subagent — `swarm-worker` — and its only sanctioned use is parallel dispatch of fully-specified recipes inside isolated git worktrees during `/swarm-dispatch`. Every other capability that might have been a subagent (code authoring, scenario design, scouting, security review, prose writing, UI design) lives instead as a **skill** that runs in main context with full conversation visibility.

Tracks declared in `.claude/workflows.jsonl` are enforced at the write boundary by `track_guard`. Node ordering inside each track is binding; the only mechanism to bypass a node is the `exceptions` array in `.claude/state/workflow.json`, written by `/triage` at workflow creation time. The `chore` track is a stripped-down ordering of the same gates, with the test-first nodes removed because nothing needs testing first. Projects declare their own tracks (or add nodes to the canonical ones) by editing their `.claude/workflows.jsonl`. Article IV's invariants (I1..I11) bind every track regardless of who wrote it; a track that omits `/grant-commit` before a `commit` node, or whose dependency graph contains a cycle, is rejected at triage time with a named error.

The constitution at `CLAUDE.md` is the source of truth for in-session behaviour; `docs/init/seed.md` is the source of truth for the baseline's shape. When the constitution and the implementation conflict, the constitution governs and the implementation gets corrected. When `seed.md` and the constitution conflict, `seed.md` governs and you stop and surface the drift before acting.

## Documentation

- **Docs site:** <https://baseline.friedbotstudio.com/> — overview, hook reference, skill index, workflow walkthrough, install reference
- **Constitution:** [`CLAUDE.md`](CLAUDE.md) — the in-session contract that binds Claude in this repository
- **Genesis:** [`docs/init/seed.md`](docs/init/seed.md) — the governing specification of the baseline
- **Product brief:** [`PRODUCT.md`](PRODUCT.md) — audience, voice, anti-references
- **Design system:** [`DESIGN.md`](DESIGN.md) — type, colour, spacing, motion vocabulary for the docs site

## Contributing

The baseline aims for a small, traceable surface. Contributions that make the structural enforcement _more_ reliable — closing a hook gap, tightening a guard, fixing a regex, adding a missing test — land easily. Contributions that grow the surface need a stronger justification.

Specifically: the **hook count, skill count, subagent count, command count, and MCP-server count are constitutional**. Any change to those counts requires:

1. An amendment to `docs/init/seed.md` §4 first (the genesis prompt)
2. A matching update in `CLAUDE.md` (the constitution)
3. The implementation change
4. A passing `node .claude/skills/audit-baseline/audit.mjs` (which checks all four for drift)

The `/triage` skill picks the right track for your contribution. Most one-file fixes are chore-track; anything adding new behaviour goes through intake → spec.

Please read [`CODE-OF-CONDUCT.md`](CODE-OF-CONDUCT.md) before opening an issue or PR.

## Support and feedback

- **Issues:** <https://github.com/friedbotstudio/baseline/issues>
- **Docs:** <https://baseline.friedbotstudio.com/>

## Vulnerability reporting

Security disclosures go to **hello@friedbotstudio.com**. See [`SECURITY.md`](SECURITY.md) for the full policy and scope.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).

## About

The Claude Code Baseline is built and maintained by [Friedbot Studio](https://friedbotstudio.com). We build infrastructure for AI-augmented engineering teams — discipline layers, evaluation harnesses, audit trails — that make agentic tools usable on production systems.
