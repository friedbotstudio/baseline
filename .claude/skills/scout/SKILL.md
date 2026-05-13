---
name: scout
owner: baseline
description: Workflow Phase 2 — Codebase Scouting and Constraint Discovery. Maps the relevant slice of the codebase for a given task. Produces a scout report at `docs/scout/<slug>.md` naming the files, modules, and patterns the proposed work touches or constrains. Executes in main context with full conversation visibility — no agent delegation.
argument-hint: "[optional: specific path to scope the scout]"
---

You are mapping the slice of the codebase that matters for the current task — no more, no less. The scout report is consumed downstream by `/research` and `/spec`.

# Prereqs

- `.claude/state/workflow.json` exists.
- `intake` is in `completed` OR in `exceptions`. If neither, stop and direct the user to invoke `intake`.

# Inputs

- The intake document at `docs/intake/<slug>.md` — read **Problem** and **Goal** first; they define scope.
- The BRD at `docs/brd/<slug>.md` if present — In/Out scope lists.
- The codebase at the project root.
- Optional argument: a specific path to scope the scout.

If no intake exists (ad-hoc invocation), fall back to the parent task description and note in the report that the scout ran without a structured intake.

# Method

1. **Identify the nouns and verbs in the task.** Each is a search anchor.
2. **For each anchor:**
   - `rg` (or `grep -r`) for the exact term, filtered to source directories.
   - Read the top 3–5 hits with surrounding context.
   - Follow imports/callers one hop out. Do not recurse further.
3. **Identify entry points** — HTTP routes, CLI commands, cron jobs, queue consumers — that would trigger the code path being modified.
4. **Identify existing tests** for the affected code. Note flaky/skipped ones.
5. **Note constraints** — config files, feature flags, migrations, deploy manifests that need lockstep changes.

# Output

Write the report to `docs/scout/<slug>.md` (create the directory if missing). Format:

```
# Codebase Scout Report — <task>

## Primary touchpoints
- <path:line> — <role in the task>
- ...

## Entry points that reach this code
- <HTTP route / CLI cmd / job> at <path:line>

## Existing tests
- <test path> — <what it covers> — <passing? skipped?>

## Constraints and co-changes
- <config / migration / flag> — <why it's linked>

## Patterns in use here
- <1–3 sentences on the style the code follows, for the implementer>

## Risks / landmines
- <anything surprising: dead code, TODO comments, shims, version skew>
```

After writing the file, append `"scout"` to `workflow.json → completed`.

Tell the user: `Scout report at <path>. Next: /research.`

# Constraints

- **Project source is read-only during scout.** Do not modify project files. The only write is to `docs/scout/<slug>.md`.
- **Do not speculate.** If a search turns up nothing, say so. Do not invent paths.
- **Keep the report under ~300 lines.** If the surface is genuinely larger, say so and propose a scoping split with the user.
- **Do not recommend an implementation approach.** That is `/research`'s job. Stick to what is.
- **No code generation.** No new files outside `docs/scout/`.
