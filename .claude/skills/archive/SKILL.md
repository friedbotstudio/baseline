---
name: archive
owner: baseline
description: Phase 10.5 — move the slug's workflow artifacts (intake, scout, research, spec, approvals, swarm state, security reports, rendered diagrams) to docs/archive/<YYYY-MM-DD>/<slug>/. Runs before /commit so the committed tree is clean of work-in-flight files. workflow.json stays live and gets archived as the first step of /commit.
---

# archive — Phase 10.5

Invoked after `/document` and before `/commit`. Pillar 4 of seed.md ("no historical data — moved to archive") happens here.

The archival *bundle* is planned at spec time — the spec's slug determines which files travel together. This skill is the executor.

## Prereq

`workflow.json` must have `document` in `completed` OR in `exceptions`. Otherwise stop and say which phase is missing.

## Steps

1. Read `.claude/state/workflow.json` to get the slug (derive from `request`, or from any `docs/specs/*.md` that was produced — whichever is present).
2. Run the archive script:
   ```
   .claude/skills/archive/archive.sh <slug>
   ```
   The script moves (`git mv` if repo is git, else `mv`) these artifacts — whichever exist — to `docs/archive/<YYYY-MM-DD>/<slug>/`:

   | Source | Target in bundle |
   |---|---|
   | `docs/intake/<slug>.md` | `intake.md` |
   | `docs/brief/<slug>.md` | `brief.md` |
   | `docs/brd/<slug>.md` | `brd.md` |
   | `docs/scout/<slug>.md` | `scout.md` |
   | `docs/research/<slug>.md` | `research.md` |
   | `docs/specs/<slug>.md` | `spec.md` |
   | `docs/specs/_rendered/<slug>/` | `spec-rendered/` |
   | `docs/security/<slug>-*.md` | `security.md` (concatenated if multiple) |
   | `.claude/state/spec_approvals/<slug>.approval` | `spec.approved` |
   | `.claude/state/swarm/<slug>.json` | `swarm.json` |
   | `.claude/state/swarm_approvals/<slug>.approval` | `swarm.approved` |

3. **Do NOT move `workflow.json`.** `/commit` archives it as its first step so the phase ordering is preserved until the end.

4. Append `"archive"` to `workflow.json → completed`.
5. Tell the user: "Archived to `docs/archive/<date>/<slug>/`. Ready for `/grant-commit` → `/commit`."

## Constraints

- **Never archive a workflow in-flight.** If the user runs `/archive` before the workflow is done (integrate/document not complete), refuse and tell them which phase is missing.
- **Never delete artifacts.** Move-only. If a target file already exists in the bundle (re-run), refuse and tell the user to pick a new archive date or remove the conflict.
- **Idempotent on partial failure**: if the script moves 3 of 5 files and then fails, re-running continues from where it stopped (the moved files are gone from source, the un-moved are still at source).
