---
name: spec-lint
owner: baseline
description: Preflight a spec draft without saving. Runs the same three checks as the write-boundary hooks — PlantUML syntax, required diagram presence, and AC-to-sequence traceability — and prints a compact pass/fail table. Use while iterating so the hooks don't bite on save.
---

# spec-lint — preflight a spec draft

Invocable by both user (`/spec-lint <slug>`) and Claude (when iterating on a spec and wanting to check status before writing).

## What it checks

Three checks, same logic as the hooks, but advisory (no writes are blocked):

| # | Check | Hook it mirrors |
|---|---|---|
| 1 | Every ```plantuml``` fence parses under `plantuml -checkonly` | `plantuml_syntax_guard` |
| 2 | Required diagram kinds present (config: `project.json → artifacts.required_diagrams.spec`) | `spec_diagram_presence_guard` |
| 3 | Every `AC-NNN` row in the Acceptance criteria table references a `§Behavior #N` section that exists | (no hook — unique to the lint) |

## Invocation

`/spec-lint <slug>` — where `<slug>` corresponds to `docs/specs/<slug>.md`.

## Steps

1. Validate the slug: `docs/specs/<slug>.md` must exist.
2. Run:
   ```
   node .claude/skills/spec-lint/lint.mjs <slug>
   ```
3. Print the script's output verbatim to the user. It is a table with one row per check and a final summary line.

## Output format

```
check                              status
---------------------------------- ------
plantuml_syntax                    PASS
diagram_presence                   FAIL  (missing: c4_component, dependency_graph)
ac_traceability                    FAIL  (AC-002 → §Behavior #2 not found)
---------------------------------- ------
overall                            FAIL
```

Exit 0 on overall PASS, 1 on overall FAIL. Intended for use in CI or a pre-commit loop as well as interactively.

## Prerequisites

- `plantuml` CLI on PATH for check #1 (if absent, #1 is reported as `SKIP (no plantuml)`; #2 and #3 still run).

## Notes

- Unlike the hooks, `spec-lint` runs against the on-disk file, not proposed content. Save or use the hooks to validate an unsaved draft.
- `spec-lint` does not render. Use `/spec-render <slug>` for that.
