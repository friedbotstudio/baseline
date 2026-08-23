---
name: roadmap-sync
owner: baseline
description: Phase 10.6 — sync the project's execution roadmap (project.json → roadmap.path, default docs/roadmap-execution-plan.md) to the just-landed work. Flips the tasks named in workflow.json → roadmap_tasks[] from ⬜ to ✅ and promotes their epic headings ⬜→🟡→✅, preserving the standup parser format contract. On the epic track it appends instead — the epic's heading plus one row per slice — and stamps roadmap_epic back into the epic state. Also hosts the ad-hoc backfill that puts every epic already on disk onto the roadmap. Fail-open: never throws, no-ops when roadmap.path is unset/absent or no task matches, and never blocks a commit. Runs after /archive and before /memory-sync on every committing track.
---

# roadmap-sync — Phase 10.6

Runs after `/archive` (10.5) and before `/memory-sync` (10.7) on every committing track. Keeps the project's execution roadmap (`project.json → roadmap.path`) in sync with landed work, so the roadmap tracker never drifts from what actually shipped. The roadmap is a plan, never a gate.

The phase does one of two things depending on the track. On a track that lands code it **flips** rows the work completed. On the `epic` track — which lands discovery, not code — there is no row to flip yet, so it **appends** the epic's own section. Both directions are additive-only: nothing already on the roadmap is renumbered, reordered, or removed.

## Prereq

`archive` is in `workflow.json → completed` OR in `exceptions`. If neither, stop and direct the user to run `/archive` first (or `/harness` to resume in order).

## Steps

1. **Resolve inputs.** Read `project.json → roadmap.path` and resolve it against the repo root with `resolveRoadmapPath` (empty/absent/absolute/repo-escaping → `null`). Read `workflow.json → roadmap_tasks[]` (absent → `[]`) — `/triage` populates this with validated `E<epic>-<taskId>` tokens when the request is `spec-derived` against a roadmap item. If the path resolves to `null`, the phase is a clean no-op — skip to Step 3. **An empty `roadmap_tasks` does not skip the sync**: the heal pass in Step 2 is why the phase runs on every committing workflow, and an epic whose rows this workflow never touched is exactly the one whose heading nothing else repairs.
2. **Sync.** Call `syncRoadmap({ roadmapPath, roadmapTasks })` from `sync.mjs`. It flips each `E<num>-<taskId>` token's task line ⬜→✅, recomputes each affected epic heading ⬜→🟡→✅, then **heals** — recomputes every remaining epic heading against its own task body and reports the ones that moved under `healed[]`. It writes the roadmap file only if something changed. It never throws — on any error it returns a no-op result and writes nothing.
3. **Record the phase.** Append `"roadmap-sync"` to `workflow.json → completed` and refresh `updated_at`.
4. **Report.** Emit the `SyncReport` JSON (`{flipped, promoted, healed, skipped, noop, anomalies}`) and append a one-line `roadmap-sync` entry to `.claude/state/harness/<slug>.log` (`flipped=[..] promoted=[..] healed=[..] noop=<bool>`). Surface any `anomalies[]` to the user as non-blocking notes, and name any `healed[]` epic explicitly — a heading that moved for a reason unrelated to this workflow is the one change in the diff the author cannot otherwise account for.

## Steps — the `epic` track

An `epic` workflow has no `roadmap_tasks[]` to flip, so Step 2 calls `backfillEpics({ rootDir, slugs: [slug] })` from `backfill.mjs` instead of `syncRoadmap`:

1. It reads `.claude/state/epic/<slug>.json` and appends `## Epic <N> — <title>  <emoji>  (<slug>)` plus one `- <emoji> <id>. <title>` row per slice.
2. The heading's `(tag)` **is the epic slug**. That is the dedupe key: an epic whose slug already tags a heading is skipped, so the append is idempotent.
3. Each slice row's emoji derives from the epic's `children[]` — `committed` → ✅, any other registered status → 🟡, unregistered → ⬜ — and the heading emoji derives from the rows.
4. The assigned number is stamped back into the epic state as `roadmap_epic`. **This is what closes the loop**: `/triage` reads it when materializing an `epic-child` and seeds that child's `workflow.json → roadmap_tasks: ["E<roadmap_epic>-<sliceId>"]`, so the child's own Phase 10.6 flips its row through the normal `syncRoadmap` path.

## The ad-hoc backfill

Epics that predate this phase have no roadmap section. One idempotent command puts every epic on disk onto the plan:

```
node .claude/skills/roadmap-sync/cli.mjs backfill [--json] [--dry-run] [--slug <epic>] [--root <dir>]
```

It is **not a workflow phase** — it reads state and appends, never blocks a commit, and always exits 0. Run `--dry-run` first to read the report before writing. A second run appends nothing and leaves the file byte-identical.

## Constraints

- **Fail-open, never a gate.** The phase never blocks a commit. Any error, an unset/absent/escaping `roadmap.path`, a missing file, or an unmatched task → no-op, exit 0, commit proceeds.
- **Deterministic, not inferential.** Flip only the tasks named in `workflow.json → roadmap_tasks[]`. Never infer which task shipped from the diff. The heal pass is not an exception: a heading is derived from the task rows already on the page, so recomputing it reads the roadmap rather than guessing at the work.
- **Task rows are the truth; headings are derived.** The heal rewrites a heading to match its body, never the reverse. One case is out of reach by design — `promoteEpicHeading` returns early when the body implies `planned`, so a heading wrongly ✅ over an all-⬜ body stays flagged by the audit and unhealed.
- **Writes only the roadmap file.** Never mutate `workflow.json` beyond the `completed[]` append (Step 3), never write consent tokens or `.claude/state/` beyond the harness log.
- **Preserve the format contract.** Task lines keep exactly one `⬜/🟡/✅`; epic headings keep the `## Epic N — Title  <emoji>  (tag)` em-dash + single-emoji shape (load-bearing for `standup/gather.mjs`). `syncRoadmap` enforces this; do not hand-edit the roadmap here.
- **Advisory `--audit` mode** (`auditRoadmap`) reports heading/task-body inconsistencies + malformed lines; it never mutates. Use it to re-validate the roadmap, not as part of the per-commit path.
