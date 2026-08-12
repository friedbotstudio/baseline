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

**Restore source depends on the tree shape.** A baseline development tree carries pristine templates under its own template directory; a consumer install does not — it received these files from the published package. Resolve the source before offering a restore, and never offer a copy from a path the install does not have.

- If `.claude/workflows.jsonl` is missing on disk:
  - AskUserQuestion: "`.claude/workflows.jsonl` missing. Restore it?"
  - Options: `Restore` | `Skip` | `Show diff`
  - On `Restore` in a **development tree**: copy the pristine `workflows` template from the repo's template directory.
  - On `Restore` in a **consumer install**: re-run the baseline installer's merge (or `/upgrade-project`) to re-materialize the file from the published package. Report the command rather than fabricating the content.
  - Either way, log to `.claude/state/init/doctor-<timestamp>.log`.
  - On `Skip`: note in report; proceed.

## Step 3 — Check `.claude/schemas/` presence

- If `.claude/schemas/workflow-track.v1.json` is missing:
  - AskUserQuestion: "`.claude/schemas/workflow-track.v1.json` missing. Restore it?"
  - Resolve the restore source exactly as Step 2 does — repo template directory in a development tree, installer re-materialization in a consumer install.
  - Apply on `Restore` (recursive copy).

## Step 4 — Validate workflows.jsonl against §18 schema + invariants

- Run `node .claude/skills/triage/seed-tasklist.mjs --validate-only`. The helper exits 0 on success or non-zero with a named-error report on failure.
- On validation failure, parse the helper's stderr for each error. For each:
  - AskUserQuestion: "Violation: `<kind>` in track `<id>`: `<message>`. Options: `Show context`, `Skip` (mark as known), `Edit manually` (open file at line)."
  - The doctor does NOT auto-fix schema/invariant violations — manual user judgment is required. Surface the violation context (track + node ids) and pause.

## Step 5 — Four-way mirror check (Article IV / §18) — development trees only

This step compares each governance document against its pristine template mirror. Those mirrors exist only in a baseline **development** tree; a consumer install receives the rendered documents and no template to compare them with. **Skip this step entirely on a consumer install** and note it as not-applicable in the report — do not report a mirror it cannot have as drift.

In a development tree, extract the §18 sections from the seed and its template mirror, and the Article IV sections from the constitution and its template mirror. Byte-compare each pair.

- On §18 mirror drift:
  - AskUserQuestion: "The seed's §18 differs from its template mirror. Options: `Re-mirror docs→template`, `Re-mirror template→docs`, `Show diff`, `Skip`."
  - Apply the chosen overwrite.

- Same pattern for the Article IV mirror.

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
- **No new dependencies.** Validation reuses the shipped `.claude/skills/triage/workflows-validator.js` mirror via the triage helper. That mirror is synced from the CLI source at build time, so the shipped copy is the only one a consumer install needs.
- **Schema/invariant violations require manual fixes.** Auto-fixing structurally violates the user's intent (the violation might be intentional during development). Doctor surfaces; user fixes.
- **Mirror drift CAN be auto-fixed** (one-direction overwrite on confirmation). The reverse direction (which file is canonical?) is the user's call.
