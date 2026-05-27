---
description: Detect and repair baseline drift — missing or invalid `.claude/workflows.jsonl`, schema violations, four-way Article IV / §18 mirror drift, and (advisory) shipped-tooling files placed outside `.claude/` against the convention codified at seed.md §3. Interactive: presents each detected violation via AskUserQuestion and applies the named fix on confirmation.
argument-hint: ""
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Glob, Grep
disable-model-invocation: true
---

# `/init-project doctor` — baseline drift detector + repairer

User-only command. Run after a `create-baseline upgrade` cycle, after manually editing `workflows.jsonl`, or any time the baseline feels out of sync. Different from `create-baseline doctor` (the npm CLI manifest-drift checker) — this is a project-internal interactive repair tool.

## Step 1 — Pre-flight

- Print: "`/init-project doctor` — checking baseline integrity. Each detected violation is presented separately; you confirm each fix via AskUserQuestion."
- Verify the project is configured: `.claude/project.json → configured == true`. If false, halt with: "Run `/init-project` first; the project is in agnostic mode."
- Verify `node` ≥ 18.17 available; halt with one-line missing-dep message if not.

## Step 2 — Check `.claude/workflows.jsonl` presence

- If `.claude/workflows.jsonl` is missing on disk:
  - AskUserQuestion: "`.claude/workflows.jsonl` missing. Restore from pristine template (`src/.claude/workflows.template.jsonl`)?"
  - Options: `Restore` | `Skip` | `Show diff`
  - On `Restore`: `cp src/.claude/workflows.template.jsonl .claude/workflows.jsonl`. Log to `.claude/state/init/doctor-<timestamp>.log`.
  - On `Skip`: note in report; proceed.

## Step 3 — Check `.claude/schemas/` presence

- If `.claude/schemas/workflow-track.v1.json` is missing:
  - AskUserQuestion: "`.claude/schemas/workflow-track.v1.json` missing. Restore from `src/.claude/schemas/`?"
  - Apply on `Restore` (recursive cp).

## Step 4 — Validate workflows.jsonl against §18 schema + invariants

- Run `node .claude/skills/triage/seed-tasklist.mjs --validate-only`. The helper exits 0 on success or non-zero with a named-error report on failure.
- On validation failure, parse the helper's stderr for each error. For each:
  - AskUserQuestion: "Violation: `<kind>` in track `<id>`: `<message>`. Options: `Show context`, `Skip` (mark as known), `Edit manually` (open file at line)."
  - The doctor does NOT auto-fix schema/invariant violations — manual user judgment is required. Surface the violation context (track + node ids) and pause.

## Step 5 — Four-way mirror check (Article IV / §18)

Extract the §18 sections from `docs/init/seed.md` and `src/seed.template.md`. Extract Article IV sections from `CLAUDE.md` and `src/CLAUDE.template.md`. Byte-compare each pair.

- On §18 mirror drift:
  - AskUserQuestion: "`docs/init/seed.md §18` differs from `src/seed.template.md §18`. Options: `Re-mirror docs→src`, `Re-mirror src→docs`, `Show diff`, `Skip`."
  - Apply the chosen overwrite.

- Same pattern for Article IV mirror.

## Step 6 — `.claude/` tooling convention check (advisory)

Per seed.md §3 + `conventions.md → user-shipped-tooling-lives-in-claude-directory`, user-shipped baseline tooling lives under `.claude/`. The only project-root exceptions are `CLAUDE.md` and `.mcp.json`.

- Scan for shipped tooling at the project root that should live under `.claude/`. Heuristic: files matching `*.skill.md`, `*.workflow.json`, `*.hook.sh`, `*.command.md` at the project root.
- For each match:
  - AskUserQuestion: "Convention violation: `<path>` at project root. Suggested target: `.claude/<subdir>/<filename>`. Move?"
  - The doctor offers the move; the user confirms.

## Step 7 — Report + log

- Print a summary table:
  - Checks run: N
  - Fixes applied: M
  - Skipped (user declined or manual fix required): K
  - Remaining manual: L
- Write the full session record to `.claude/state/init/doctor-<UTC-timestamp>.log` (one line per check + action).
- If any check returned a manual-fix path (e.g., schema violation in workflows.jsonl), exit with code 1 so caller workflows treat the result as "drift remains". Otherwise exit 0.

## Constraints

- **Read-only by default; writes only on user confirmation.** Every Edit/Write happens after an AskUserQuestion `Apply` response. No silent fixes.
- **No commits.** The doctor's fixes land on the working tree. The user commits via the normal `/grant-commit` + `/commit` flow.
- **No new dependencies.** Validation reuses the shipped `.claude/skills/triage/workflows-validator.js` mirror (synced from `src/cli/workflows-validator.js` at build time) via the triage helper.
- **Schema/invariant violations require manual fixes.** Auto-fixing structurally violates the user's intent (the violation might be intentional during development). Doctor surfaces; user fixes.
- **Mirror drift CAN be auto-fixed** (one-direction overwrite on confirmation). The reverse direction (which file is canonical?) is the user's call.
