# Claude Code Baseline — In-Session Constitution

This file is the **in-session constitution** for this repository. It binds Claude's behavior — Claude Code, in this codebase, in this session. Every rule below is mandatory unless waived by an explicit `exceptions` entry in `.claude/state/workflow.json` (set only by `/triage`).

**Genesis prompt.** The governing specification of this baseline is `docs/init/seed.md`. It is the genesis prompt for the entire harness. When this constitution and seed.md conflict, **seed.md governs** and you SHALL stop and surface the drift before acting. When this constitution and the implementation conflict, **this constitution governs** and the implementation SHALL be corrected.

**Enforcement.** The 22 hooks in `.claude/hooks/` are the structural enforcement layer of this constitution. Each is mapped to the Article it enforces in **Article VIII**.

---

## Article I — Authority and precedence

1. **Genesis** — `docs/init/seed.md` is the source of truth for the baseline's shape, components, and rebuild protocol.
2. **Constitution** — `CLAUDE.md` (this file) is the source of truth for Claude's in-session behavior in this repository.
3. **Implementation** — the hooks, skills, commands, subagent, MCP servers, and config files are the actuators and enforcement mechanisms of (1) and (2).
4. **Order of precedence** — `seed.md` > `CLAUDE.md` > implementation. Lower binds higher only via amendment in seed.md, which then propagates to this file, then to disk.
5. **Project amendments** — Article X reserves space for project-owner amendments. Amendments bind alongside Articles I–IX but **SHALL NOT** contradict them.

## Article II — Architectural principle

**Decisions live in main context. Subagents only execute pre-decided recipes in parallel or in the background.**

The baseline ships exactly **one** subagent: `swarm-worker`. Its sole sanctioned use is to run `Skill(scenario)` then `Skill(implement)` against a fully-specified recipe inside an isolated git worktree during `/swarm-dispatch`. The worker SHALL NOT make design choices, pick abstractions, or expand scope. It SHALL NOT be invoked outside `/swarm-dispatch`.

Every other capability — code authoring, scenario authoring, scouting, researching, security review, spec review, prose writing, UI design — is a **skill** that runs in main context. Five execution skills mandatorily invoke a sub-skill:

| Skill | Mandatory sub-skill | Conditional |
|---|---|---|
| `scenario` | `code-structure` | — |
| `implement` | `code-structure` | `context7` MCP for any third-party API |
| `verify` | — (mechanical) | — |
| `design-ui` | `impeccable` | — |
| `prose` | `humanizer` (always) | `copywriting` / `documentation` / `technical-tutorials` by register |

You SHALL NOT route conversational judgment (UI nuance, design tone, code architecture, security calls, scenario selection) through a subagent. Those decisions depend on context the conversation carries; a subagent only sees a Task brief and produces visibly worse output.

## Article III — Session-start procedure (MANDATORY)

On every new session, before any work, you SHALL:

1. **Read** `.claude/project.json` and check the `configured` field.
2. **If `configured: false`** — `/init-project` has not run. The repository is in a sanctioned operating state called **project-agnostic mode**: hooks are active but `test_runner` and `lint_runner` run in guide mode and nothing is tailored to the user's stack. You SHALL greet the user with this exact framing:
   > "This repo has the Claude Code baseline installed (22 hooks, 1 subagent, 40 skills). It's in **project-agnostic mode** — `test_runner` and `lint_runner` are in guide mode and nothing is tailored to your stack. Run **`/init-project`** to scout the codebase, run the recommender, and generate a config. Skip it if you want baseline-only behavior, but you'll miss stack-specific tailoring."
   You SHALL then proceed with whatever the user asks. Project-agnostic mode is **allowed** — the user is not required to run `/init-project` to use the baseline. The `setup_guard` hook surfaces a one-shot reminder on Write/Edit/MultiEdit (rate-limited to 10 minutes); it does **not** block writes. Other guards (commit, env, spec-approval, verify-pass, track, swarm-boundary) remain hard regardless of `configured` state.
3. **If `configured: true`** — read `docs/init/seed.md` §16 if present so you know what was added. Tell the user:
   > "Configured for `<stack>`. Run `/triage \"<request>\"` to start a workflow, or `/harness` for the full pipeline."
4. **Memory check.** The `memory_session_start` hook injects a memory index into your additional context. The hook emits a **debt-mode nag** only when `_pending.md` has unflushed candidates AND no active workflow on disk (i.e., `.claude/state/workflow.json` is absent) — those candidates are debt from a prior workflow that didn't end-flush. During an active workflow, **Phase 10.6** (memory-flush, between archive and grant-commit) handles flushing automatically; the session-start nag stays silent. You SHALL run `/memory-flush` when the debt-mode nag fires, before starting new work.
5. **Git-repo check.** Run `git rev-parse --is-inside-work-tree 2>/dev/null` at the project root. If non-zero (not a git repo), surface this once per session and tell the user that gate C and the `commit` phase will be auto-excepted; the workflow ends after `/archive`. This is a sanctioned operating mode — Article IV phase 11 and Article VII are git-conditional.
6. Once per session is sufficient. You SHALL NOT repeat the greeting on every prompt.

## Article IV — Workflow ordering (MANDATORY)

The 11-phase workflow is the only sanctioned path from request to commit. Phase ordering is enforced at the Write boundary by `track_guard` (Art. VIII).

| # | Phase | Invocation | Output |
|---|---|---|---|
| 1 | Intake | `/intake` (optionally `/brd`) | `docs/intake/<slug>.md` |
| 2 | Scout | `/scout` | `docs/scout/<slug>.md` |
| 3 | Research | `/research` | `docs/research/<slug>.md` |
| 4 | Spec | `/spec` (+ `/spec-lint`, `/spec-render`, reviews) | `docs/specs/<slug>.md` |
| 5 | **Approve spec** (gate A) | user runs **`/approve-spec <path>`** | approval token |
| 6 | TDD (solo) | `/tdd` | code |
| 6a | TDD (swarm) | `/swarm-plan` | `.claude/state/swarm/<slug>.json` |
| 6b | **Approve swarm** (gate B) | user runs **`/approve-swarm <slug>`** | approval token |
| 6c | Swarm dispatch | `/swarm-dispatch` | code (parallel waves) |
| 7 | Simplify | `/simplify` | clean diff |
| 8 | Security (optional) | `/security` | `docs/security/<slug>-<date>.md` |
| 9 | Integrate | `/integrate` | binding verify verdict |
| 10 | Document | `/document` | docs |
| 10.5 | Archive | `/archive` | bundle at `docs/archive/<date>/<slug>/` |
| 10.6 | Memory flush | `/memory-flush` | curated canonical memory + reset `_pending.md` |
| 11 | **Grant commit** (gate C) + changelog + commit | user runs **`/grant-commit`**, then `/changelog` (skill, sub-step 11.5), then `/commit` (skill) | commit |
| 11.5 | Changelog (Phase 11 sub-step) | `/changelog` (skill); harness auto-invokes between gate C and `/commit` | `CHANGELOG.md` `## [Unreleased]` section grows + `.claude/state/changelog/<slug>.json` |

**Mandatory rules:**

- You SHALL NOT skip phases.
- You SHALL NOT reorder phases.
- The only mechanism to bypass a phase is the `exceptions` array in `.claude/state/workflow.json`, written by `/triage`.
- **Phase 6c and Phase 11 are git-conditional.** On a project where `git rev-parse --is-inside-work-tree` exits non-zero (no `.git/`, not inside a work tree), `/triage` SHALL auto-add `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, and `commit` to `exceptions`. Phase 6 routes to solo `/tdd` unconditionally; the workflow ends after `/archive`. Worktree isolation (the swarm contract's physical safety mechanism) requires git; `swarm.isolation: "shared"` is a sanctioned configuration knob for git projects that opt out of worktrees but does NOT restore the cross-task write isolation the swarm-worker assumes — it is unsafe as a non-git fallback, especially when `swarm.exempt_path_prefixes` covers baseline-internal paths (e.g. `.claude/`). Persistence outside git is the user's responsibility. See Article VII for the matching rule on git operations.
- The three consent gates (A, B, C) are **commands**, not skills. They are structurally un-invokable by Claude. You SHALL NOT self-approve.
- **How the gates are structurally enforced.** Each consent command (`/approve-spec`, `/approve-swarm`, `/grant-commit`, `/grant-push`) is a slash command typed by the user. The `consent_gate_grant` UserPromptSubmit hook (Art. VIII) parses the user's prompt **before Claude is invoked** and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) then allows Claude's slash-command-body write of the approval token only when the marker is present, fresh (≤ `consent.gate_marker_ttl_seconds`, default 120), and slug-matched; the marker is single-use and deleted on the allowed write. `/grant-push` is **not** a workflow-phase gate — it is a Bash-time consent for push to a protected branch (see Article VII). Slug derivation is centralized in `lib/common.mjs → canonicalSlug` (strip directory prefix + trailing `.md`) so the marker and the expected slug always agree, whether the user typed a bare slug, a filename, or a full path. The same guards block Claude from writing the marker file itself via Write/Edit/MultiEdit. Claude cannot reach the UserPromptSubmit code path, so it cannot forge consent.
- **Out-of-band**: `/rca` produces an incident postmortem at `docs/rca/<slug>.md`. It is not a workflow phase and often precedes a bugfix intake.

**Entry points** (`/triage` writes `workflow.json` with `entry_phase` and `exceptions`):

- New feature → `/triage` selects `intake`.
- Bugfix → `/triage` selects `spec` or `tdd`.
- Quickfix → `/triage` selects `tdd`.
- Chore → `/triage` selects the `chore` track when the request needs **no failing-test-driven code change** (documentation edits, governance count bumps, vendored-skill content updates, configuration tweaks, formatting, typo fixes, dependency bumps without project code, skill consolidations). The chore skill skips `/scenario` and `/implement`, runs the edits directly, then conditionally routes through `simplify` / `integrate` / `document` based on what the diff touches. `verify`, `archive`, and `/grant-commit` + `/commit` remain mandatory. Anything that actually needs a failing test routes to `tdd` or higher.
- Freeform → `/triage` selects the `freeform` track for ad-hoc batches of edits that don't fit any other track — optimization sessions across multiple unrelated landmines, exploratory cleanup, small drive-by fixes. Phase ordering is relaxed by blanket exceptions on every pre-commit phase (`intake`, `brd`, `scout`, `research`, `spec`, `review`, `tdd`, `simplify`, `security`, `integrate`, `document`, `archive`); the DAG carries only the closing sequence `memory-flush` → `/grant-commit` → `/changelog` → `/commit`. All 22 hooks remain active — `destructive_cmd_guard`, `env_guard`, `git_commit_guard`, `tdd_order_guard` (still blocks new source files without paired tests), `verify_pass_guard`, and the consent gates fire normally. Use freeform when the work is genuinely heterogeneous and a per-fix workflow would be more ceremony than the work warrants; anything single-purpose with a clear failing-test path SHALL route to `tdd` or higher.

**Swarm vs solo at Phase 6.** When the approved spec has fewer than `project.json → swarm.min_tasks_worth_swarming` (default 3) independent components **OR** the project is not a git repository, run `/tdd` solo. Otherwise route through `/swarm-plan` → `/approve-swarm` → `/swarm-dispatch`. In non-git projects the swarm phases are excepted at triage time (see the "Phase 6c and Phase 11 are git-conditional" bullet above), so this decision always resolves to solo — the rule's first clause never fires on a non-git tree, and a user "use swarm" override SHALL be refused with the reason `swarm requires git`.

**Post-§18 amendment (2026-05-21).** Workflow track definitions live in `.claude/workflows.jsonl` per `docs/init/seed.md §18`. The phase-ordering rules and entry-point classifications above remain binding; every Track declared in `workflows.jsonl` SHALL satisfy them plus the additional invariants in seed.md §18.3 (I1..I11). `/triage` reads `workflows.jsonl`, validates each Track against §18, classifies the user's request via LLM reasoning over `name + description + selector_hints`, confirms via `AskUserQuestion`, and materializes the chosen Track's DAG into the TaskList (via `src/cli/track-tasklist-materializer.js`). The 4 canonical tracks shipped in the pristine template are byte-equivalent to this Article's hardcoded templates per spec AC-016. The harness migrates pre-§18 `workflow.json` files (carrying `entry_phase` + no `track_id`) one-shot at preflight via `src/cli/workflow-migrator.js`. `/init-project doctor` (sub-command) detects schema / invariant / mirror drift and offers interactive fixes.

## Article V — Harness orchestration (MANDATORY SOP)

`/harness` is invokable by both the user (via the slash command) and the model (via `Skill(harness)`). A single `Skill(harness)` invocation **loops internally through every non-gated phase boundary** until the loop hits one of four exit conditions: consent gate, phase-skill failure, integrate-failure-needs-spec-change, or workflow done. The user invokes `/harness` to start a fresh workflow or to resume after a yield. You SHALL suggest `/harness` when a concrete engineering ask crystallizes in conversation; the user decides when to invoke it.

**Operational SOP lives in `.claude/skills/harness/SKILL.md`** — preflight, marker-first state writes, loop body iteration, safety-net interaction with `harness_continuation`, resume-after-yield mechanics, and task discipline. This Article declares the constitutional invariants the SOP must satisfy:

- The loop SHALL exit on one of four conditions: consent gate (yield), phase-skill failure (yield), integrate-failure-needs-spec-change (yield), or workflow done.
- You SHALL NOT self-approve at any consent gate. You SHALL NOT simulate approval. You SHALL NOT write approval tokens directly.
- Every successful phase invocation SHALL `TaskUpdate` to `completed`, append the phase name to `workflow.json → completed`, and refresh marker + `harness_state` (marker FIRST) before continuing.
- `workflow.json → completed` is the durable truth across sessions; the TaskList is session-bound. When they disagree, trust `workflow.json` and re-seed.
- The `harness_continuation` Stop hook is a safety net, not the primary driver. A healthy `Skill(harness)` invocation runs to a clean exit on its own; the hook re-fires only when the loop was interrupted mid-flow with `state: "continue"` + marker present.

**Integrate-failure decision tree.** When `/integrate` fails inside the loop, you SHALL classify:

- **Mechanical bug** → auto-loop to `/tdd` **in-place** (re-invoke `Skill(tdd)` then `Skill(integrate)` inside the same loop iteration; no Stop-hook hop, no new user `/harness` invocation). Capped at 3 retries within one iteration. Indicators: failing tests target spec-defined behavior; failure is localized; fix is mechanical.
- **Spec change required** → EXIT LOOP with YIELD (`reason: "integrate failed: needs spec change"`) and surface to the user. Indicators (any one is sufficient): test expects un-spec'd behavior; two ACs contradict; failure reveals an un-spec'd component; swarm waves show cross-wave coupling the spec missed.

You SHALL NOT silently relax the integrate criteria, mark a failing integrate as passed, or bypass the verify verdict.

## Article VI — Engineering rules (NON-NEGOTIABLE)

The following bind every code change.

### VI.1 No stubs — ever
- Every declared function SHALL be fully implemented with production logic.
- If the implementation is unknown, you SHALL NOT declare the function. Write the spec first.

### VI.2 Always production code
- Every line: errors handled, inputs validated, resources cleaned up.
- You SHALL NOT write `TODO`, `FIXME`, `HACK`, or `XXX` in source.
- You SHALL NOT leave commented-out code. If it is removed, it is deleted.

### VI.3 No mocks of internal code
- You SHALL NEVER mock internal project modules. If an internal dep is hard to test, the design is wrong — fix the design.
- You SHALL NEVER mock the database. Use a real test DB.
- You SHALL NEVER mock gRPC channels or stubs.
- Acceptable mock targets, exhaustively: third-party HTTP APIs that cannot run locally; system clock; OS randomness.
- Every mock SHALL carry a `# MOCK: <reason>` comment.

### VI.4 YAGNI
- You SHALL NOT add params, flags, or abstractions for hypothetical future use.
- Reuse libraries for what they already do.
- Abstract at the third concrete use case, not before.
- Code without a test exercising it SHALL NOT exist.

### VI.5 Context7 for third-party APIs
- For ANY third-party library, you SHALL invoke the `context7` MCP before writing code that uses it.
- Prefix: `use context7 to find the current API for [library] [version]`.
- You SHALL NOT recall an API from training data for external libraries.
- `context7` is declared in `.mcp.json` so the capability travels with the repo.

### VI.6 Code structure
- Every code-generation step SHALL invoke the `code-structure` skill.
- It enforces the Orchestration / Domain / Foundation layer model, consistent abstraction levels, and reuse-before-create.
- Applies to every language. Mappings ship inside the skill.

## Article VII — Git rules

**Applicability.** Article VII applies only when the project is a git repository (`git rev-parse --is-inside-work-tree` exits 0 at the project root). On a non-git project, this Article is vacuously satisfied: you SHALL NOT attempt any git operation, gate C and the `commit` phase are auto-excepted at triage time (Art. IV), and the workflow ends after `/archive`. The rules below bind only inside the git-repository case.

**Branch-aware consent policy.** Consent enforcement for `git commit` and `git push` is driven by two `project.json` knobs:

- `git.protected_branches` — glob list. `null` (default) means every branch is protected. Set e.g. `["main", "release/*"]` to limit consent enforcement to those branches.
- `git.branch_pattern` — regex. `null` (default) means no naming check. Set e.g. `"^(feat|fix|chore|docs)/[a-z0-9-]+$"` to require conformant branch names on commit.

On a **protected branch**, commits require a fresh `commit_consent` token (written by `/grant-commit`, 5-min TTL) and pushes require a fresh `push_consent` token (written by `/grant-push`, 5-min TTL) — both gated by the user having explicitly asked for the operation in their current request. On a non-protected branch, commits and pushes proceed without consent. `git_commit_guard` (Art. VIII) is the enforcer.

**Detached HEAD.** When the current branch resolves to the literal string `HEAD` (detached state), the guard denies both commit and push with an explicit message. Check out a named branch before attempting either — branch-aware policy needs a named branch to evaluate `git.protected_branches` and `git.branch_pattern`.

**Hard-blocks regardless of consent, branch, or user request.** These operations rewrite history, skip safety, or sweep paths; `git_commit_guard`'s `FORBIDDEN_RE` blocks them flat-out:

- `git commit --amend` — always create a new commit.
- `--no-verify`, `--no-gpg-sign`, or any flag that skips hooks/signing.
- `git reset --hard`, `git clean -f`, `git checkout --`, `git branch -D`.
- `git config` changes.
- `git rebase -i`, `git add -i` (interactive).
- `git add -A`, `git add .` — name the paths.

`git push` is no longer in this set — it is governed by the branch-aware policy above. `git push --force` and `--force-with-lease` are still forbidden unless the user names the exact operation in their current request, AND additionally subject to the branch-aware policy (force-push to a protected branch requires fresh `push_consent` plus the user-named carve-out).

## Article VIII — Hooks (the enforcement layer)

The 22 hooks in `.claude/hooks/` are the structural enforcement of this constitution. Modifying, disabling, or bypassing a hook requires explicit user approval and a corresponding amendment in `seed.md` §4.1.

| Hook | Event | Article enforced | Behavior |
|---|---|---|---|
| `setup_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. III | Advisory reminder when `configured: false` (rate-limited 10 min). Does **not** block. |
| `destructive_cmd_guard` | PreToolUse / Bash | Art. VII | Hard-block catastrophic commands; ask risky |
| `git_commit_guard` | PreToolUse / Bash + Edit\|Write\|MultiEdit | Art. IV gate C, Art. VII | Bash: enforce branch-aware policy — `git commit` on a protected branch requires fresh `commit_consent`; `git push` on a protected branch requires fresh `push_consent`; both proceed without consent on non-protected branches; off-`branch_pattern` branches deny commits; detached HEAD denies both. Hard-block remaining forbidden flags (--amend, --no-verify, reset --hard, etc.). Write: gate writes to `.claude/state/{commit,push}_consent` and the matching `.{commit,push}_consent_grant` markers. |
| `env_guard` | PreToolUse / Edit\|Write\|MultiEdit\|NotebookEdit | Art. VII | Block writes to `.env*` (allows `.env.example`) |
| `spec_approval_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV gate A | Validate fresh `.spec_approval_grant` marker before allowing approval-token writes; block self-approval inside spec markdown; block direct writes to the marker |
| `swarm_approval_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV gate B | Validate fresh `.swarm_approval_grant` marker before allowing swarm-approval writes; block direct writes to the marker |
| `verify_pass_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. V, VI | Block writing PASS to verify artifacts when truth source says FAIL |
| `track_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV | Enforce 11-phase ordering for workflow artifacts |
| `artifact_template_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV | Block artifact writes missing required `##` sections |
| `plantuml_syntax_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV phase 4 | Validate PlantUML fences in `docs/specs/*.md` |
| `spec_diagram_presence_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV phase 4 | Block specs missing required diagram kinds |
| `spec_design_calls_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. X.2 | Block specs whose `write_set` intersects `tdd.ui_globs` from omitting a populated `## Design calls` section |
| `swarm_boundary_guard` | PreToolUse / Edit\|Write\|MultiEdit | Art. IV phase 6c | Enforce write_set discipline in shared isolation mode |
| `tdd_order_guard` | PreToolUse / Write | Art. VI.4 | Require test before new source file |
| `process_lifecycle_guard` | PreToolUse / Bash | Art. IX | Advisory. Surfaces `landmines.md → lsof-port-kill-takes-firefox-with-it` and `conventions.md → dev-server-ownership` (verbatim + interpretation) before any kill/lsof/serve Bash. Never blocks |
| `lint_runner` | PostToolUse / Edit\|Write\|MultiEdit | Art. VI | Run `lint.cmd` on code changes (guide mode until configured) |
| `test_runner` | PostToolUse / Edit\|Write\|MultiEdit | Art. VI | Run `test.cmd` on code changes (guide mode until configured) |
| `memory_session_start` | SessionStart | Art. III, IX | Inject memory index + resume snapshot at session start |
| `memory_stop` | Stop | Art. IX | Auto-extract memory candidates each turn-end |
| `harness_continuation` | Stop | Art. V | Three-rung gate: (1) `stop_hook_active` absent on payload; (2) `.claude/state/.harness_active` exists (session-scoped marker created by the harness skill on `continue`, deleted on `yielded`/`done`, cleaned by `memory_session_start.mjs` on session boundary); (3) `harness_state.state == "continue"`. When all three pass, emits `{"decision":"block","reason":"…invoke Skill(harness)…"}`. Sanity rail: marker-slug-vs-`workflow.json`-slug mismatch logs WARN to `harness_continuation.log` without changing the decision. Silent on any rung fail. Never writes consent markers. |
| `memory_pre_compact` | PreCompact | Art. IX | Capture resume snapshot before context compaction |
| `consent_gate_grant` | UserPromptSubmit | Art. IV gates A/B/C, Art. VII | Detect `/approve-spec`/`/approve-swarm`/`/grant-commit`/`/grant-push` in user input and write the gate-specific consent marker — runs OUTSIDE Claude's tool boundary so Claude cannot forge it |

## Article IX — Project memory

The memory system at `.claude/memory/` accumulates project facts across sessions. You SHALL:

1. Treat the seven canonical files (`landmarks.md`, `libraries.md`, `decisions.md`, `landmines.md`, `conventions.md`, `pending-questions.md`, `backlog.md`) as long-term project memory. Each entry has a stable key per the schema in `.claude/memory/README.md`.
2. **Re-verify before citing.** Every skill that cites a memory entry SHALL re-verify it (file exists, symbol still at named line, library version still pinned). Failed verification → you SHALL correct or delete the entry in the same run before proceeding.
3. Treat `_pending.md` as the auto-extraction inbox (written by `memory_stop`). Promote candidates to canonical files only via `/memory-flush`. You SHALL NOT write directly into canonical memory files outside the natural byproduct of phase skills.
4. Treat `_resume.md` as the cross-session continuity snapshot (refreshed every turn-end and before compaction). It is **session memory**, not project memory.
5. Respect `size-cap: 500` per canonical file. When a write exceeds the cap, prune the oldest unverified entries in the same write. Entries unverified for ≥ 30 commits or ≥ 90 days are stale; the next phase that touches them either re-verifies or deletes.
6. **Preserve verbatim.** Memory entries with `source: user-instruction` or `source: user-feedback` SHALL include a `verbatim:` blockquote of the user's actual words. The verbatim is canonical; the entry body is Claude's interpretation. When verbatim and interpretation conflict, **verbatim wins**, and you SHALL surface the conflict to the user before acting on the interpretation. `/memory-flush` SHALL reject promotions to canonical files that lack a required verbatim. Schema: `.claude/memory/README.md → Source provenance`.
7. **Respect advisory memory hooks.** Advisory PreToolUse hooks (e.g., `process_lifecycle_guard`) surface relevant memory entries inline before matching tool calls. You SHALL read the surfaced verbatim before executing the matched command, and SHALL treat it as binding for the current operation.

Memory accelerates triage. It NEVER authorizes a skip.

## Article X — Project-specific rules

Reserved for project-owner amendments. Rules below the boundary line bind alongside Articles I–IX but SHALL NOT contradict them. Amendments to Articles I–IX require an edit to `docs/init/seed.md` first per the precedence rule (Art. I.4).

---

### X.1 Copy register and skill overrides

The `impeccable` skill (Apache 2.0, vendored) declares a set of "Shared design laws" with absolute bans, including:

- No em dashes (`—`, or `--` as a substitute).
- The hero-metric template.
- Glassmorphism as default, gradient text, side-stripe borders > 1px, modal-first thinking, identical card grids.

These bans bind **only on user-facing copy** — surfaces a public reader sees as rendered marketing or product prose:

| Scope | Bans apply? | Examples |
|---|---|---|
| User-facing copy | YES | `site-src/**/*.njk`, `site-src/_data/site.json` user-visible strings, marketing emails, the rendered docs site |
| Internal governance | NO | `CLAUDE.md`, `docs/init/seed.md`, `PRODUCT.md`, `DESIGN.md` |
| Project source documents | NO | `README.md`, `bin/cli.js` help/error text, `.claude/skills/*/SKILL.md` |
| Memory bodies | NO | `.claude/memory/*.md` entries |
| Inline code / data samples | NO | `<code>` / `<pre>` blocks that quote literal data, CLI output, or canonical entry shapes |

The constitutional voice in scoped-OUT surfaces uses em dashes deliberately. Audits run by `impeccable` (and any future register-aware critique skill) SHALL apply the bans only within the scoped-IN surfaces.

This override does **not** delete bans from the impeccable skill; it scopes them. Other shared design laws (color strategy, theme commitment, typography hierarchy, motion vocabulary, accessibility floor) remain in force everywhere Claude generates UI.

Future "impeccable says X, but we ship Y on purpose" decisions get a row in the same table without re-amending the constitution. Examples already in flight: the meta-strip on the landing (qualified in PRODUCT.md anti-references as "structural counts naming load-bearing components"), and this em-dash scoping. New rows SHALL cite the impeccable rule being scoped, the scope decision, and a one-line rationale.

---

### X.2 Design-task routing

Every UI design task that originates inside a workflow phase SHALL route through the `design-ui` skill, and `design-ui` SHALL invoke the vendored `impeccable` skill for the underlying design move. This binds design / development / copy as separate concerns: design lives behind `design-ui`; development is the rest of `/tdd`; copy is governed by Article X.1 plus the `prose` skill's register choice. The three lanes may touch the same file for different concerns; they SHALL NOT substitute for one another.

| Rule | Binding |
|---|---|
| A spec whose `write_set` intersects `project.json → tdd.ui_globs` SHALL declare a populated `## Design calls` section, one row per design surface. | `spec_design_calls_guard` (Art. VIII) at the Write boundary; `/spec-lint` at preflight. |
| `/tdd` Step 6 SHALL invoke `Skill(design-ui, task_brief)` once per `## Design calls` row before Step 7 (verify). | `tdd` skill SOP. |
| `design-ui` SHALL NOT write product code. Its only writes are the state file at `.claude/state/design/<slug>.json`, snapshots under `docs/design/<slug>.*.md`, and memory candidates. The product-code writes happen inside `impeccable` invocations. | `design-ui` SKILL.md. |
| `design-ui` SHALL classify incoming intents at Stage 0 (design / development / copy). A misrouted intent returns one of two terminal states: `final_state: "not_a_design_task"` (single-lane misroute) with `correct_lane`, OR `final_state: "mixed_brief"` (multi-lane misroute) with a structured `lane_split` array. Neither writes code. | `design-ui` Stage 0 + `references/design-vs-development.md`. |
| Iteration cap: `audit → polish` loops SHALL terminate after 3 iterations with `final_state: "needs_human"` if P0 ≥ 1 or P1 > 0 persist. P0 issues block (do not loop). | `design-ui` SKILL.md + `references/orchestration.md`. |
| Multi-step impeccable recipes SHALL ask the user before proceeding. Single-step recipes SHALL auto-execute. | `references/intent-table.md` `mode` column. |

The vendored `impeccable` skill stays untouched (Article IX). `design-ui` is the structural seam between workflow phases and `impeccable`; bypassing it inside a workflow phase is a violation of this Article.

---

### X.3 Entry-phase brainstorm (PM mode)

Every workflow entry phase (`/intake`, `/spec`, `/tdd`) SHALL invoke `Skill(brainstorm)` as Step 0.5 before opening its template, unless `.claude/state/workflow.json → skip_brainstorm` is `true`. The brainstorm helper captures the requirement via Socratic dialogue (actor, trigger, current state, desired state, non-goals, solution-leakage detection) and writes the result to `docs/brief/<slug>.md`. The entry skill reads that brief as primary input for template-fill.

| Rule | Binding |
|---|---|
| `workflow.json → skip_brainstorm` defaults to `false` when absent. Read-time defaults via `.claude/skills/brainstorm/workflow-defaults.mjs → withDefaults`. | `brainstorm/SKILL.md` Stage 0 contract; AC-008. |
| Stage 2 dialogue SHALL NOT propose solutions. Discipline is structurally enforced by `.claude/skills/brainstorm/discipline.mjs → scanTurn(text)`, which scans every model-emitted probe for solution verbs (`implement`, `refactor`, `add X`), library names (Redis, PostgreSQL, etc.), and proposal phrasing (`we could`, `I recommend`). | `brainstorm/references/interview-protocol.md`; AC-003. |
| Stage 2 iteration cap is 5; unclosed gaps become `open_questions` in the brief. Stage 3 confirm-cycle cap is 5; exhaustion returns `final_state: "needs_human"`. | `brainstorm/probe-loop.mjs`; AC-004 boundary. |
| `/intake` re-invocation on a slug whose `docs/brief/<slug>.md` already exists SHALL short-circuit and read the existing brief; no re-dialogue. | `brainstorm/skip-check.mjs → shouldSkipForExistingBrief`. |
| `chore` and `freeform` tracks do NOT have an entry-skill seam where brainstorm can fire; the helper is silent on those tracks by construction. | Article IV phase ordering. |

The opt-out flag is set at `/triage` time by the user passing `--no-brainstorm` in the request string, or detected heuristically when the request already contains a complete actor + trigger + desired-state framing. Memory: `flag-parser.mjs` does the literal flag match; the heuristic is a judgement call surfaced via `AskUserQuestion`. AC-010 governs the parsing.

`Skill(brainstorm)` runs in main context per Article II — no subagent delegation. Decisions about which gap to probe next, how to phrase a probe, and when the requirement is captured all live in main context with full conversation visibility. The Stage 2 discipline assertor is the only programmatic gate.

---

### X.4 `/spec` codesign mode (Engineer mode)

`/spec` Step 1.5 SHALL run a codesign decision-capture flow when `.claude/state/workflow.json → codesign_mode` is `true`. The codesign mode identifies load-bearing technical decision points (where engineer domain expertise is the deciding factor — computer vision approach, model architecture, numerical method, IPC pattern, kernel scheduling), presents each with Claude's recommended option and rationale, and captures the engineer's response (approve / suggest alternative / discuss tradeoff) via `AskUserQuestion`. The engineer's verbatim rationale becomes canonical when they override Claude's recommendation.

| Rule | Binding |
|---|---|
| `workflow.json → codesign_mode` defaults to `false` when absent (opt-in). Set true by `/triage --codesign` or by manual edit. | `spec/SKILL.md` Step 1.5 contract; AC-008. |
| Decision-point detection runs via `.claude/skills/spec/decision-finder.mjs → findDecisionPoints({researchMemo, scoutReport})`. A research memo with ≥2 candidates carrying comparable tradeoffs surfaces as ≥1 decision point. | AC-005. |
| Per decision: Claude proposes the recommended option + 1–3 sentence rationale + `AskUserQuestion` (Approve / Suggest alternative / Discuss tradeoff). On `Suggest alternative`, capture the engineer's verbatim rationale via free-form turn. | AC-005 + AC-006 §Behavior #4. |
| The spec's `## Decisions` section SHALL render engineer verbatim as a `>` markdown blockquote, with chosen-option recorded as the engineer's pick (NOT Claude's recommendation when they diverge). | `decisions-writer.mjs → writeDecisionsSection`; AC-006. |
| `spec-lint` Check #4 fires when `codesign_mode: true` AND the saved spec lacks a `## Decisions` heading. Check #4 is suppressed entirely when `codesign_mode: false`. | `spec-lint/lint.mjs:checkCodesignDecisions`; AC-005 contract. |
| On `/integrate` failure classified as "needs spec change" with `codesign_mode: true`, `harness/codesign-reentry.mjs → writeRevisitContext` appends a revisit_context to `.claude/state/codesign/<slug>.json`. Next `/harness` re-invocation reads the context and re-enters codesign on the named decision. | AC-007; Article V integrate-failure decision tree. |
| Codesign decision revisit cap is 3 per decision point. The 4th revisit attempt terminates with `final_state: "needs_human"`. Hardcoded in `codesign-state.mjs → REVISIT_CAP`, parallel to design-ui's 3-iteration audit-polish cap. | AC-007 boundary. |

Codesign mode is opt-in because most workflows do not need it. The fixed keyword list for `/triage`'s heuristic suggestion includes `computer vision`, `model architecture`, `numerical`, `cryptographic`, `consensus`, `realtime`, `kernel`, `distributed`, `algorithm design` — triggers a confirmation `AskUserQuestion`, never auto-sets. Memory: `/research` writes a memo-only codesign recommendation when no candidate dominates on tradeoffs; user opts in via subsequent `/triage --codesign` or manual `workflow.json` edit. Article II precludes `/research` from auto-flipping flow state.

---

## Article XI — Skill provenance and the baseline manifest

A skill at `.claude/skills/<slug>/SKILL.md` is **baseline-owned** iff its YAML frontmatter declares `owner: baseline`. Every other skill on disk — those without an `owner:` field, or those declaring `owner: user` — is user/third-party and out-of-scope of baseline audit checks. Absence-of-`owner` is the deliberate default so a project with pre-existing skills can install the baseline without annotating any of its own files. The build script `scripts/build-manifest.mjs` reads each `owner:` value and emits the canonical baseline-skill set into the shipped manifest at `obj/template/.claude/manifest.json` under `owners.skills` (a JSON object mapping slug → `"baseline"`). The recursive install copies the manifest straight to `<target>/.claude/manifest.json` (same path inside the `.claude/` subtree, no special-case). The CLI separately writes `<target>/.claude/.baseline-manifest.json` post-install as a runtime sha256 table of the target's actual on-disk contents (used by `doctor` and `upgrade`). The audit at `.claude/skills/audit-baseline/audit.mjs` consumes `manifest.owners.skills` from the shipped `.claude/manifest.json` as the canonical baseline-skill enumeration — the previous hard-coded `EXPECTED_SKILLS` set is removed.

You SHALL:

1. **Declare baseline ownership only.** A SKILL.md that ships in the baseline SHALL declare `owner: baseline` in its frontmatter directly after `name:`. Authoring a user/third-party skill does NOT require any `owner:` annotation — absence is the default. Explicit `owner: user` is permitted but never required. The only frontmatter-related FAIL the audit emits is `invalid owner=<value>` (a present-but-malformed `owner:` field, e.g. typo). Missing-`owner:` is silently skipped.
2. **Trust the manifest.** The shipped manifest at `obj/template/.claude/manifest.json` (delivered to `<target>/.claude/manifest.json` by the recursive install copy) is the canonical record of baseline-owned skills and their content hashes. The runtime `<target>/.claude/.baseline-manifest.json` written by the CLI post-install is a separate file that captures the target's actual on-disk hashes for `doctor`/`upgrade` — do not conflate the two. You SHALL NOT maintain a separate hard-coded list of baseline-skill slugs anywhere in the codebase.
3. **Re-derive on drift.** The audit reads the manifest from `<root>/.claude/manifest.json` (consumer projects) with a fallback to `<root>/obj/template/.claude/manifest.json` (the baseline dev repo). It re-derives sha256 hashes from `manifest.files` for every path under `.claude/skills/<slug>/` whose slug appears in `owners.skills`, and compares against on-disk content. Mismatches surface as `hash mismatch at <path>`. A baseline-listed slug missing from disk surfaces as `baseline skill missing`. These are hard FAIL — drift detection has no opt-out.
4. **Preserve constitutional citation.** This Article XI SHALL remain in CLAUDE.md AND in `src/CLAUDE.template.md` (byte-equal mirror). The genesis §17 in `docs/init/seed.md` SHALL remain present, with `src/seed.template.md` mirroring it. The audit verifies both citations and reports `CLAUDE.md missing Article XI citation` or `seed.md missing §17 citation` on absence.
5. **Out-of-scope skills don't break the audit.** Any skill on disk that doesn't declare `owner: baseline` is out-of-scope: excluded from the baseline count, the names-match check, and the hash-drift check. Installing the baseline into a project that already has its own skills is zero-friction — no per-file annotation required. Maintenance of those skills is the user's responsibility.

Cryptographic supply-chain attestation, signed lock files, and per-skill aggregate merkle hashes are non-goals. The per-file `manifest.files` map already covers every file in every skill directory. A future `npx @friedbotstudio/create-baseline upgrade` subcommand will consume `manifest.owners.skills` + `manifest.files` to re-overlay baseline-owned files safely while leaving user-added or locally-customized files untouched — that subcommand is out of scope of this Article.

---

## Appendix A — Where things live (reference)

| Path | Role |
|---|---|
| `.claude/hooks/` | 22 hook scripts (17 write/run-boundary + 4 lifecycle + 1 input-boundary). Node ESM (.mjs), no jq. |
| `.claude/agents/` | 1 baseline subagent: `swarm-worker` (rendered from `src/agents/swarm-worker.template.md`) |
| `.claude/skills/` | 40 skills: artifact (4) + phases (11) + workers (5) + spec helpers (4) + orchestration (3) + memory (1) + navigation (1) + phase helpers (1) + shared globals (7) + audit (1) + alt tracks (1) + maintenance (1) |
| `.claude/commands/` | 5 consent/bootstrap gates: `approve-spec`, `approve-swarm`, `grant-commit`, `grant-push`, `init-project` |
| `.claude/memory/` | 7 canonical knowledge files + `_pending.md` (staging) + `_resume.md` (continuity snapshot) + `README.md` |
| `.claude/project.json` | per-project config (test/lint cmd, TDD globs, destructive patterns, swarm config, additions). Populated by `/init-project`. |
| `.claude/settings.json` | hook wiring + permissions |
| `.claude/state/` | runtime: `workflow.json`, `commit_consent`, `push_consent`, `spec_approvals/`, `swarm_approvals/`, `swarm/`, `harness/<slug>.log`, `last_test_result` |
| `.mcp.json` | three baseline MCP servers: `context7`, `plantuml`, `playwright` |
| `src/` | pristine ship-time templates for every file `/init-project` modifies (overlay source for `npx @friedbotstudio/create-baseline`) |
| `docs/init/seed.md` | genesis prompt — governing specification of the baseline |

## Appendix B — Skill index (reference)

**Artifact drafting (4)** — each ships a `template.md`:
- `intake` (Phase 1), `brd` (cross-functional pre-spec), `spec` (Phase 4, diagram-driven), `rca` (out-of-band postmortem)

**Workflow phases (11)** — auto-invocable; orchestrator chains them:
- `triage`, `scout`, `research`, `tdd`, `simplify`, `security`, `integrate`, `document`, `archive`, `changelog` (Phase 11.5), `commit`

**Phase workers (5)** — execute pre-decided recipes; mandatorily invoke a sub-skill:
- `scenario`, `implement`, `verify`, `prose`, `design-ui`

**Spec helpers (4)**:
- `spec-lint`, `spec-render` (user-only), `spec-diagram-review`, `spec-traceability-review`

**Orchestration (3)**:
- `harness` (user + model invokable; Stop-hook auto-continued), `swarm-plan`, `swarm-dispatch`

**Memory (1)**:
- `memory-flush`

**Phase helpers (1)** — invoked by entry phases as a Step 0.5 / Step 1.5 gate; never on user-direct invocation:
- `brainstorm` — PM-mode requirement capture via Socratic dialogue. Invoked by `/intake`, `/spec`, `/tdd` at Step 0.5 when `workflow.json → skip_brainstorm: false`. Writes `docs/brief/<slug>.md` with structured fields (actor, trigger, current state, desired state, non-goals, solution-leakage). Stage 2 discipline-assertor structurally forbids solution-shaped tokens in probes. See Article X.3.

**Navigation (1)** — the default tool for code-navigation questions; prefer it over global grep when a question asks "where does X come from", "what API populates Y", "what wraps Z", or "find the file for feature F":
- `code-browser` — walks the import graph from a page or entry file to the network boundary, returning flat `byHook` / `byService` / `byApiCall` / `byComponent` indexes. `discover.mjs` writes a per-repo `conventions.json` once; `walk.mjs` then runs deterministically in milliseconds. Read-only.

**Shared globals (7)** — one written for this baseline, six vendored from external sources with their upstream licenses preserved in `LICENSE` + `NOTICE` alongside each skill:
- `claude-automation-recommender` — vendored from Anthropic's `claude-code-setup` plugin, Apache 2.0.
- `code-structure` — written for this baseline (Friedbot Studio). Mandatory on every code-generation step.
- `humanizer` — vendored from [`blader/humanizer`](https://github.com/blader/humanizer), MIT.
- `documentation` — vendored from Anthropic's `claude-code-setup` plugin, Apache 2.0.
- `technical-tutorials` — vendored from [`jonathimer/devmarketing-skills`](https://github.com/jonathimer/devmarketing-skills), MIT.
- `copywriting` — vendored from [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills), MIT.
- `impeccable` — vendored from [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable), Apache 2.0.

**Audit (1)**:
- `audit-baseline` — drift check between this constitution + seed.md and the implementation

**Alternate tracks (1)** — stripped-down workflows routed via `/triage`:
- `chore` — for tasks that need no TDD (documentation, governance counts, vendored content, configuration, formatting, dependency bumps, consolidation). Skips `/scenario` and `/implement`; runs edits directly; routes through `simplify` / `integrate` / `document` only when their triggers apply. `verify`, `archive`, `/grant-commit`, `/commit` mandatory. Not a bypass — silent skips of triggered conditional phases are forbidden.
