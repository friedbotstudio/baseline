# Claude Code Baseline — Genesis Prompt and Governing Specification

**This file is the genesis prompt of the harness.** It is the source of truth for the baseline's shape, components, and rebuild protocol. The in-session constitution (`CLAUDE.md`) derives its authority from this document; the implementation (hooks, skills, commands, subagents, MCP servers, config files) derives its authority from both.

**Order of precedence**: `seed.md` > `CLAUDE.md` > implementation.

- When this file and the implementation drift, the implementation is wrong — fix the implementation.
- When this file and `CLAUDE.md` drift, `CLAUDE.md` is wrong — sync it from this file.
- Amendments propagate top-down: change here first, then propagate to `CLAUDE.md`, then to disk in the same commit.
- `CLAUDE.md` cross-references the § of this document that grounds each in-session rule. Audits (`audit-baseline`) detect drift between this file, `CLAUDE.md`, and the on-disk implementation.

**Mandatory binding language.** Each numbered section (§) below specifies a binding requirement for the baseline. Implementations SHALL conform; `CLAUDE.md` Articles SHALL reference the corresponding §; project amendments (per `CLAUDE.md` Art. X) SHALL NOT contradict any § here.

The baseline turns soft engineering rules (no unauthorized commits, no stubs, no mocks of internal code, no self-approved specs) into structural guarantees enforced by write-boundary hooks. Eleven workflow phases plus one stripped-down chore track (skips TDD; runs verify + archive mandatorily, simplify/integrate/document conditionally), eighteen write/run-boundary guards plus four lifecycle hooks plus one input-boundary hook (twenty-three hook scripts total — all `.mjs` after the JS port completed; per-hook startup ~5× faster than the original bash + python3 chain), forty-one skills, one subagent, and four consent gates. Decisions live in main context; the lone subagent (`swarm-worker`) executes pre-decided recipes in parallel worktrees during `/swarm-dispatch`. Every artifact is archived; every third-party API is looked up against live docs. Project memory accumulates across sessions in `.claude/memory/` — auto-extracted by a Stop hook, curated in main context via `/memory-flush`, self-healing via re-verification.

---

## §0 — Mandatory first step: `/claude-automation-recommender`

> **BEFORE BUILDING ANYTHING**, invoke the `claude-automation-recommender` skill on the target project. The baseline is general; the recommender localizes it.

The recommender ships with this baseline. It lives at `.claude/skills/claude-automation-recommender/` (vendored from the upstream `claude-code-setup` plugin published by Anthropic, redistributed under Apache 2.0 — see that directory's `LICENSE` and `NOTICE`). No external plugin install is required; the capability travels with the repository.

The recommender reads the project manifest (package.json / pyproject.toml / go.mod / Cargo.toml / etc.) and reports:

- Stack detection — which test framework, linter, formatter, and type checker the project uses.
- Library inventory — which third-party libraries the spec template must cover in its "Libraries and versions" table.
- Suggested hook customizations — destructive-command patterns specific to the stack, lint/test commands to wire into `project.json`.
- Gap analysis — any baseline component that needs adaptation for this stack.

**Feed the recommender's output into `.claude/project.json` during `/init-project`. Do not skip this step.** The baseline defaults cover the 80% case; the recommender surfaces the 20% where the defaults mislead.

---

## §1 — Baseline truth

Assumptions the baseline is allowed to make:

- **Unix/Linux or macOS.** Windows is not a target.
- **`node` ≥ 18.17 on PATH.** Every hook AND every skill helper runs as a Node ESM script (`.mjs`); no `bash` or `jq` at hook runtime. `npx` is also required for the three MCP servers (`context7`, `plantuml`, `playwright`).
- **`plantuml` CLI on PATH** (optional). `/spec-render` refuses without it. The PlantUML syntax guard is **advisory by default** (no JVM); it invokes the CLI — and runs in guide mode when the CLI/jar is absent — only when `project.json → plantuml.strict_syntax_check` is enabled.
- **Git repository.** Required for swarm worktree isolation mode; the baseline falls back to `shared` mode on non-git projects.
- **Claude Code installed and authenticated.**

---

## §2 — Non-negotiable engineering rules

### §2.1 No stubs — ever

- A declared function must be fully implemented with production logic.
- If the implementation is unknown, do not declare the function. Write the spec first.

### §2.2 Always production code

- Every line handles errors, validates inputs, logs appropriately, and cleans up resources.
- No `TODO` / `FIXME` / `HACK` / `XXX` comments in source. If you know what needs doing, do it now or do not write the code.
- No commented-out code. If it is removed, it is deleted.

### §2.3 No mocks of internal code

- Never mock internal project modules. If an internal dependency is hard to test, the design is wrong — fix the design.
- Never mock the database. Use a real test database.
- Never mock gRPC channels or stubs.
- Acceptable mock targets, in full:
  - Third-party HTTP APIs that cannot run locally (paid SaaS endpoints).
  - System clock (`datetime.now`, `time.time`) when testing time-sensitive logic.
  - OS randomness (`random`, `secrets`) when testing deterministic outputs.
- Every mock carries a justification comment: `# MOCK: <reason real implementation cannot be used>`.

### §2.4 YAGNI

- Reuse libraries for what already exists. Do not re-implement what a dependency provides.
- No parameters, flags, or configuration options "for future use."
- Do not build abstractions for hypothetical future requirements. Abstract only on the third concrete use case.
- If no test exercises a line of code, that line should not exist.

### §2.5 Context7 rule

When writing or reviewing code that uses any third-party library, always invoke the `context7` MCP to retrieve current API documentation. Never assume an API from training recall.

Prefix: `use context7 to find the current API for [library] [version]`.

The rule applies at every gate: scout, research, spec (the "Libraries and versions" table requires a "confirmed via context7" column), TDD, simplify, security, integrate.

### §2.6 Code structure (language-agnostic)

Every code-generation step must invoke the `code-structure` skill. It enforces:

- **Three-layer model.** Orchestration (entry points, CLI/routes/pages) composes Domain (business logic) composes Foundation (primitives, adapters, utilities). Layers do not skip.
- **One abstraction level per call site.** Siblings in a JSX tree / statements in a function / items in a pipeline sit at the same level. A named call next to a raw primitive is a defect.
- **Step-over / step-into.** Reading a file works like a debugger: each step reveals exactly one level deeper.
- **Reuse before create.** Scan the registry; extend an existing module before making a new one.

Applies to every language. Mappings for TSX, Node, Python, Go, Rust ship inside the skill.

---

## §3 — Directory structure

```
<repo-root>/
├── .mcp.json                   # project-level MCP servers (context7, plantuml)
├── CLAUDE.md                   # in-session constitution; loaded every session
├── .claude/
│   ├── settings.json           # hook wiring + permissions
│   ├── project.json            # per-project config (test/lint cmd, TDD, artifacts, swarm)
│   ├── hooks/                  # 23 hook scripts: 18 write/run-boundary guards + 4 lifecycle hooks + 1 input-boundary hook (Node ESM, no jq)
│   │   └── lib/common.mjs      # shared helpers (Node ESM)
│   ├── agents/                 # 1 subagent: swarm-worker (rendered from src/agents/swarm-worker.template.md)
│   ├── commands/               # 5 consent/bootstrap gates (user-only — structurally)
│   ├── skills/                 # 41 skills: artifact (4) + phases (10) + workers (5) + spec helpers (4) + orchestration (3) + memory (1) + navigation (1) + phase helpers (1) + generators (2) + shared globals (7) + audit (1) + alt tracks (1) + maintenance (1)
│   ├── memory/                 # project memory: 7 canonical files + _pending.md + _resume.md + _thread.md (all gitignored body) + README.md
│   └── state/                  # runtime: workflow.json, approvals, swarm plans, verdicts, logs
├── src/                        # pristine ship-time templates (overlay source for `npx @friedbotstudio/create-baseline`)
│   ├── CLAUDE.template.md
│   ├── seed.template.md
│   ├── project.template.json
│   ├── .mcp.template.json
│   ├── settings.template.json
│   ├── agents/swarm-worker.template.md
│   └── memory/<7 canonical>.template.md
└── docs/
    ├── init/seed.md            # this file
    ├── intake/  brd/  scout/  research/  specs/  rca/  security/  site/
    │                           # produced artifacts (NOT templates — those live in skills)
    ├── specs/_rendered/<slug>/ # build output from /spec-render
    └── archive/<YYYY-MM-DD>/<slug>/
                                # finalized workflow bundles; never overwritten
```

**Lazy creation.** `docs/{scout,research,security,archive}/` are created on first invocation of their owning phase skill (`/scout`, `/research`, `/security`, `/archive`). The directory tree above lists them for orientation; a freshly rebuilt baseline only contains the directories that have been used at least once.

---

## §4 — Components

### §4.1 Hooks (23 total — 18 write/run-boundary guards + 4 lifecycle hooks + 1 input-boundary hook)

Each is an independent Node ESM script that reads a JSON payload on stdin and emits a structured decision. Ordering within a `matcher` block matters only when one hook's decision should take precedence. The four lifecycle hooks (`memory_session_start`, `memory_stop`, `memory_pre_compact`, `harness_continuation`) are best-effort and never block; they maintain project memory, the cross-session resume snapshot, and the harness disjunctive-gate Stop signal (`harness_continuation` reads `.claude/state/harness_state` on every Stop event and emits a `decision:block` directive when either of two paths passes: Path A — the harness's internal loop exited mid-flow, `state: "continue"` AND the session-scoped marker `.claude/state/.harness_active` still exists AND `stop_hook_active` is absent — so the harness can pick up where it left off; OR Path B (rung 4) — the harness yielded cleanly at a consent gate, `state: "yielded"` AND `workflow.json` is present AND a consent/approval token's mtime is newer than `harness_state`, so the user's just-typed consent slash command auto-resumes the workflow without a second `/harness` prompt. The hook is mostly a defense-in-depth signal; the harness skill loops internally during normal non-gated operation, and Path A is the rare-interruption path. Path B is the consent-resume normal case. `memory_session_start` deletes the marker at every session boundary so yesterday's `continue` never ghost-resumes today).

The single input-boundary hook (`consent_gate_grant`, on `UserPromptSubmit`) runs **before** Claude is invoked on every user turn. When the user types one of the four consent-gate slash commands (`/approve-spec <slug|path>`, `/approve-swarm <slug>`, `/grant-commit [note]`, `/grant-push [note]`), this hook parses the prompt and writes a short-lived consent marker to `.claude/state/.<gate>_grant`. The PreToolUse approval guards (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) read these markers as the structural source of consent: a Claude write to an approval token is allowed only when a fresh, slug-matched marker is on disk; the marker is single-use (deleted on the allowed write) and expires after `consent.gate_marker_ttl_seconds` (default 120). Slug derivation is centralized in `lib/common.mjs → canonicalSlug` (strip directory prefix + trailing `.md`) so the marker and the expected slug always agree — `docs/specs/foo.md`, `foo.md`, and `foo` all reduce to the bare slug `foo`. This is what makes Article IV's gates structurally un-invokable by Claude — Claude cannot reach the UserPromptSubmit code path, and the PreToolUse guards block Claude from writing the markers themselves.

| Hook | Event / matcher | Enforces |
|---|---|---|
| `setup_guard` | PreToolUse / Write\|Edit\|MultiEdit\|NotebookEdit | Advisory. When `configured: false`, emits a one-shot reminder (rate-limited to 10 minutes) that the baseline is in project-agnostic mode and `/init-project` hasn't run. Does not block writes — bypass is intentional. The user gets baseline-only behaviour (test/lint runners in guide mode, no stack-specific tailoring) until `/init-project` runs. |
| `destructive_cmd_guard` | PreToolUse / Bash | Hard-blocks catastrophic commands (`rm -rf /`, fork bombs, `dd of=/dev/sd*`, `mkfs`, `shutdown`). Asks on risky ones (`rm -rf <path>`, `git reset --hard`, `drop table`). Patterns sourced from `project.json → destructive`. Implemented in `.claude/hooks/destructive_cmd_guard.mjs` (Node ESM; ported from `.sh` for ~10× per-call speedup). |
| `git_commit_guard` | PreToolUse / Bash + Write\|Edit\|MultiEdit | Bash matcher: enforces branch-aware policy. `git commit` on a protected branch (per `project.json → git.protected_branches` glob list; `null` = all branches protected) requires fresh `commit_consent` (`/grant-commit`, 5-min TTL); `git push` on a protected branch requires fresh `push_consent` (`/grant-push`, 5-min TTL); both proceed without consent on non-protected branches. `git.branch_pattern` regex (optional) gates commits on naming. Detached HEAD denies both. Also enforces **branch topology** (`git.workflow_model` + `git.release_branches`): on the primary working tree, `direct-to-main` blocks commits off the release line and `github-flow` blocks commits on it; `ask` (default) passes; the swarm-worktree carve-out exempts linked worktrees; topology composes with — does not mask — consent (Art. VII). Hard-blocks remaining forbidden flags: `git commit --amend`, `--no-verify`, `--no-gpg-sign`, `git reset --hard`, `git clean -f`, `git checkout --`, `git branch -D`, `git config`, `git rebase -i`, `git add -A`, `git add .`. **Atomic closure obligation:** a `git commit` that stages a *closing* `workflow.json` (non-empty `source_backlog_keys`) is hard-blocked unless the same commit also stages `.claude/memory/backlog.md` with each named key stamped `status: picked-up` + `superseded-at` — derived from the staged index only (`git show :<path>`), never the commit message (the message-dependent `Closes <key>` reconciliation lives in `/commit`'s `closure-precommit-check.mjs` preflight). Shared stamp logic: `.claude/hooks/lib/closure-check.mjs`. Makes a backlog entry's closure stamp reaching git history a structural guarantee, not an SOP step (RCA `docs/rca/2026-06-06-backlog-closure-stamp-stranded-post-commit.md`). Write matcher: blocks Claude from writing `.claude/state/.commit_consent_grant` / `.push_consent_grant` (markers — only `consent_gate_grant` writes those) and gates writes to `.claude/state/commit_consent` / `push_consent` on a fresh marker. Implemented in `.claude/hooks/git_commit_guard.mjs` (Node ESM; JS-port pilot). |
| `env_guard` | PreToolUse / Write\|Edit\|MultiEdit\|NotebookEdit | Blocks writes to `.env*`. Allows obvious templates (`.env.example`, `.env.sample`). |
| `spec_approval_guard` | PreToolUse / Write\|Edit\|MultiEdit | Validates a fresh `.claude/state/.spec_approval_grant` marker (slug-matched, ≤ `consent.gate_marker_ttl_seconds`) before allowing Claude to write under `.claude/state/spec_approvals/`. Blocks Claude from writing the marker file itself. Blocks `Status: Approved` / `Approved: true` lines in spec markdown. |
| `swarm_approval_guard` | PreToolUse / Write\|Edit\|MultiEdit | Symmetric to `spec_approval_guard` for gate B: validates `.claude/state/.swarm_approval_grant` before allowing writes under `.claude/state/swarm_approvals/`. Blocks Claude from writing the marker. |
| `epic_approval_guard` | PreToolUse / Write\|Edit\|MultiEdit | Gates the epic-state `approved: true` flip (§18.9). Allows a transition of `approved` to true in `.claude/state/epic/<slug>.json` only when the matching persistent token `.claude/state/spec_approvals/<slug>.approval` exists — the durable, forge-proof record of a real gate-A `/approve-spec`. Non-transition writes (`children[]` appends, status flips) and idempotent re-writes of an already-approved epic pass through. Existence + slug match only (no TTL — an approved spec stays approved). Unlike the marker-based gates it derives consent from the persistent token rather than a fresh marker; the token's own unforgeability rests on `spec_approval_guard`, so no new command or consent step is introduced. |
| `verify_pass_guard` | PreToolUse / Write\|Edit\|MultiEdit | Blocks a `PASS` line in a verify artifact when `.claude/state/last_test_result` reports `FAIL`. |
| `track_guard` | PreToolUse / Write\|Edit\|MultiEdit | Enforces 11-phase ordering. Phase `N+1` requires phase `N` in `completed` (or in `exceptions`). `/triage` writes `exceptions`. |
| `artifact_template_guard` | PreToolUse / Write\|Edit\|MultiEdit | Writes to `docs/{intake,brd,specs,rca}/*.md` must contain required `##`/`###` headings sourced from `project.json → artifacts.required_sections`. Templates in skill directories are exempt. |
| `plantuml_syntax_guard` | PreToolUse / Write\|Edit\|MultiEdit | Extracts every ````plantuml ...```` fence in `docs/specs/*.md`. **Default advisory (no JVM):** allows the write and notes that syntax is unvalidated at the boundary. When `project.json → plantuml.strict_syntax_check` is `true`, pipes each fence to `plantuml -checkonly -pipe` and blocks on any parse error (guide-mode when the CLI/jar/java is absent). Authoritative validation runs on-demand in `/spec-lint`, before `/approve-spec`. |
| `spec_diagram_presence_guard` | PreToolUse / Write\|Edit\|MultiEdit | Writes to `docs/specs/*.md` must contain the six required diagram kinds inside PlantUML fences (C4 Context, C4 Container, C4 Component, sequence, class, dependency-graph). Config: `project.json → artifacts.required_diagrams.spec`. |
| `spec_design_calls_guard` | PreToolUse / Write\|Edit\|MultiEdit | When a spec's `write_set` intersects `project.json → tdd.ui_globs`, blocks the write unless a populated `## Design calls` section is present. Structural enforcement of CLAUDE.md Article X.2 (design-task routing through `design-ui`). |
| `swarm_boundary_guard` | PreToolUse / Write\|Edit\|MultiEdit | When `.claude/state/swarm/active_wave.json` exists (shared isolation mode), blocks writes in enforced roots whose path is not in the union of active task `write_set`s. Dormant in worktree mode. |
| `tdd_order_guard` | PreToolUse / Write | Requires an existing test file matching the project's test-glob conventions before a new source file may be created. |
| `process_lifecycle_guard` | PreToolUse / Bash | Advisory-only. Detects process-management patterns (`kill`, `pkill`, `lsof`, `fuser`, `npm run.*(serve|dev)`, `eleventy --serve`, `vite`, `next dev`, `astro dev`, `python.*http.server`) and surfaces relevant memory entries inline (`landmines.md → lsof-port-kill-takes-firefox-with-it`, `conventions.md → dev-server-ownership`). Emits `info` decisions only — never blocks. Closes the gap where ad-hoc main-context Bash had no skill-driven memory pull. |
| `lint_runner` | PostToolUse / Write\|Edit\|MultiEdit | Runs `project.json → lint.cmd {file}` after code changes. Guide-mode until configured. |
| `test_runner` | PostToolUse / Write\|Edit\|MultiEdit | Runs `project.json → test.cmd {file}` (or `affected_resolver`) after code changes. Guide-mode until configured. |
| `memory_session_start` | SessionStart | Scans `.claude/memory/*.md`, prints a compact index (per-file entry counts, stale counts, pending-flush nag) into Claude's startup context, and appends `_resume.md` (the cross-session continuity snapshot) with a source-aware framing line (`compact` / `clear` / `resume` / `startup`). Total `additionalContext` capped at ~9.5KB. |
| `memory_stop` | Stop | At end of every assistant turn, reads the transcript, extracts memory candidates (touched source paths → landmarks; context7 queries → libraries; user/assistant text-block intent lines → backlog), appends to `.claude/memory/_pending.md`, and refreshes `.claude/memory/_resume.md` for next session. Passive collector — never writes to canonical memory files. |
| `memory_pre_compact` | PreCompact (manual\|auto) | Fires before context compaction. Walks the still-intact transcript and writes `.claude/memory/_resume.md` so the next `SessionStart` (source: `compact`) can re-inject the snapshot. Best-effort; never blocks compaction. |
| `harness_continuation` | Stop | Two-purpose Stop-event gate: (a) safety net for harness loops interrupted mid-flow; (b) auto-resume trigger after a consent slash command. Reads `.claude/state/harness_state` (written by the harness skill when armed and after each loop iteration), `.claude/state/.harness_active` (session-scoped marker; created by the harness skill on `state: "continue"`, deleted on `yielded`/`done`, cleaned unconditionally by `memory_session_start.mjs` on session boundary), `.claude/state/workflow.json`, and the four canonical consent/approval tokens. Disjunctive gate — Path A OR Path B passes to emit a decision, both gated by rung 1: rung 1 `stop_hook_active` flag absent on payload; **Path A** (mid-loop continuation, rungs 2+3) rung 2 `.harness_active` marker exists AND rung 3 `harness_state.state` equals `"continue"`; **Path B** (gate-resume, rung 4) `harness_state.state` equals `"yielded"` AND `workflow.json` exists/parses AND at least one of `commit_consent`, `push_consent`, `spec_approvals/<slug>.approval`, `swarm_approvals/<slug>.approval` exists with mtime newer than `harness_state`. When either path passes, emits `{"decision":"block","reason":"…invoke Skill(harness)…"}` so the model resumes the harness on the same turn. Path A fires when the loop was interrupted mid-flow (context pressure, runtime kill, etc.) leaving `state: continue` + marker present. Path B fires when the harness yielded cleanly at a gate and the user has just satisfied it; no second `/harness` prompt is required. Bounded to one block per turn by `stop_hook_active`, so the hook cannot drive multi-phase chaining itself. Sanity rail: if the marker's slug content disagrees with `workflow.json → slug`, log one `WARN` line to `harness_continuation.log`; mismatch does not change the decision. Silent on any path fail (`done`/missing dependencies/malformed). Treats every internal error as silence. Never writes consent markers; never bypasses Article IV gates. |
| `consent_gate_grant` | UserPromptSubmit | Runs **before** Claude is invoked on every user turn. Detects the four consent-gate slash commands (`/approve-spec <slug\|path>`, `/approve-swarm <slug>`, `/grant-commit [note]`, `/grant-push [note]`) at the start of the user's prompt and writes a short-lived consent marker (`.claude/state/.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`, or `.push_consent_grant`). Slugs are canonicalized through `canonicalSlug` (strip directory + trailing `.md`) so the marker matches whatever shape the approval guards derive from the approval filename. The marker is single-use and expires after `consent.gate_marker_ttl_seconds` (default 120). Because this hook fires outside Claude's tool boundary, Claude cannot reach this code path — the marker is structurally unforgeable by the model. Implemented in `.claude/hooks/consent_gate_grant.mjs` (Node ESM; JS-port pilot). |

All hooks import from `.claude/hooks/lib/common.mjs` for payload parsing, project-config reads, and decision emitters (`emitAllow`, `emitBlock`, `emitAsk`, `emitInfo`). Four additional .mjs helpers in `.claude/hooks/lib/`: three (`memory_stop.mjs`, `memory_session_start.mjs`, `resume_writer.mjs`) hold the transcript-walk, memory-index, and continuity-snapshot logic the lifecycle hooks import, plus `closure-check.mjs` (pure backlog-closure stamp logic) imported by `git_commit_guard`. No python3 is required at hook runtime — the perf pass replaced the legacy bash + python3 chain with pure Node ESM for ~5× startup speedup.

**Durable local thread trail (Article IX).** A third *local* memory class, `.claude/memory/_thread.md`, gives cross-session continuity that survives `/memory-flush` and `/clear`. Its content is gitignored (only `src/memory/_thread.template.md` ships the pristine structure) and it is explicitly excluded from the `/memory-flush` reset path. Claude Code — never the human — maintains it: the folded `memory_stop` detector stages a switch-candidate on a topic pivot (passive — no stdout decision, so `harness_continuation` keeps the sole Stop-event block), the shelve mechanically captures verbatim cues over the cursor span since the last shelve into one append-only rolling trail, and the resume transform turns that verbatim into a surfaced summary (TTL-cached via `project.json → memory.thread_transform_ttl_seconds`, default 86400). Four `.mjs` helpers back it — `thread_store.mjs`, `shelve_detect.mjs`, `shelve_capture.mjs`, `resume_transform.mjs` — and it is model-internal: not a skill, not a command, never user-invoked (so the skill/command counts are unchanged). The shelve/resume split — extract verbatim cheaply now, transform at resume — keeps granularity control in the developer's hands.

### §4.2 Subagents (1)

The baseline ships exactly one subagent. The architectural reason: subagents lose conversational context (the screenshot the user pasted, the offhand "I hate that purple," the prior round of feedback) and produce visibly worse output on tasks that depend on judgment. Every capability that *might* have been a subagent (code authoring, scenario authoring, scouting, security review, prose, UI design, etc.) lives instead as a **skill** that runs in main context with full conversation visibility. The single remaining subagent earns its keep on one specific axis: **physical filesystem isolation for parallel work**, which skills cannot provide.

| Subagent | Scope | Tools | Preloaded skills · Memory |
|---|---|---|---|
| `swarm-worker` | Execute a single swarm task inside an isolated git worktree. Runs `Skill(scenario)` then `Skill(implement)` against a fully-specified recipe handed to it by `/swarm-dispatch`. Reports JSON status as its final line. Makes no design decisions. | Read, Write, Edit, MultiEdit, Bash, Skill, Grep, Glob | `scenario`, `implement` (plus stack-specific skills appended by `/init-project`) · — (workers do not accumulate cross-session memory; that lives in skills running in main context) |

**Template-rendered.** The worker's canonical body lives at `src/agents/swarm-worker.template.md`. The file at `.claude/agents/swarm-worker.md` is its rendered output. The template carries four tokens — `{{NAME}}`, `{{DESCRIPTION}}`, `{{SKILLS}}`, `{{ROLE_LINE}}` — so `/init-project` can re-render with stack-specific skills appended to the worker's `skills:` frontmatter (the base always preloads `scenario` and `implement`).

**Automated re-rendering by `/init-project`.** Step 6.4 re-renders `swarm-worker.md` from the template, driven by the recommender's `additions.swarm_worker_skills`. The recommender does **not** propose new subagent types — only stack-skill additions for the existing worker. Specialization happens via skills loaded into the worker's context, not via parallel agent personas; new decision-making roles belong in skills, which run in main context.

#### §II.A — Bounded maker/checker charter (v1)

Notwithstanding the general rule that the lone subagent only executes pre-decided recipes, ONE bounded maker/checker round-trip MAY execute on Claude Code's dynamic Workflow runtime. The maker and checker are **workflow-runtime agents, not declared subagents** — the baseline still ships exactly one subagent (`swarm-worker`). The round-trip is subject to **all** of:

1. **Pre-decided contract.** The maker implements a contract decided in main context, within an explicit `write_set`; it makes no design or scope decisions.
2. **Oracle-bound checker.** Findings rank by evidence: a finding backed by a **mechanical** artifact (failing test, guard block, structural violation) is **blocking**; a finding backed by **research/documentation** evidence is **advisory** (surfaced, labeled lower-confidence, never blocking on its own); a bare opinion is not a finding. The checker's grounding test or relation SHALL derive from intended behavior or the spec, **never from the maker's implementation** (no self-confirming oracle). A non-mechanical finding is advisory by construction, because the maker and checker may share a model family (self-preference bias).
3. **Hook governance is mandatory.** All workflow-agent writes remain under the live PreToolUse hooks; `tdd_order_guard`, `verify_pass_guard`, and `swarm_boundary_guard` were observed firing on workflow agents.
4. **Escalation bounces up.** Any scope or `write_set` escalation returns to the main-context orchestrator; workers never widen scope themselves.
5. **Fallback.** When the Workflow runtime is unavailable or disabled, the round-trip falls back to the Mirror-lite turn-by-turn swarm.
6. **Bounded — exactly one maker, one checker.** No second maker/checker, no fan-out, waves, or panel. Lifting this cap requires a future permanent Article II rewrite, gated on clause 7.
7. **Graduation gate.** §II.A remains a bounded exception until **all** hold: (a) ≥ 3 governed maker→checker round-trips in which every blocking finding was mechanically grounded; (b) **zero** false-positive blocking findings across that window; (c) a clean `/security` review of the checker's oracle artifacts; (d) explicit maintainer ratification of a future permanent Article II rewrite. Until that rewrite lands, the caps in clause 6 bind.

Full charter narrative, the corroboration grounding, and the graduation rationale live in the annex `.claude/CONSTITUTION.md`. This charter is bounded by clause 6 and self-limiting via clause 7; it absorbs the prior `-9360` "full charter" role, and the multi-maker/checker scaling it would enable is the graduation target, not part of this charter.

### §4.3 Skills (41)

Each at `.claude/skills/<name>/SKILL.md`, frontmatter `name` + `description`, plus optional `template.md` (artifact skills) or helper scripts.

**Artifact drafting (4)** — each ships a `template.md` that is exempt from `artifact_template_guard`:

- `intake` — Phase 1. Problem · Goal · Acceptance criteria. Output: `docs/intake/<slug>.md`.
- `brd` — Cross-functional pre-spec. Business objective · Scope · Business requirements. Output: `docs/brd/<slug>.md`.
- `spec` — Phase 4. Diagram-driven (C4 + UML + dependency graph). Required sections: Goal · Design · Acceptance criteria · Test plan. Required diagrams: six (§4.7). Output: `docs/specs/<slug>.md`.
- `rca` — Out-of-band incident postmortem. Summary · Timeline · Impact · Root cause · Action items. Output: `docs/rca/<slug>.md`.

**Workflow phases (10)** — each is auto-invocable; the harness chains them via the Skill tool. All execute in main context — no subagent indirection:

- `triage` — picks entry phase (intake / spec / tdd) + exceptions. Writes `workflow.json`.
- `scout` — Phase 2. Maps the relevant slice of code for the task. Output: `docs/scout/<slug>.md`.
- `research` — Phase 3. Surfaces 2–4 candidate solution approaches with tradeoffs, grounded in current library docs via context7. Output: `docs/research/<slug>.md`.
- `tdd` — Phase 6. Main context decides the scenario recipe and the implementation contract; invokes `scenario` → `implement` → `verify`.
- `simplify` — Phase 7. Cleanup diff (dead code, duplication, TODOs, commented-out) + `code-structure` review pass + re-verify via `verify`.
- `security` — Phase 8 (optional, honors triage exceptions). OWASP-aligned review of the branch diff. Output: `docs/security/<slug>-<date>.md`.
- `integrate` — Phase 9. Full suite + `verify` re-adjudication.
- `document` — Phase 10. Orchestrator. Delegates technical reference to `documentation`, tutorials to `technical-tutorials`, and **all prose** to the `prose` skill (which applies `humanizer` mandatorily).
- `archive` — Phase 10.5. Moves `<slug>`-matched artifacts to `docs/archive/<YYYY-MM-DD>/<slug>/`. `workflow.json` is held back and archived by `/commit`.
- `memory-flush` — Phase 10.6. Curates `_pending.md` candidates with full workflow context (or fast-paths on empty pending while still running canonical Step 0 sweeps). Canonical memory writes ship in the same commit as the work that motivated them.
- `commit` — Phase 11. First step archives `workflow.json`; then stages named paths and commits.

**Phase workers (5)** — execute pre-decided recipes; each mandatorily invokes a sub-skill. Caller (a phase skill) provides explicit inputs; the worker executes without picking architecture, register, or scope:

- `scenario` — writes failing tests from a recipe (mandatorily `code-structure`). Used by `/tdd` Step 2 and by `swarm-worker` Step 1.
- `implement` — writes production code that turns failing tests green inside an explicit `write_set` (mandatorily `code-structure`; `context7` MCP for any third-party API). Used by `/tdd` Step 3 and by `swarm-worker` Step 3.
- `verify` — runs the full test suite and stamps `.claude/state/last_test_result` with the binding PASS/FAIL verdict the `verify_pass_guard` hook trusts. Used by `/tdd`, `/integrate`, `/simplify`.
- `prose` — drafts/revises English prose (mandatorily `humanizer`; conditionally `copywriting`/`documentation`/`technical-tutorials` by register). Used by `/document` and any phase that emits human-facing prose.
- `design-ui` — pure orchestrator of `impeccable` for UI design tasks. Captures intent in natural language, classifies it (design / development / copy via `references/design-vs-development.md` — misroutes return `not_a_design_task`), translates design intents to a sequence of `impeccable` subcommand invocations (per `references/intent-table.md` — multi-step recipes ask for approval, single-step recipes auto-execute), orchestrates them in main context with state persistence at `.claude/state/design/<slug>.json`, and returns a structured report. Iteration cap: `audit → polish` loops terminate at 3 with `needs_human` if P0/P1 don't clear. ALWAYS invokes `impeccable` under the hood for the underlying design move — never writes product code directly. Per CLAUDE.md Article X.2, all design tasks inside a workflow phase route through `design-ui`.

**Spec helpers (4)**:

- `spec-lint` — preflights syntax + required-diagram presence + AC-to-sequence traceability on a draft (advisory; the hooks enforce at write time).
- `spec-render` — user-only (`disable-model-invocation: true`). Extracts every PlantUML fence from a saved spec and renders to SVG under `docs/specs/_rendered/<slug>/`.
- `spec-diagram-review` — cross-consistency audit across C4/class/sequence/dependency diagrams in a drafted spec. Read-only.
- `spec-traceability-review` — every spec AC traces to a real upstream intake/BRD AC; no upstream AC silently dropped. Read-only.

**Orchestration (3)**:

- `harness` — user + model invokable. A single `Skill(harness)` invocation loops internally through every non-gated phase boundary in one user turn, exiting cleanly on consent gate, phase-skill failure, integrate-failure-needs-spec-change, or workflow done. The `harness_continuation` Stop hook (§4.1) is a safety net that re-fires harness only when the loop exited mid-flow. Logs every transition to `.claude/state/harness/<slug>.log`.
- `swarm-plan` — decomposes an approved spec into per-component tasks with explicit `write_set` and `depends_on`. `validate.sh` verifies acyclicity and assigns waves with pairwise-disjoint `write_set`s. Output: `.claude/state/swarm/<slug>.json`.
- `swarm-dispatch` — runs the plan wave by wave. Main context decides each task's scenario recipe + implementation contract before dispatch; each wave spawns `swarm-worker` agents in parallel inside isolated worktrees; `swarm_merge.sh` audits the returned diff ⊆ task `write_set` and applies to main with `git apply`. Any audit fail preserves the worktree.

**Navigation (1)** — the default mechanism for code-navigation questions in **any language** (frontend or backend). Auto-invocable on description match; the baseline prefers it over the `Explore` agent and global grep when a question is structural ("where does X come from", "what API populates Y", "what wraps Z", "which file renders feature F", "what page uses /api/foo"):

- `code-browser` — the language-agnostic **universal walk** (entry point → imports → IO boundary) is the primary path and works regardless of language. For JS/TS repos, two optional accelerators speed it up: `discover.mjs` writes `conventions.json` once per repo (layer layout + path aliases + API URL prefix), and `walk.mjs` then runs deterministically per query, emitting flat indexes (`byHook` / `byService` / `byApiCall` / `byComponent`) plus an mtime-cached nested tree. The accelerators are JS/TS-specific; the walk itself is universal. Read-only — never edits source. Other skills (notably `scout`) defer to it for navigation and fall back to `Explore`/`rg`/`grep` only for term sweeps, full-text search, and config/migration searches.

**Shared globals (7)** — skills the baseline *uses* heavily; vendored into `.claude/skills/` so they travel with the repo and have no external runtime dependency:

Each vendored shared global ships with its own `LICENSE` + `NOTICE` alongside the skill, recording the upstream URL and any local changes:

- `claude-automation-recommender` — Apache 2.0, vendored from Anthropic's `claude-code-setup` plugin. Mandatory first step (§0); analyzes a target project and surfaces stack-specific tweaks for `/init-project`.
- `code-structure` — MANDATORY on every code-generation step. Written for this baseline (Friedbot Studio); the repo license applies. Language-agnostic three-layer model (Orchestration / Domain / Foundation). See §2.6.
- `humanizer` — MIT, vendored from [`blader/humanizer`](https://github.com/blader/humanizer). Strips AI-writing tells (em-dash overuse, rule of three, inflated symbolism, AI vocabulary, superficial -ing, filler, hedging). Invoked by `prose` on every draft.
- `documentation` — Apache 2.0, vendored from Anthropic's `claude-code-setup` plugin. Technical reference writing (API docs, architecture, runbooks). Delegate target from `/document`.
- `technical-tutorials` — MIT, vendored from [`jonathimer/devmarketing-skills`](https://github.com/jonathimer/devmarketing-skills). Step-by-step / quickstart / walkthrough. Delegate target from `/document`. Audience-context shape lives in this skill's `references/audience-context.md` (consolidated from the upstream `developer-audience-context` skill on 2026-04-28).
- `copywriting` — MIT, vendored from [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills). Persuasive user-facing copy (landing, pricing, feature, hero, CTA). Invoked by `prose` when register is persuasive.
- `impeccable` — Apache 2.0, vendored from [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable). Production-grade frontend interface design. Loads `PRODUCT.md` / `DESIGN.md`, picks register (brand vs. product), applies shared design laws (OKLCH color, typography rhythm, layout cadence, motion tied to physics, copy with specificity). Stays untouched per Article IX. Inside workflow phases, `design-ui` orchestrates `impeccable` (per Article X.2) — every UI design move is an `impeccable` subcommand invocation chosen and run from main context.

**Drift defender (1)**:

- `audit-baseline` — verifies hooks/agents/skills/commands names + counts, settings.json wiring, project.json key presence, .mcp.json servers, helper script presence, vendored license files, and cross-doc count claims. Run on demand, by `/init-project` Step 8, or in CI. Read-only; auto-invocable.

**Alternate tracks (1)** — stripped-down workflows routed via `/triage` when the request needs no TDD:

- `chore` — for tasks with no failing-test-driven code change (documentation, governance counts, vendored-skill content updates, configuration, formatting, typo fixes, dependency bumps, skill consolidations). Skips `/scenario` and `/implement` — there is nothing to drive with a failing test. Runs the edits directly, then conditionally invokes `simplify` / `integrate` / `document` based on what the diff touches (each has explicit triggers in the chore skill body). `verify`, `archive`, and `/grant-commit` + `/commit` always run. Chore is a stripped-down pipeline, **not** a bypass — silent skips of triggered conditional phases are forbidden; the end-of-chore summary documents every skip rationale. Tasks that need a real failing test route to `/tdd` or higher instead.

### §4.4 Commands (6) — structurally user-only

Files at `.claude/commands/<name>.md`. Commands differ from skills in exactly one way: **Claude cannot invoke them via the Skill tool.** A command is a button only a human can press.

| Command | Role |
|---|---|
| `approve-spec` | Human approval of a spec draft. Accepts a bare slug, a filename, or a full path; canonicalizes via `lib/common.mjs → canonicalSlug` and writes `.claude/state/spec_approvals/<slug>.approval`. Only sanctioned path — `spec_approval_guard` blocks all other routes. |
| `approve-swarm` | Human approval of a swarm plan. Writes `.claude/state/swarm_approvals/<slug>.approval`. Required before `swarm-dispatch` runs. |
| `grant-commit` | Opens a 5-minute consent window for `git commit` on a protected branch. Writes `.claude/state/commit_consent`. Enforced by `git_commit_guard`. |
| `grant-push` | Opens a 5-minute consent window for `git push` on a protected branch. Writes `.claude/state/push_consent`. Enforced by `git_commit_guard`. Not a workflow-phase gate — a runtime consent for the branch-aware policy (§11). |
| `init-project` | One-time bootstrap. Detects stack, proposes `.claude/project.json` (test cmd, lint cmd, TDD globs, destructive patterns, artifact required sections, swarm config). Flips `configured: true`. |
| `init-project-doctor` | Detects baseline drift — missing/invalid `.claude/workflows.jsonl`, schema/invariant violations, four-way Article IV / §18 mirror drift, and (advisory) shipped-tooling files placed outside `.claude/`. Interactive: presents each violation via `AskUserQuestion` and applies the named fix on confirmation. |

**Adding a seventh command requires answering yes to both:** "does a human need to press this?" and "is 'user-only via frontmatter flag' too weak a guarantee?" Otherwise make it a skill.

### §4.5 MCP servers (3)

All declared in `.mcp.json` at the repo root so the capability travels with the project:

- **`context7`** — `npx -y @upstash/context7-mcp`. Live library documentation lookup. Required by §2.5.
- **`plantuml`** — `npx -y plantuml-mcp-server`. Diagram rendering and syntax validation. Used by the spec skill and by `/spec-render` as a fallback when the local CLI is absent.
- **`playwright`** — `npx -y @playwright/mcp@latest`. Microsoft-official browser automation MCP (Apache 2.0). Drives Chromium / WebKit / Firefox via stdio. The `design-ui` skill uses it for cross-engine visual verification (screenshots per breakpoint, accessibility-tree snapshots, reserved-accent grep over the rendered DOM). The `integrate` skill uses it conditionally for cross-engine smoke when the diff touches the rendered UI. First run downloads ~300 MB of browser binaries — cost is paid once per project. Skills check `.mcp.json` for the server's presence before invoking; a project that drops the declaration silently disables those steps without breaking either skill.

### §4.6 State files (`.claude/state/`)

Runtime-only; gitignore or keep out of commits per project policy.

| File | Written by | Read by |
|---|---|---|
| `workflow.json` | `/triage` | `track_guard`, every phase skill, `/harness` |
| `commit_consent` | `/grant-commit` | `git_commit_guard` |
| `push_consent` | `/grant-push` | `git_commit_guard` |
| `spec_approvals/<slug>.approval` | `/approve-spec` | `tdd`, `swarm-plan`, `/harness` |
| `swarm_approvals/<slug>.approval` | `/approve-swarm` | `swarm-dispatch`, `/harness` |
| `swarm/<slug>.json` | `swarm-plan` | `swarm-dispatch`, `swarm_merge.sh` |
| `swarm/active_wave.json` | `swarm-dispatch` | `swarm_boundary_guard`, `swarm_merge.sh` |
| `last_test_result` | `verify` skill | `verify_pass_guard`, `simplify`, `integrate` |
| `harness/<slug>.log` | `/harness` | human audit |

### §4.7 Required diagram kinds (for specs)

Every `docs/specs/<slug>.md` must contain these inside ````plantuml```` fences; `spec_diagram_presence_guard` enforces:

- **C4 Context** — who interacts with the system and which external systems it touches.
- **C4 Container** — deployable units inside the system boundary.
- **C4 Component** — one per changed container, showing internals.
- **Class diagram** — entities + cardinality with `<<new>>` / `<<changed>>` markers.
- **Sequence diagram** — one per acceptance criterion, titled `Behavior #N`. Prose descriptions of behavior are forbidden.
- **Dependency graph** — directed, acyclic. First line is the comment `' @kind dependency-graph` to identify the block.

Configured at `project.json → artifacts.required_diagrams.spec`.

---

## §5 — The 11-phase workflow

Phases are fixed ordering; `/triage` picks the entry and may mark phases as exceptions.

```
1  intake       (brd optional, stakeholder-heavy only)
2  scout
3  research
4  spec
5  review       (/approve-spec — human consent gate A)
6  tdd          (solo)
    — OR —
6a swarm-plan
6b /approve-swarm — human consent gate B
6c swarm-dispatch
7  simplify
8  security     (optional — skip via triage exception)
9  integrate
10 document
10.5 archive
10.6 memory-flush
11 /grant-commit — human consent gate C
11b commit
```

**Entries by track:**

- New implementation → enter at intake (1).
- Bugfix → enter at spec (4) or tdd (6). Triage decides.
- Quickfix → enter at tdd (6). Triage marks intake/scout/research/spec/review as exceptions.
- Chore → enter at the `chore` track. Used when the request needs no failing-test-driven code change — documentation, governance counts, vendored-skill content, configuration tweaks, formatting, typo fixes, dependency bumps without project code, skill consolidations. Triage marks `intake / brd / scout / research / spec / review / tdd` as exceptions; `simplify / integrate / document` stay in the phase list and the chore skill decides per-phase whether triggers apply. `verify / archive / /grant-commit / /commit` always run. Anything needing a real failing test routes to tdd or higher.
- Epic → enter at the `epic` track (§18.9). Used for a multi-subtask feature that warrants running discovery once: `intake → scout → research → spec (sliced) → approve-spec` run a single time, the sliced spec commits live at `docs/specs/<epic>.md`, and `/triage` writes `.claude/state/epic/<slug>.json` carrying one slice per future child.
- Epic-child → enter at the `epic-child` track (§18.9). Auto-selected when an approved epic is active and the request matches one of its open slices. Inherits + pins the epic's scout/research/spec (enforced by `track_guard`), runs only `tdd → integrate → archive → /grant-commit → commit`, and escalates `simplify / security / document` into the child only when `/triage` risk-flags the slice.

**Swarm path taken when:** the approved spec has ≥ `project.json → swarm.min_tasks_worth_swarming` (default 3) independent components in its C4 Component + dependency graph **AND** the project is a git repository. Otherwise solo `/tdd`. Non-git projects route Phase 6 to solo unconditionally — `/triage` auto-excepts `swarm-plan`, `approve-swarm`, and `swarm-dispatch` because worktree isolation (the swarm contract's physical safety mechanism) requires git; `shared` isolation is a sanctioned configuration knob for git projects that opt out of worktrees but does not restore the cross-task write isolation the swarm-worker assumes.

---

## §6 — Consent model

**Four consent gates + one bootstrap + one doctor.** All are slash commands, not skills. Commands live in `.claude/commands/`; Claude cannot invoke them via the Skill tool. The guarantee is structural (file location), not flag-based. Three of the four gates are workflow-phase gates (A: `/approve-spec`, B: `/approve-swarm`, C: `/grant-commit`); the fourth (`/grant-push`) is a Bash-time consent for the branch-aware push policy in §11. The bootstrap is `/init-project`; the doctor is `/init-project doctor` (drift detector + repairer for `.claude/workflows.jsonl` + the §18 / Article IV four-way mirror; see §18.7).

| Gate | When it fires | Unlocks |
|---|---|---|
| `/init-project` | Once per repo, before any work | Flips `configured: true`; silences the `setup_guard` advisory and lets `test_runner` / `lint_runner` move out of guide mode |
| `/approve-spec <path>` | After `/spec` produces a draft | Writes approval token; downstream phases proceed |
| `/approve-swarm <slug>` | After `/swarm-plan` produces a plan | Writes approval token; `swarm-dispatch` may run |
| `/grant-commit` | Before `/commit` | Writes 5-min consent token; `git_commit_guard` allows next commit on a protected branch |
| `/grant-push` | Before `git push` on a protected branch | Writes 5-min consent token; `git_commit_guard` allows next push on a protected branch (non-protected branches need no consent) |

Harness yields at each gate. User re-invokes `/harness` to resume.

---

## §7 — Harness orchestrator

`/harness` is invokable by both the user (slash command) and the model (`Skill(harness)`). It walks the four-pillar pipeline:

- **Pillar 1+2: intake analysis + track selection** — `/triage` → `/intake` (→ `/brd` if stakeholder-heavy) → `/scout` → `/research` → `/spec` → **yield at `/approve-spec`**.
- **Pillar 3: implementation** — decide swarm vs solo; if swarm, `/swarm-plan` → **yield at `/approve-swarm`** → `/swarm-dispatch`. If solo, `/tdd`.
- **Pillar 4: tying open ends** — `/simplify` → `/security` (unless in exceptions) → `/integrate` → `/document` → `/archive` → **yield at `/grant-commit`** → `/commit`.

**Internal loop atomicity.** A single `Skill(harness)` invocation loops through every non-gated phase boundary until it hits one of four exit conditions: consent gate, phase-skill failure, integrate-failure-needs-spec-change, or workflow done. Inside the loop each iteration is one `Skill(<phase>)` call plus a marker+state refresh; the model emits a terminal message only when the loop exits. `.claude/state/harness_state` is `continue` while the loop is in flight, and is rewritten to `yielded`/`done` on clean exit. The user types nothing between non-gated phases.

**Safety net + consent-resume.** The `harness_continuation` Stop hook (§4.1) is a disjunctive-gate signal with two emission paths, neither of which is the primary phase-driver (the harness loop is). It reads `harness_state`, the active-marker file at `.claude/state/.harness_active`, `workflow.json`, and four canonical consent/approval token paths. **Path A** (the safety net): when `state == "continue"` AND the marker exists AND `stop_hook_active` is absent on the Stop payload, emits `decision:block` so the model re-invokes `Skill(harness)` on the same turn. This fires only when the loop exited mid-flow (context pressure, runtime kill, etc.) and the on-disk state is still `continue`. **Path B** (consent-resume rung 4): when `state == "yielded"` AND `workflow.json` is present AND any consent/approval token has mtime newer than `harness_state`, emits `decision:block` so the harness re-runs preflight and advances past the just-satisfied gate. This is what makes the user's `/grant-commit` / `/approve-spec` / `/approve-swarm` / `/grant-push` slash commands auto-resume the workflow — no second `/harness` typing required. In normal operation between non-gated phases the harness loop exits with `yielded`/`done` (marker absent) and Path A is silent; Path B is silent until a consent token is freshly written. The harness skill creates the marker on `continue` writes (marker FIRST, then state) and deletes it on every `yielded`/`done` write (marker FIRST, then state). SessionStart deletes the marker unconditionally so cross-session ghost resumption is structurally impossible. The hook is bounded to one block per turn by Claude Code's `stop_hook_active` semantics, so it cannot itself drive multi-phase chaining — that's the harness loop's job.

**Resume after yield.** At consent gates (`/approve-spec`, `/approve-swarm`, `/grant-commit`) and integrate-failure decisions that need a spec change, harness writes `harness_state: yielded`, the Stop hook stays silent, the turn ends, and the user types the next slash command. Every transition logged to `.claude/state/harness/<slug>.log`.

**Integrate-failure decision tree.** When `/integrate` fails, the orchestrator classifies:

- **Auto-loop to `/tdd`** (max 3 attempts) when *all* hold: failing tests are on spec-defined behavior, failure is localized, fix is mechanical.
- **Stop and surface** when *any* hold: test expects un-spec'd behavior; two ACs contradict; failure reveals an un-spec'd component or cross-wave coupling. These are spec-change decisions, not bug fixes. Human input required.

---

## §8 — Swarm layer

For specs with ≥ 3 independent components. Three pieces plus a merge script:

1. **`/swarm-plan <slug>`** — decomposes the approved spec. Each task declares `write_set` (exact file paths), `depends_on`, `acs`. `validate.sh` checks acyclicity + required fields, then assigns **waves** greedily so that `write_set`s within any wave are pairwise disjoint. Output: `.claude/state/swarm/<slug>.json`.
2. **`/approve-swarm <slug>`** — command. Writes approval token.
3. **`/swarm-dispatch <slug>`** — runs waves sequentially. For each wave:
   - **Main context decides each task's recipe** (scenario list + implementation contract) before dispatch. Once the wave is in flight the recipes cannot be changed.
   - Writes `active_wave.json` with `baseline_ref: <git HEAD>` and the wave's write_sets.
   - Issues N parallel `Agent` calls, one per task, all with `subagent_type: "swarm-worker"`, `isolation: "worktree"`, and `run_in_background: true`. All in a single message.
   - Each `swarm-worker` invokes `Skill(scenario)` with the recipe, then `Skill(implement)` with the contract. It makes no design decisions — it executes the recipe and reports JSON status.
   - On completion, `swarm_merge.sh <plan> <task-id> <worktree-path>` for each task:
     - `git -C <worktree> diff <baseline_ref>` lists changed files.
     - Asserts changed files ⊆ `task.write_set` (audit).
     - `git apply` the patch onto main.
     - `git worktree remove` on success; preserves the worktree on audit failure.
   - Any failure aborts remaining waves.

**Isolation modes** (`project.json → swarm.isolation`):

- `worktree` (default when git repo) — physical filesystem isolation; cross-task writes impossible by construction.
- `shared` — no worktrees; `swarm_boundary_guard` polices writes at runtime within `swarm.enforced_path_prefixes`. Coverage is incomplete by construction: paths under `swarm.exempt_path_prefixes` (e.g. `.claude/`) are not policed at all. Choose deliberately on git projects that opt out of worktrees; never as a non-git fallback.
- `auto` — picks worktree if git; on non-git, `/triage` auto-excepts the swarm phases at workflow-creation time (§5), so this value never resolves to `shared` via the swarm path.

Preflight in worktree mode refuses a dirty working tree (`swarm.refuse_dirty_tree: true`) — baseline ambiguity would break the merge audit.

---

## §9 — Diagram-driven specs

The spec template ships six required PlantUML diagrams (§4.7). Three write-boundary hooks enforce:

- `artifact_template_guard` — required `##` headings present.
- `plantuml_syntax_guard` — when `plantuml.strict_syntax_check` is enabled, every fence parses via `plantuml -checkonly -pipe`; advisory (deferred to `/spec-lint`) by default.
- `spec_diagram_presence_guard` — every required diagram kind present.

Two skills iterate safely while drafting:

- `/spec-lint <slug>` — preflight (syntax + presence + AC-to-sequence traceability).
- `/spec-render <slug>` — renders every fence to SVG for human review.

Two read-only skills review before `/approve-spec` (run in main context — no subagent indirection):

- `spec-diagram-review` — cross-consistency (C4 ↔ dependency graph ↔ class diagram ↔ DDL).
- `spec-traceability-review` — every spec AC traces to a real upstream AC.

---

## §10 — Writing discipline

**Prose for human readers passes through `humanizer`. Prose for Claude does not.**

The distinction matters because some markdown files in this repo look like prose but are actually contracts Claude reads to decide behavior. Rewriting those for "natural rhythm" softens imperatives, drops precision, and breaks load-bearing repetition. Two registers, two pipelines:

### Human-facing prose → `prose` skill → `humanizer`

`/document` orchestrates writing for human readers and delegates:

- Technical reference → `documentation` skill.
- Tutorials / quickstarts → `technical-tutorials` skill.
- Body prose, summaries, READMEs, user-facing copy → `prose` skill.

`prose` invokes:
- `humanizer` on every draft. Mandatory, no exceptions, regardless of length.
- `copywriting` conditionally when the register is persuasive (landing, pricing, feature, hero, CTA, subheadline).

Phase skills that produce prose for a reviewer (intake Problem/Goal, spec Context, RCA Summary/Timeline, commit message body) may route through `prose`. Not yet wired across every phase skill — see §14 follow-up.

### Claude-instructional prose → never humanized

These files are read into Claude's context as instructions. Their imperatives are load-bearing. **Do not run `humanizer` (or `prose`) on them**, even partially:

- `CLAUDE.md` — session constitution.
- `docs/init/seed.md` — this file. Rebuild prompt; spec language values precision over rhythm.
- `.claude/skills/*/SKILL.md` — every skill prompt.
- `.claude/agents/*.md` — the `swarm-worker` subagent prompt.
- `.claude/commands/*.md` — every command prompt.
- `.claude/skills/*/template.md` — canonical artifact structure that downstream guards check.

The `prose` skill enforces this guardrail in its own prompt and refuses requests that target these paths. If you find a SKILL.md that has been softened ("MUST" → "should", "NEVER" → "avoid"), restore the imperatives — that's the contract Claude reads.

### Mixed files

Some files have both registers — `README.md` has a user-facing intro plus a mechanical layout tree. Surgically humanize the prose blocks; leave configuration tables, file paths, and frontmatter untouched.

---

## §11 — Git rules

**Applicability.** §11 applies only when the project is a git repository — i.e., `git rev-parse --is-inside-work-tree` exits 0 at the project root. On a non-git project, §11 is vacuously satisfied: Claude SHALL NOT attempt any git operation, the consent gate C and the `commit` phase are auto-excepted by `/triage`, and persistence outside git is the user's responsibility. The rules below bind only inside the git-repository case.

Claude may run `git add <named paths>` and `git commit` only when the user has asked for a commit. Claude never runs git without an explicit request.

The following are forbidden unless the user names the exact operation in their current request:

- `git push --force`, `--force-with-lease` (the bare `git push` is governed by the branch-aware policy below, not by this list).
- `git commit --amend` — always create a new commit.
- `--no-verify`, `--no-gpg-sign`, or any flag that skips hooks/signing.
- `git reset --hard`, `git clean -f`, `git checkout --`, `git branch -D`.
- `git config` changes.
- `git rebase -i`, `git add -i` (interactive).
- `git add -A`, `git add .` — name the paths to avoid sweeping in secrets or unrelated dirty files.

**Branch-aware consent policy.** `git_commit_guard` reads the current branch via `git rev-parse --abbrev-ref HEAD` on every `git commit` / `git push` invocation and routes per:

- `project.json → git.protected_branches` — glob list. `null` (default) means every branch is protected. Set e.g. `["main", "release/*"]` to limit consent enforcement.
- `project.json → git.branch_pattern` — regex, optional. When set, commits on off-pattern branches are denied with the pattern surfaced in the error.

On a **protected branch**, commit requires fresh `commit_consent` (`/grant-commit`), push requires fresh `push_consent` (`/grant-push`). On a non-protected branch, both proceed without consent. **Detached HEAD** (`git rev-parse` returns the literal `HEAD`) denies both — branch-aware policy needs a named branch.

**Branch topology policy (declared model + precedence).** Consent governs *whether* a commit is allowed; topology governs *where* it may land. `git_commit_guard` reads two more knobs:

- `project.json → git.workflow_model` — enum `direct-to-main | github-flow | ask`. `gitflow` and `trunk` are reserved values that resolve to `ask` until a consumer needs their enforcement logic; absent or unrecognized also resolves to `ask`.
- `project.json → git.release_branches` — glob list naming the release line. Default `["main"]`. Consulted by both enforced models (reuses the `matchAnyGlob` matcher already used for `protected_branches`).

On the **primary working tree** only: under `direct-to-main` a commit whose branch is **not** in `release_branches` is blocked with a `git checkout <release> && git merge --ff-only <branch>` remediation; under `github-flow` a commit whose branch **is** in `release_branches` is blocked ("create a feature branch first"); under `ask` the guard passes (the guard never prompts — the branch question belongs to the `/commit` and `/harness` SOPs). Topology runs **after** the detached-HEAD deny and **before** the consent/pattern checks; a topology PASS *composes with* consent rather than masking it — a protected-branch commit that passes topology still needs a fresh `commit_consent`.

**Precedence (the binding clause).** When `git.workflow_model` resolves to anything other than `ask`, the declared model **overrides Claude's generic branching instincts and the harness's default branching behavior**. Claude SHALL NOT create, switch, or delete branches except as the model prescribes (`direct-to-main`: keep work on the release line, never reflexively spin up a feature branch; `github-flow`: the inverse). When the model is `ask`, Claude SHALL yield the branch decision to the user rather than improvise. This closes the failure mode where a generic "branch off the default branch first" instinct overrode an established project practice (commit `6e11f2f`).

**Swarm-worktree carve-out.** Topology is enforced **only on the primary working tree** — the tree where `git rev-parse --git-dir` equals `git rev-parse --git-common-dir`. Commits inside a `/swarm-dispatch` linked worktree (where those differ) are exempt, so wave dispatch never false-blocks; the single Phase-11 `/commit` on the primary tree is the enforced boundary.

`/init-project` detects the model best-effort (release-CI trigger, `gh api` branch protection, history shape) and **floors to `ask`** on any ambiguity or unreachable tooling, confirming the proposal via `AskUserQuestion` — never a silent guess.

`git_commit_guard` enforces these; bypassing requires editing the hook, which is itself a visible change.

---

## §12 — Archive discipline (Phase 10.5)

Seed-level requirement: no stale workflow artifacts in the working tree after commit.

`/archive` runs after `/document` and before `/commit`. It moves every slug-matched artifact into `docs/archive/<YYYY-MM-DD>/<slug>/`:

- `docs/intake/<slug>.md`, `docs/brd/<slug>.md`, `docs/scout/<slug>.md`, `docs/research/<slug>.md`, `docs/specs/<slug>.md`.
- `docs/specs/_rendered/<slug>/` (entire directory).
- `docs/security/<slug>-*.md` (concatenated into `security.md` in the bundle).
- `.claude/state/spec_approvals/<slug>.approval`, `.claude/state/swarm/<slug>.json`, `.claude/state/swarm_approvals/<slug>.approval`.

`workflow.json` is held back and archived as the first step of `/commit` — phase-ordering checks must work up to the last gate.

**Archive is append-only.** A bundle directory at `<date>/<slug>/` is never overwritten; the script refuses if a target file already exists. Re-runs only land new slugs.

---

## §13 — Rebuild protocol

**Step 0 (mandatory):** Run `/claude-automation-recommender` on the target project. Feed its output into every subsequent step that has project-specific parameters (test/lint commands, destructive patterns, framework conventions).

**Step 1:** Initialize the directory structure (§3).

**Step 2:** Write `.mcp.json` with `context7` and `plantuml` declarations.

**Step 3:** Write `.claude/hooks/lib/common.mjs` (shared helpers, Node ESM), then the 23 hook scripts (§4.1) as `.mjs` files — 18 write/run-boundary guards plus 4 lifecycle hooks (`memory_session_start`, `memory_stop`, `memory_pre_compact`, `harness_continuation`) plus 1 input-boundary hook (`consent_gate_grant` on `UserPromptSubmit`). Three additional .mjs helpers (`lib/memory_stop.mjs`, `lib/memory_session_start.mjs`, `lib/resume_writer.mjs`) hold the transcript-walk + memory-index + continuity-snapshot logic that the lifecycle hooks import. Each top-level .mjs is `chmod +x`. Wire into `.claude/settings.json` at the appropriate event (`PreToolUse` / `PostToolUse` / `SessionStart` / `Stop` / `PreCompact` / `UserPromptSubmit`) and matcher (`Bash` / `Write|Edit|MultiEdit|NotebookEdit` / `Write` / `manual|auto`); each hook is wired as `node $CLAUDE_PROJECT_DIR/.claude/hooks/<name>.mjs`.

**Step 4:** Write `src/agents/swarm-worker.template.md` (canonical-body store, per §4.2) — the only subagent template. Then render `.claude/agents/swarm-worker.md` from it with default tokens. The template carries four tokens — `{{NAME}}`, `{{DESCRIPTION}}`, `{{SKILLS}}`, `{{ROLE_LINE}}`. Default `SKILLS` is the YAML list block `  - scenario\n  - implement` (the worker's two mandatory sub-skills). Render-parity holds at this stage. `/init-project` later re-renders the worker with stack-aware tokens when the recommender flags stack-specific skills to preload via `additions.swarm_worker_skills`.

**Step 5:** Write `.claude/skills/` for the 41 skills (§4.3) — 31 workflow/worker/orchestration/memory/alt-track skills you author (the +2 over 29 are the `brainstorm` phase helper and the `standup` generator) plus 7 shared globals plus 1 navigation skill plus 1 audit skill plus 1 maintenance skill. The breakdown: artifact drafting (4) + workflow phases (10) + phase workers (5: `scenario`, `implement`, `verify`, `prose`, `design-ui`) + spec helpers (4: `spec-lint`, `spec-render`, `spec-diagram-review`, `spec-traceability-review`) + orchestration (3: `harness`, `swarm-plan`, `swarm-dispatch`) + memory (1: `memory-flush`) + navigation (1: `code-browser`) + generators (2: `whatsnew`, `standup`) + shared globals (7: `claude-automation-recommender`, `code-structure`, `humanizer`, `documentation`, `technical-tutorials`, `copywriting`, `impeccable`) + drift defender (1: `audit-baseline`) + alternate tracks (1: `chore`) + maintenance (1: `upgrade-project`). The vendored `claude-automation-recommender` (Apache 2.0, from `claude-code-setup`), the writing/quality globals, and the design global ship unchanged with their licenses intact. Artifact skills (intake, brd, spec, rca) each ship a `template.md`. Helper scripts: swarm-plan gets `validate.mjs`, swarm-dispatch gets `swarm_merge.mjs`, spec-render gets `render.mjs`, spec-lint gets `lint.mjs`, archive gets `archive.sh`, audit-baseline gets `audit.mjs`, code-browser gets `discover.mjs` + `walk.mjs`. All helper scripts `chmod +x`.

**Step 6:** Write `.claude/commands/*.md` for the 4 gates (§4.4). All carry `disable-model-invocation: true` as belt-and-braces; structural user-only is enforced by their directory.

**Step 7:** Write `CLAUDE.md` at the repo root with the session constitution — the rules in §2, the phase list, the commands-vs-skills convention, the swarm + archive + writing-discipline notes.

**Step 8:** Run `/init-project`. Detect stack from the recommender's report; populate `.claude/project.json`:

- `test.cmd` / `lint.cmd` — per recommender's framework detection.
- `tdd.source_globs` / `test_globs` / `exempt_globs` — per stack conventions.
- `destructive.hard_block_patterns` / `ask_patterns` — baseline regex set, extend with stack-specific.
- `artifacts.required_sections.{intake,brd,spec,rca}` — the canonical section lists.
- `artifacts.required_diagrams.spec` — the six kinds (§4.7).
- `swarm.max_parallel`, `swarm.isolation: "auto"`, `swarm.min_tasks_worth_swarming: 3`, `swarm.refuse_dirty_tree: true`, `swarm.exempt_path_prefixes`, `swarm.enforced_path_prefixes`.
- `consent.commit_ttl_seconds: 300`.
- `additions.{agents,skills,hooks,mcp_servers,swarm_worker_skills}` — names of every project-adopted addition the recommender emitted (just identifiers, no `command`/`why`/`tokens` payload). `additions.agents` stays empty in this baseline — the recommender does not propose new subagent types. `additions.swarm_worker_skills` lists stack-specific skills the `swarm-worker` template should preload via the `{{SKILLS}}` token at re-render time. `audit.mjs` reads this manifest and unions each set with the baseline `EXPECTED_*` sets when checking names; counts are reframed as `"<total> = <baseline> + <project>"` so legitimate additions don't fail drift detection. Default state is five empty arrays.
- Flip `configured: true`.

**Step 9 (smoke tests):** Exercise in order —

1. `/triage "<test request>"` → writes `workflow.json`.
2. Write a spec at `docs/specs/test.md` with all 6 diagrams → `spec_diagram_presence_guard` + `plantuml_syntax_guard` allow.
3. Write a spec missing a diagram → guard denies with named missing kinds.
4. Attempt `git commit` on a protected branch without `/grant-commit` → `git_commit_guard` denies.
5. Attempt `git push` on a protected branch without `/grant-push` → denied. Same `git push` on a non-protected branch (when `git.protected_branches` is set to e.g. `["main"]` and current branch is `feat/foo`) → allowed without consent.
6. Attempt `git commit` or `git push` while detached (`git checkout <sha>`) → denied with explicit "Detached HEAD" message.

---

## §14 — Change control

- This file is the source of truth. Implementation drift means the implementation is wrong.
- **`CLAUDE.md` size cap.** `CLAUDE.md` SHALL NOT exceed **40,000 characters**. It carries binding rules only; amendment history, enforcement-mechanism narration, reference appendices, AND the elaborative rule tables for project amendments (Article X) live in `.claude/CONSTITUTION.md` (read on demand) — when an Article's detail is relocated, CLAUDE.md retains that rule's binding clause plus a pointer to the annex, so no rule loses binding force by relocation. `audit-baseline` enforces the cap (FAIL when `CLAUDE.md` exceeds 40,000 chars), and the same cap binds the byte-equal mirror `src/CLAUDE.template.md`; the governance test suite MAY additionally enforce a tighter advisory headroom target below the hard cap.
- Drift audits run periodically: count hooks on disk vs. counts claimed in docs, same for agents/skills/commands; list phase names referenced in any skill vs. the canonical list in §5.
- Adding a component updates both the implementation AND this file in the same workflow. Archive the old seed as `docs/init/seed.<yyyy-mm-dd>.md` before replacing.
- The baseline's own site (`docs/site/index.html`) is generated from this seed. If the site drifts from here, the site is wrong.

### Known follow-ups

- **Wire `prose` into the remaining phase skills** (§10). `/intake`, `/spec`, `/rca`, and `/commit` produce reviewer-facing prose inline instead of delegating. Until fixed, those skills skip the mandatory `humanizer` pass.
- **Enforce the `/integrate` auto-loop counter** (§7). The 3-retry cap lives in the harness skill's documentation but nothing tracks it at runtime. A runaway loop currently relies on the user noticing. A small counter in `.claude/state/harness/<slug>.log` (or a sibling file) would close this.
- **Lazy-create directories on rebuild Step 1** (§3, §13). The seed lists `docs/{scout,research,security,archive}/` in the layout but they're created on first phase-skill use. Decide whether `/init-project` should pre-create them or keep the lazy approach.

---

## §15 — On invoking `/claude-automation-recommender`

Repeating §0 because it is load-bearing: the recommender is mandatory. It ships at `.claude/skills/claude-automation-recommender/` — no external install. License: Apache 2.0 (see that directory's `LICENSE` + `NOTICE`).

When to run it:

- **Once at project setup** — before Step 1 of §13, so its findings inform the rest of the rebuild.
- **Whenever the stack changes** — new framework, major version upgrade, test-runner migration. Re-run; it re-evaluates.
- **Whenever the baseline feels wrong** — guards firing on legitimate writes, phase skills producing off-target output. The fix is usually a project-specific tweak the recommender already knows.

Its output is structured input to `/init-project`, not optional reading.

---

## §16 — Project-specific configuration
*Reserved.* `/init-project` populates this section on first run with:

- Detected stack (language, framework, test/lint commands, package manager).
- Recommender additions adopted (`mcp_servers`, `skills`, `hooks`, `swarm_worker_skills`).
- `project.json` values applied (`test.cmd`, `lint.cmd`, `tdd.source_globs`, `tdd.test_globs`, `tdd.ui_globs`, `destructive.*`, `swarm.*`, `harness.*`, etc.).
- Workflow tweaks (any phase exceptions or reorderings the recommender proposes).
- Deviations from the canonical seed (with rationale).
- Open follow-ups surfaced by the recommender.
- The recommender output verbatim (JSON), saved to `.claude/state/init/<ISO timestamp>.recommender.json`.

Until `/init-project` runs, this section stays empty. Once populated, every field below carries a stamp identifying the run that wrote it.

---

## §17 — Skill provenance and the baseline manifest

A skill at `.claude/skills/<slug>/SKILL.md` is **baseline-owned** iff its YAML frontmatter declares `owner: baseline`. Baseline-owned skills are those that ship with the baseline; every other skill on disk — those without an `owner:` field, or those declaring `owner: user` — is user/third-party and out-of-scope of baseline audit checks. Absence-of-`owner` is the deliberate default so a project that already has its own skills can install the baseline without annotating any of those files. The build script `scripts/build-manifest.mjs` reads each `owner:` value at release time and emits the canonical baseline-skill set into the shipped manifest at `obj/template/.claude/manifest.json` under `owners.skills` (a JSON object mapping slug → `"baseline"`). The recursive install copies the manifest into the consumer target at `<target>/.claude/manifest.json` (same in-tree path, no special-case). The CLI separately writes `<target>/.claude/.baseline-manifest.json` post-install on `freshInstall`/`forceInstall`/`merge` — that file is the runtime snapshot of the target's actual on-disk hashes, consumed by `doctor` and `upgrade`. The two files coexist by design: the shipped manifest is frozen at release time and carries `owners.skills`; the runtime manifest is generated at install time and is hash-only.

The audit at `.claude/skills/audit-baseline/audit.mjs` consumes `manifest.owners.skills` as the canonical baseline-skill enumeration (replacing the previous hard-coded `EXPECTED_SKILLS` set). It reads the manifest from `<root>/.claude/manifest.json` first (consumer projects) and falls back to `<root>/obj/template/.claude/manifest.json` (the baseline dev repo where `npm run build` writes the manifest). For every baseline-owned skill, the audit re-derives sha256 hashes from `manifest.files` and compares against on-disk content; a mismatch is reported as `hash mismatch at <path>` against the named slug. A baseline skill present in the manifest but absent from disk is reported as `baseline skill missing`. A SKILL.md whose `owner:` field is present but carries an invalid value (anything other than `baseline` or `user`) is reported as `invalid owner=<value>`. SKILL.md files without an `owner:` field are treated as user/third-party and silently skipped — they are excluded from the baseline count, the names-match check, and the hash-drift check, so installing the baseline into a project that already has its own skills never breaks the audit.

The audit also verifies constitutional citation: CLAUDE.md SHALL contain the literal string "Article XI" and a reference to the manifest, and `docs/init/seed.md` SHALL contain "§17" and a manifest reference. Missing citations trigger FAIL with `CLAUDE.md missing Article XI citation` or `seed.md missing §17 citation`.

This provenance system is intentionally minimal: the manifest tracks shipped-file hashes; the frontmatter declares per-skill ownership; the audit reconciles the two against on-disk reality. Cryptographic supply-chain attestation, signed lock files, and per-skill aggregate merkle hashes are non-goals; the per-file `manifest.files` map already covers every file in every skill directory. A future `npx @friedbotstudio/create-baseline upgrade` subcommand will consume `manifest.owners.skills` + `manifest.files` to safely re-overlay baseline-owned files while leaving user-added skills and locally-customized baseline skills untouched — that subcommand is out of scope here.

---

## §18 — Workflow definitions and Article IV invariants

### 18.1 Source of truth

`.claude/workflows.jsonl` is the canonical source for every workflow this baseline can execute. The file holds one Track record per line (JSONL). It is project-owned and `NEVER_TOUCH` (declared in `src/cli/install.js:NEVER_TOUCH` and `scripts/build-manifest.mjs:NEVER_TOUCH_PATHS`); baseline upgrades preserve user customizations verbatim via `NEVER_TOUCH_PRESERVE`. The shipped baseline overlays the pristine 9-track set from `src/.claude/workflows.template.jsonl` onto fresh installs via `scripts/build-template.sh` Stage 2; existing installs are not touched. The JSON Schema document at `.claude/schemas/workflow-track.v1.json` is referenced by `Track.$schema` and is itself `NEVER_TOUCH`.

`workflows.jsonl` supersedes the hardcoded triage templates (intake-full / spec-entry / tdd-quickfix / chore). Triage reads `workflows.jsonl` at seed time, validates each Track, classifies the user's request, and materializes the chosen Track's DAG into the TaskList. The canonical four tracks shipped in the pristine template are byte-equivalent to the pre-§18 hardcoded templates per spec AC-016 (`tests/byte-equivalent-migration.test.mjs`). A fifth selectable track, `freeform`, is a §18-native addition with no pre-§18 byte-equivalent counterpart: its DAG carries only the closing sequence (`memory-flush` → `grant-commit` → `commit`) and relies on blanket exceptions across every pre-commit phase to silence track-ordering while keeping every hook active. The 9-track inventory: 7 selectable (intake-full, spec-entry, tdd-quickfix, chore, freeform, epic, epic-child) + 2 sub-tracks (swarm-implementation, tdd-worker-chain). The `epic` / `epic-child` pair (§18.9) amortizes feature-scoped discovery across the subtasks of one feature.

### 18.2 Track schema

A **Track** record has this shape (full definition in `.claude/schemas/workflow-track.v1.json`):

```jsonc
{
  "$schema": "./schemas/workflow-track.v1.json",
  "track_id": "<unique-across-file>",
  "name": "<short label>",
  "description": "<paragraph; read by the LLM classifier>",
  "selectable": true,            // false = sub-track only (referenced via sub_track)
  "selector_hints": ["<descriptive phrase>", ...],
  "preconditions": [{"name": "<predicate>", "argument": "<opt>"}, ...],
  "invariants": ["commits", "requires_spec", ...],
  "nodes": [Node, ...]
}
```

A **Node** is either a `task` (skill invocation or sub-track expansion) or a `selector` (picks one of multiple alternates at runtime):

```jsonc
{
  "id": "<unique-within-track>",
  "type": "task" | "selector",
  // type=task → exactly one of:
  "skill": "<skill-or-command-name>",
  "sub_track": "<another-track_id>",
  // type=selector → required:
  "alternates": [Alternate, ...],
  // shared:
  "input": "<opt; passed to the skill at invocation>",
  "invocation_prompt": "<opt; declared-now/used-later — v2 Handlebars+LLM>",
  "output": "<opt; informational artifact path>",
  "output_formatter_prompt": "<opt; declared-now/used-later>",
  "depends_on": ["<predecessor node id>", ...],
  "blocks": ["<successor node id>", ...],
  "can_parallel": false,         // true: peers at same dep level dispatch concurrently
  "needs_user": false,           // true: consent gate; harness yields
  "activeForm": "<TaskList spinner text>",
  "metadata": {"phase": "<...>"}
}
```

An **Alternate** (inside a selector node):

```jsonc
{
  "skill": "<skill-name>",       // XOR with sub_track
  "sub_track": "<track_id>",     // XOR with skill
  "preconditions": [Predicate, ...],
  "description": "<rationale>"
}
```

A **Predicate** (track-level and alternate-level):

```jsonc
{
  "name": "<v1-vocabulary>",
  "argument": "<opt; e.g., '3' for min_components>"
}
```

### 18.3 Article IV invariants (I1..I11)

Every Track in `workflows.jsonl` SHALL satisfy these invariants. Validation runs at three points: install/upgrade time (audit-baseline), triage time (LLM-driven selector), and harness time (per-node before dispatch).

- **I1.** Unique `track_id` across the file.
- **I2.** Unique `node.id` within a track.
- **I3.** `type=task` nodes carry exactly one of `{skill, sub_track}`. `type=selector` nodes carry non-empty `alternates[]`.
- **I4.** Every `depends_on` and `blocks` reference resolves to a `node.id` in the same track.
- **I5.** The dependency DAG is acyclic.
- **I6.** Tracks declaring the `commits` invariant SHALL include a `needs_user: true` `grant-commit` node ordered before the node with `skill: "commit"`.
- **I7.** Every `sub_track` reference resolves to a Track with `selectable: false`.
- **I8.** Every `skill:` reference resolves to a known invokable — skill in `EXPECTED_SKILLS ∪ project.json additions.skills`, OR consent-gate command in `.claude/commands/` (e.g., `approve-spec`, `grant-commit`, `approve-swarm`).
- **I9.** `needs_user: true` nodes appear in dependency order before any node that depends on their consent.
- **I10.** A selector node's alternates SHALL share the same shape (all skill, or all sub_track) — they're interchangeable in the DAG.
- **I11.** Every `Predicate.name` resolves to a known v1 predicate (see §18.4).

### 18.4 Predicate vocabulary (v1)

The closed set of declarative predicates that may appear in Track or Alternate `preconditions[]`:

| Predicate | Argument | Evaluates true when |
|---|---|---|
| `requires_git` | — | `git rev-parse --is-inside-work-tree` exits 0 at the project root. |
| `requires_user_override` | `<value>` | The user explicitly named this alternate in conversation (e.g., "use solo"). |
| `requires_min_components` | `<int>` | The approved spec has at least N C4 Components. |
| `requires_phase_completed` | `<phase>` | The named phase appears in `workflow.json → completed`. |
| `requires_skill_present` | `<skill_id>` | The named skill exists in `EXPECTED_SKILLS ∪ additions.skills`. |

Adding a new predicate is a constitutional change: update this section, update `src/cli/workflows-validator-predicates.js`, and update the corresponding seed.template.md mirror.

### 18.5 `invocation_prompt` / `output_formatter_prompt` — declared, deferred

Both fields are part of the v1 Node schema and validated at parse time. They are **not actuated in v1** — the harness ignores them. They are declared now to lock the schema shape so future Track records can carry them without a schema bump. The v2 actuation plan: Handlebars-style templates with LLM interpolation, allowing per-track UX customization of the invocation phrasing and the post-skill output formatting. Until v2 ships, populating these fields is allowed but inert.

### 18.6 Migration from pre-§18 workflow.json

An in-flight `.claude/state/workflow.json` written by a pre-§18 baseline (carries `entry_phase` field, no `track_id`) is one-shot-migrated by the harness preflight before the workflow loads. The canonical map:

| `entry_phase` (pre-§18) | `track_id` (post-§18) |
|---|---|
| `intake` | `intake-full` |
| `spec` | `spec-entry` |
| `tdd` | `tdd-quickfix` |
| `chore` | `chore` |

`completed[]` is remapped from phase names to node ids; the canonical tracks are designed so most phase names equal the corresponding node id (identity remap), with the exception of selector wrappers (e.g., `implementation` in intake-full wraps the swarm-vs-tdd selection). The migrator initializes `skipped_alternates: []` and refreshes `updated_at`. Idempotent: re-running on an already-migrated workflow.json is a no-op. Unmapped `entry_phase` halts with a named error; the user restarts via `/triage`.

Migrator implementation: `src/cli/workflow-migrator.js` exports `migrateWorkflowJsonInPlace(filePath)`.

### 18.7 Lifecycle: install, upgrade, doctor

- **Fresh install.** `scripts/build-template.sh` overlays `src/.claude/workflows.template.jsonl` → `obj/template/.claude/workflows.jsonl` at Stage 2, and the pristine schemas/ directory bulk-rsyncs at Stage 1. The CLI install copies both into the consumer target. Result: every fresh install has `<target>/.claude/workflows.jsonl` with the canonical 4 selectable + 2 sub-track set.

- **Upgrade.** Both `.claude/workflows.jsonl` and `.claude/schemas/workflow-track.v1.json` are `NEVER_TOUCH`. The merge flow returns `NEVER_TOUCH_PRESERVE` for them on every upgrade; user customizations (added tracks, modified nodes, per-project additions like `cli-copy-review` and `spec-shippability-review`) survive verbatim.

- **Doctor.** `/init-project doctor` (new sub-command) detects drift: missing `workflows.jsonl`, schema/invariant violations, four-way mirror drift between seed.md §18 / src/seed.template.md §18 / CLAUDE.md Article IV / src/CLAUDE.template.md Article IV, and (advisory) shipped-tooling files placed outside `.claude/` per the convention codified at §3.

### 18.8 Cross-references

- `CLAUDE.md Article IV` — phase-ordering rules; binding on every commit-producing track.
- `CLAUDE.md Article VII` — git rules; relevant to the `requires_git` precondition.
- `seed.md §3` — directory structure convention (tooling lives under `.claude/`).
- `seed.md §17` — skill provenance (separate concern; workflows.jsonl is project-owned, not baseline-owned).
- `.claude/workflows.jsonl` — this project's live tracks.
- `.claude/schemas/workflow-track.v1.json` — JSON Schema referenced by `Track.$schema`.
- `src/cli/workflows-validator.js` — validator orchestration.
- `src/cli/workflows-validator-invariants.js` — invariant checks I1–I11.
- `src/cli/workflows-validator-predicates.js` — predicate vocabulary.
- `src/cli/workflow-migrator.js` — pre-§18 → post-§18 migrator.
- `src/cli/track-tasklist-materializer.js` — Track → TaskList shape.
- `.claude/state/epic/<slug>.json` — per-epic discovery state read by `epic-child` children and `track_guard` (§18.9).

### 18.9 The epic / epic-child contract — amortized discovery

**Motivation.** The eleven-phase pipeline's unit of work is the subtask, but five of its phases — `intake`, `scout`, `research`, `spec`, `approve-spec` — are *feature-scoped*, not subtask-scoped: the codebase slice, the library landscape, and the design do not change between the subtasks of one feature. Running a full `intake-full` per subtask re-pays that discovery tax 3–8× across a decomposed feature (the live exemplar: backlog epic `…-9d4c` carries 8 children, each of which would otherwise re-derive the same `.claude/` slice). The `epic` / `epic-child` track pair amortizes discovery: it runs **once per feature**, and each subtask inherits the result.

**The two tracks.**

- **`epic`** (selectable) — discovery only. Canonical DAG: `intake → scout → research → spec → approve-spec → memory-flush → grant-commit → commit` (per-project review nodes such as `spec-shippability-review` insert before `approve-spec` exactly as they do in `intake-full`). It produces a **sliced spec** at `docs/specs/<epic>.md` (one `## Slice <id>` section per future child, each grouping the ACs that child owns), plus `docs/scout/<epic>.md` and `docs/research/<epic>.md`. It is approved **once** (one `/approve-spec` covers all slices) and commits the discovery bundle **live** — it deliberately omits `archive`, because the discovery is the deliverable of that commit and SHALL remain resolvable at its `docs/` path for children to pin. The epic stays *open* until its children resolve; archival of the whole bundle is an `/epic-close` concern (deferred; not actuated in this revision — children archive only their own slice artifacts).
- **`epic-child`** (selectable) — fast implementation path for one slice. Declared DAG: `tdd → simplify → security → integrate → document → archive → memory-flush → grant-commit → commit`, of which `simplify`, `security`, and `document` are written into `workflow.json → exceptions` **by default** (effective fast path `tdd → integrate → archive → memory-flush → grant-commit → commit`) and escalated into a given child — removed from `exceptions` — only when `/triage` risk-flags the slice (see *Conditional review weight* below). It does **not** re-run any discovery phase; it inherits the epic's. The full chain is declared (not a trimmed DAG) so escalation is a triage-time exception edit, never a TaskList reshape.

Both tracks satisfy I1–I11 as plain Track records. Neither introduces a new schema field or a new predicate — the inheritance lives entirely in runtime `workflow.json` + the epic state file, and is enforced by `track_guard`, not by the Track definition.

**Epic state file.** `/triage`, on materializing an `epic` track, writes `.claude/state/epic/<slug>.json`:

```jsonc
{
  "epic": "<epic-slug>",
  "spec": "docs/specs/<epic>.md",
  "scout": "docs/scout/<epic>.md",
  "research": "docs/research/<epic>.md",
  "slices": [{"id": "A", "title": "<...>", "acs": ["AC-001", "..."], "risk": ["security"]}, ...],
  "approved": false,                 // flipped true by the epic's /approve-spec landing
  "children": [{"slice": "A", "slug": "<child-slug>", "status": "open|committed"}, ...],
  "created_at": <epoch>, "updated_at": <epoch>
}
```

The file is gitignored runtime state (it mirrors `workflow.json`'s lifecycle), not a committed artifact.

**Child inheritance fields.** A child's `workflow.json` carries, beyond the standard shape:

```jsonc
{ "track_id": "epic-child",
  "epic": "<epic-slug>",
  "slice": "A",
  "pinned_artifacts": { "scout": "docs/scout/<epic>.md",
                        "research": "docs/research/<epic>.md",
                        "spec": "docs/specs/<epic>.md#slice-A" },
  "exceptions": ["intake", "scout", "research", "spec", "approve-spec", ...] }
```

`/tdd` for a child reads the **slice** section (`#slice-A`) of the pinned spec as its behavior contract — not a fresh per-child spec.

**Structural enforcement (the load-bearing rule).** The discovery exceptions on an `epic-child` are **not** honored as blanket exceptions. `track_guard` SHALL treat the inherited discovery phases (`intake`, `scout`, `research`, `spec`, `approve-spec`) as satisfied for an `epic-child` write **only when** all of the following hold; otherwise it blocks the write exactly as it would for a forged exception:

1. `workflow.json → track_id == "epic-child"` and `workflow.json → epic` is a non-empty slug;
2. `.claude/state/epic/<epic>.json` exists and parses, with `approved == true`;
3. every path in `workflow.json → pinned_artifacts` resolves on disk (the `#slice-<id>` fragment is stripped before the existence check; the bare spec file SHALL exist).

This makes the child's discovery-skip a *consequence of a real approved epic*, not a claim the child can assert on its own — preserving the constitution's preference for structural enforcement over skill-discipline. A child whose epic is unapproved or whose pins dangle is blocked at the write boundary, with a named reason.

Condition 2 (`approved == true`) is itself write-protected: `epic_approval_guard` (§4.1) allows the `false → true` transition of the epic-state `approved` flag only when the matching persistent `spec_approvals/<epic>.approval` token exists — the forge-proof record of the epic's real gate-A `/approve-spec`. So the flip the harness performs post-gate is no longer trusted SOP discipline alone; a flag set without a genuine approval is refused at the write boundary, and `track_guard`'s read-side check above then rests on a value that could not have been forged via the file-write tools.

**Conditional review weight.** `simplify` / `security` / `document` do not scale with diff size or risk when run unconditionally. For `epic-child` they are excepted by default and escalated by `/triage` into the child's phase list (and out of `exceptions`) when the slice's `risk[]` (recorded in the epic state file at slicing time, derived from the slice's own ACs and write surface) warrants it:

| Phase | Escalated into the child when the slice… |
|---|---|
| `security` | touches auth, an IO boundary, untrusted-input parsing, or a path in `project.json → security.sensitive_globs` |
| `simplify`  | spans more than one architectural layer or more than `project.json → simplify.min_files` files |
| `document`  | changes a public API, a CLI surface, or a committed `*.md` under `docs/` |

The same escalation latitude applies to `tdd-quickfix`: `/triage` MAY except `simplify`/`security` for a demonstrably trivial quickfix using the same table, and the decision is recorded in `workflow.json → exceptions` with a one-line rationale in `completed_notes`. The decision is made once, in main context, from the slice/spec description — never silently inside a phase skill, and never against the diff (which does not yet exist at triage time).

**Triage routing.** `/triage` classification gains three outcomes ahead of the existing single-shot tracks:

- **`epic`** — a multi-subtask feature that warrants discovery-once: the request names ≥ `project.json → epic.min_slices` (default 3) separable slices, or the user frames it as an epic/umbrella. `/triage` runs the `epic` track and writes the epic state file with its slices.
- **`epic-child`** — auto-selected when an `.claude/state/epic/*.json` with `approved == true` is active and the request matches one of its open slices. `/triage` pre-fills `epic`, `slice`, and `pinned_artifacts`, and escalates review phases per the table above.
- **single-shot** — the existing `intake-full` / `spec-entry` / `tdd-quickfix` / `chore` / `freeform` tracks, unchanged, for work that is not part of an epic.

**Wall-clock effect.** A decomposed feature pays discovery **once** (the `epic` track) instead of per child, and each child runs ~4–6 phases (most review phases excepted) instead of ~16. The dominant cost the pair removes is serial latency: the feature's end-to-end time approaches *one* discovery cycle plus the sum of thin child implementations, rather than N full pipelines.

**New cross-references:** `.claude/state/epic/<slug>.json` (epic state), `track_guard` (inherited-satisfaction check), `project.json → epic.min_slices` / `simplify.min_files` / `security.sensitive_globs` (escalation knobs).
