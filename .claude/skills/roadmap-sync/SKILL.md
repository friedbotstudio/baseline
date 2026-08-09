---
name: roadmap-sync
owner: baseline
description: Phase 10.6 — sync the project's execution roadmap (project.json → roadmap.path, default docs/roadmap-execution-plan.md) to the just-landed work. Flips the tasks named in workflow.json → roadmap_tasks[] from ⬜ to ✅ and promotes their epic headings ⬜→🟡→✅, preserving the standup parser format contract. Fail-open: never throws, no-ops when roadmap.path is unset/absent or no task matches, and never blocks a commit. Runs after /archive and before /memory-sync on every committing track except epic.
---

# roadmap-sync — Phase 10.6

Runs after `/archive` (10.5) and before `/memory-sync` (10.7) on every committing track except `epic`. Keeps the project's execution roadmap (`project.json → roadmap.path`) in sync with landed work, so the roadmap tracker never drifts from what actually shipped. The roadmap is a plan, never a gate.

## Prereq

`archive` is in `workflow.json → completed` OR in `exceptions`. If neither, stop and direct the user to run `/archive` first (or `/harness` to resume in order).

## Steps

1. **Resolve inputs.** Read `project.json → roadmap.path` and resolve it against the repo root with `resolveRoadmapPath` (empty/absent/absolute/repo-escaping → `null`). Read `workflow.json → roadmap_tasks[]` (absent → `[]`) — `/triage` populates this with validated `E<epic>-<taskId>` tokens when the request is `spec-derived` against a roadmap item. If the path resolves to `null` or `roadmap_tasks` is empty, the phase is a clean no-op — skip to Step 3.
2. **Sync.** Call `syncRoadmap({ roadmapPath, roadmapTasks })` from `sync.mjs`. It flips each `E<num>-<taskId>` token's task line ⬜→✅, recomputes each affected epic heading ⬜→🟡→✅, and writes the roadmap file only if something changed. It never throws — on any error it returns a no-op result and writes nothing.
3. **Record the phase.** Append `"roadmap-sync"` to `workflow.json → completed` and refresh `updated_at`.
4. **Report.** Emit the `SyncReport` JSON (`{flipped, promoted, skipped, noop, anomalies}`) and append a one-line `roadmap-sync` entry to `.claude/state/harness/<slug>.log` (`flipped=[..] promoted=[..] noop=<bool>`). Surface any `anomalies[]` to the user as non-blocking notes.

## Constraints

- **Fail-open, never a gate.** The phase never blocks a commit. Any error, an unset/absent/escaping `roadmap.path`, a missing file, or an unmatched task → no-op, exit 0, commit proceeds.
- **Deterministic, not inferential.** Flip only the tasks named in `workflow.json → roadmap_tasks[]`. Never infer which task shipped from the diff.
- **Writes only the roadmap file.** Never mutate `workflow.json` beyond the `completed[]` append (Step 3), never write consent tokens or `.claude/state/` beyond the harness log.
- **Preserve the format contract.** Task lines keep exactly one `⬜/🟡/✅`; epic headings keep the `## Epic N — Title  <emoji>  (tag)` em-dash + single-emoji shape (load-bearing for `standup/gather.mjs`). `syncRoadmap` enforces this; do not hand-edit the roadmap here.
- **Advisory `--audit` mode** (`auditRoadmap`) reports heading/task-body inconsistencies + malformed lines; it never mutates. Use it to re-validate the roadmap, not as part of the per-commit path.
