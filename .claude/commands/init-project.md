---
description: Configure the baseline for this specific project. Invokes the `scout` skill, then `claude-automation-recommender`, populates `.claude/project.json`, pre-creates lazy directories, re-renders `swarm-worker.md` from its template with any stack-specific skills appended, appends a §16 addendum to `docs/init/seed.md`, runs `/audit-baseline`, and asks the user to restart Claude Code so changes take effect. Until this runs, the test/lint runner hooks emit guidance only.
argument-hint: "[optional: stack hint, e.g. 'next.js + vitest' — usually unnecessary, auto-detected]"
allowed-tools: Read, Write, Edit, Bash, Task, Skill, AskUserQuestion, Glob, Grep
disable-model-invocation: true
---

# `/init-project` — bootstrap the baseline for THIS project

User-only command. The 9-step protocol below mirrors `seed.md` §13. Each step is shown to the user; nothing happens silently.

Skip steps already completed (e.g., re-runs after `configured: true`). Re-runs **replace** the §16 addendum wholesale; manual notes belong in a sibling section.

Log every step transition to `.claude/state/init/<UTC-timestamp>.log` so partial failures and re-runs are debuggable.

## Step 1 — Welcome

- Print one line confirming you're at the repo root: `pwd`, then list `.mcp.json`, `CLAUDE.md`, `.claude/`.
- Read `.claude/project.json → configured`. Tell the user one of:
  - `configured: false` → "First run. The baseline is in project-agnostic mode. I'll scout your codebase, ask the recommender what to tailor, and propose a config."
  - `configured: true` → "Re-running init. Will re-scout and replace §16 in seed.md. Continue? (otherwise abort.)"
- If `$ARGUMENTS` was provided, note it ("user hint: `<...>`") and feed it into Step 3 as a stack-detection prior.

## Step 2 — Pre-flight deps

Verify the baseline's hard requirements + advisory ones:

| Required | Check command | If missing |
|---|---|---|
| `bash` ≥ 4 | `bash --version` | Hard fail. The baseline cannot run. |
| `node` + `npx` ≥ 18.17 | `which npx` | Hard fail. Hooks and skill helpers are Node ESM; MCP servers need npx. |
| `git` repo | `git rev-parse --is-inside-work-tree` | Soft warn. Swarm worktree mode falls back to shared. |
| `plantuml` CLI | `which plantuml` | Soft warn. `plantuml_syntax_guard` runs in guide mode and `/spec-render` refuses without it. |

For each soft warn, note it and proceed. For hard fails, stop here with the install command.

## Step 3 — Codebase survey (whole-project, in main context)

Survey the WHOLE project — not a task slice. Do this directly with Read/Grep/Glob/Bash; do not delegate to a subagent (the only baseline subagent, `swarm-worker`, exists strictly for `/swarm-dispatch` parallelism). Capture structured findings:

- **Stack**: language(s), framework(s), package manager, runtime version targets.
- **Test setup**: test framework, test glob conventions, current test scripts.
- **Lint setup**: linter(s), formatter, type checker.
- **Architecture signals**: monorepo? multiple deployable units? front-end + back-end split?
- **External services referenced** (in code or config): databases, queues, third-party APIs, observability, project management tools.
- **CI**: present? what runner?
- **Conventions**: commit format, branch naming, code style notes from CLAUDE.md / CONTRIBUTING.md / README.
- **Git workflow model** (best-effort): gather signals for `git.workflow_model` (Art. VII) — the release-CI trigger text (`.github/workflows/*.yml`: a `semantic-release` step + its `push: branches: [...]` list), branch protection (`gh api repos/{owner}/{repo}/branches/<default>/protection`, if `gh` is authenticated and reachable), and history shape (`git log --merges` linear-vs-merge). Pass these as `{ciText, ghProtection}` to `detectWorkflowModel` in `.claude/hooks/lib/common.mjs` — e.g. `node -e "import('./.claude/hooks/lib/common.mjs').then(m=>console.log(JSON.stringify(m.detectWorkflowModel({ciText:process.argv[1]||''}))))" "$(cat .github/workflows/*.yml 2>/dev/null)"`. The classifier floors to `{model:'ask'}` on any ambiguity, conflict, or unreachable `gh`. Record the proposed `model` (+ `release_branches` when `direct-to-main`) for Step 5; never treat detection as final — Step 5 confirms it.

Keep the survey under 400 lines. Include exact file paths for the strongest evidence of each finding.

Save the survey to `.claude/state/init/<timestamp>.scout.md`.

## Step 4 — Run the recommender (baseline-aware)

Invoke the `claude-automation-recommender` skill via the Skill tool. **Always pass the survey from Step 3 as context** so recommendations are grounded in actual evidence.

The recommender's SKILL.md instructs it to:
- Treat baseline components as already-installed (16 hooks, 1 subagent, 35 skills, 4 commands, 3 MCPs).
- Recommend additions only — never duplicate.
- Never recommend new subagent types — decisions live in skills running in main context. The only subagent recommendation form is `additions.swarm_worker_skills` (stack-specific skills the `swarm-worker` should preload).
- Output a JSON block alongside the narrative; the JSON shape is `{stack, project_json, additions, gaps}` where `additions` has `mcp_servers`, `skills`, `hooks`, `swarm_worker_skills` (no `subagents` field).

Capture both the narrative and the JSON. Save the JSON to `.claude/state/init/<timestamp>.recommender.json`.

## Step 5 — Aggregate + present (REVIEW ONLY — NOTHING WRITTEN YET)

**This step is a proposal, not configuration.** Nothing has been written to disk yet: `.claude/project.json` still reads `configured: false`, no new skills/hooks/MCPs are wired, and the `swarm-worker` agent file has not been re-rendered. The user is reading a *proposal* that takes effect only when they explicitly approve in this step.

Show the user one review surface before writing anything:

1. **Detected stack** (from Step 3 + Step 4 JSON `stack` field). Confirm or correct.
2. **`project.json` proposed values** (from JSON `project_json`, merged with baseline defaults):
   - `test.cmd`, `lint.cmd`
   - `tdd.source_globs`, `test_globs`, `exempt_globs`
   - `destructive.hard_block_patterns` (baseline + extensions), `ask_patterns` (baseline + extensions)
   - `swarm.isolation` (`worktree` if git, else `shared`)
   - `git.workflow_model` + `git.release_branches` (from the Step 3 `detectWorkflowModel` proposal). Surface the detected model via `AskUserQuestion` for confirmation — present the proposed value plus `ask` as an always-available option. On any ambiguity or unreachable `gh`, the proposal IS `ask`; never auto-pick an enforced model without the user's confirmation.
   - All other keys keep their baseline defaults.
3. **Recommender additions** (from JSON `additions`): MCP servers, skills, hooks, and any `swarm_worker_skills` to preload — name + reason for each.
4. **Gaps flagged** (from JSON `gaps`): things the baseline doesn't cover but might warrant a future spec.

After presenting the four blocks, **explicitly tell the user the project is NOT yet configured**. Print this exact block above the confirmation prompt:

```
⚠ The baseline is still in PROJECT-AGNOSTIC MODE.

None of the proposal above has been applied. `project.json → configured`
is still `false`. test_runner / lint_runner are still in guide mode.
Closing this session now leaves the project unconfigured.

The next prompt is an action gate. You must explicitly approve to proceed
to Step 6 (apply) — otherwise nothing changes.
```

Use `AskUserQuestion` to confirm. The question SHALL be a full sentence that names the un-configured state explicitly — not "Apply these changes?" alone, but: **"The project is NOT yet configured. Proceed to apply this proposal and finish setup?"** Options:

- `Proceed and apply` — advances to Step 6.
- `Edit before applying` — take the user's adjustments inline, re-show the surface, ask again.
- `Cancel — leave project unconfigured` — exit without writing; `configured` stays `false`; surface that the project remains in project-agnostic mode and `/init-project` can be re-run later.

If `Edit before applying`: take the user's adjustments inline, re-show the surface, **ask the same gate again**. Do not silently apply — the gate fires after every edit cycle until the user picks `Proceed and apply` or `Cancel`.

## Step 6 — Apply

Write to disk now. **This is the first step in the protocol that mutates files in the user's project** — until this step runs, `.claude/project.json` still reads `configured: false` and the baseline stays in project-agnostic mode. Reaching this step means the user explicitly picked `Proceed and apply` at Step 5's gate.

Do each sub-step in order; if any fails, stop and surface the error before continuing:

1. **Pre-create lazy directories**:
   ```bash
   mkdir -p docs/{intake,brd,scout,research,specs,rca,security,archive}
   mkdir -p .claude/state/{spec_approvals,swarm_approvals,swarm,harness,init}
   ```
2. **Add new MCP servers** (if any) → merge into `.mcp.json → mcpServers`.
3. **Add new skills** (if any) → write `.claude/skills/<name>/SKILL.md`. Skills are landed *before* the swarm-worker re-render so any skill referenced by `additions.swarm_worker_skills` exists on disk when the worker file is written.
4. **Re-render `swarm-worker`** with stack-specific skills:
   - Read the template at `src/agents/swarm-worker.template.md`.
   - Build the `SKILLS` value as a YAML list block. Always include `  - scenario` and `  - implement` (the worker's two mandatory skills). Append each skill in `additions.swarm_worker_skills` in dependency order (framework first, then testing/linting, then cross-cutting). Two-space indent, one skill per line.
   - Substitute the four tokens — `{{NAME}}` → `swarm-worker`, `{{DESCRIPTION}}` → the canonical description (verbatim string below), `{{SKILLS}}` → the YAML list block, `{{ROLE_LINE}}` → the canonical first-paragraph role line. Substitution is literal string replacement.

   **Canonical description (use verbatim for `{{DESCRIPTION}}`):**

   > Execute a single swarm task in an isolated git worktree. Receive a fully-specified recipe from the main context — a scenario recipe plus an implementation contract — then run \`Skill(scenario)\` followed by \`Skill(implement)\` and report JSON status. Make no design decisions and do not expand scope. Invoked exclusively by \`/swarm-dispatch\`; never elsewhere.

   **Canonical role line (use verbatim for `{{ROLE_LINE}}`):**

   > You are a swarm worker. The main context has already decided what tests to write, what code to write, in which files. Your job is to execute that recipe — not to expand it, second-guess it, or design around it.
   - Validate every skill named in `SKILLS` exists at `.claude/skills/<skill>/SKILL.md`. If any is missing, refuse the render and surface the gap.
   - Write the rendered output to `.claude/agents/swarm-worker.md` (overwriting the baseline version with the stack-augmented one).

   Recommender output **must not** propose new subagent types — only stack-skill additions for the existing `swarm-worker`. If you see a `subagents` field in the recommender JSON, ignore it and surface a warning that the schema is stale.
5. **Add new hooks** (if any) → write `.claude/hooks/<name>.mjs`, `chmod +x`, wire into `.claude/settings.json`. Use Node ESM with `import` from `lib/common.mjs`, no jq, follow §4.1 conventions.
5a. **Ensure `.gitignore`** → run the baseline `.gitignore` materialization (the same add-only merge `src/cli/install.js → materializeGitignore` performs): create the target `.gitignore` from `.claude/skills/gitignore/baseline-ignores.json` if absent, or append only the baseline must-ignore lines it lacks (never overwrite or reorder existing entries). Offline; for stack-tailored enrichment, invoke the `gitignore` skill. This guarantees the `gitignore_leak_guard` hook's must-ignore set is actually ignored before the first commit.
6. **Write `project.json`** with the agreed values, `configured: true`, **and a populated `additions` block**:
   ```jsonc
   "additions": {
     "agents":              [],
     "skills":              [<names of every entry in additions.skills[]>],
     "hooks":               [<names of every entry in additions.hooks[]>],
     "mcp_servers":         [<names of every entry in additions.mcp_servers[]>],
     "swarm_worker_skills": [<names of every entry in additions.swarm_worker_skills[]>]
   }
   ```
   `additions.agents` stays empty in this baseline — the recommender does not propose new subagents. The audit script reads this block and unions each set with the baseline `EXPECTED_*` set when checking names + counts. Names only — drop the `command`, `why`, etc. fields the recommender used; only the identifiers are needed for drift detection.

## Step 7 — Update `seed.md` §16 addendum

Append — or replace — the `## §16 — Project-specific configuration` section in `docs/init/seed.md`. Use the shape in seed.md §16:

```markdown
## §16 — Project-specific configuration

Generated: <UTC timestamp>
By: /init-project (run #<n>)

### Detected stack
- Language: ...
- Framework: ...
- Test runner / cmd: ...
- Linter / cmd: ...
- Package manager: ...

### Recommender additions adopted
| Kind | Name | Why |
|---|---|---|
...

### Workflow tweaks
- ...

### Deviations from canonical seed
- ...

### Recommender output (verbatim JSON)
```json
<paste from Step 4>
```
```

If §16 already exists, find its bounds (heading to next `## §` or EOF) and replace wholesale. Don't merge — re-runs are full replacements (seed §16 idempotency rules).

## Step 8 — Drift self-check

Invoke the `audit-baseline` skill via the Skill tool. It runs `audit.mjs` and prints a pass/fail table of 60+ checks.

- **PASS** → log it and proceed.
- **FAIL** → STOP. Surface the failures. The most likely cause: Step 6 added a component that doesn't match seed §4 conventions (missing wiring in `settings.json`, or a new skill absent from the canonical name set). Tell the user what failed and offer to roll back Step 6.

## Step 9 — Ready + restart

Print a final summary:

```
✓ Baseline configured for <stack>
  test.cmd:  <cmd>
  lint.cmd:  <cmd>
  swarm:     <isolation>
  added:     <N MCPs, M subagents, K skills, J hooks>
  audit:     PASS

→ EXIT and restart Claude Code so new hooks, agents, skills, and MCP servers
  load. After restart, run /triage "<your request>" to begin, or /harness
  for the full pipeline.
```

**Tell the user to restart.** New MCP servers and hooks wired in `settings.json` only take effect on a fresh session. `/reload-plugins` covers some cases; restart is the safe default.

## Constraints

- **Steps 6 + 7 + 8 are atomic for the user.** If Step 8 fails, do not declare success at Step 9.
- **Step 5 is review, not setup.** Until the user explicitly picks `Proceed and apply` at Step 5's gate, the project remains in project-agnostic mode. Surfacing recommendations is not configuration; the gate prompt SHALL name the un-configured state in a full sentence so a skimming reader cannot mistake the proposal for a completion notice.
- **Never write `configured: true` before Step 8 passes.** A FAIL at Step 8 means the project is in a broken state; leaving `configured: true` would lie to `setup_guard` and the welcome hook in CLAUDE.md.
- **No silent decisions.** Every project-specific change appears in seed.md §16 so the next reader can see what diverged from baseline.
- **Idempotent.** Re-running on the same project produces the same §16 (modulo timestamp + run number) and passes `/audit-baseline` cleanly.
