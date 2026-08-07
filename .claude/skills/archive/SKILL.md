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
2. **Render the per-phase timing table FIRST** (before the move, while the consent tokens are still in `.claude/state/`):
   ```
   node .claude/hooks/lib/timing.mjs render <slug>
   ```
   It reads the `phase_timer` stamps at `.claude/state/timing/<slug>.jsonl` plus consent-token mtimes (`spec_approvals/<slug>.approval`, `commit_consent`) and writes a per-phase model-time-vs-human-wait table to `<bundle>/timing.md`. The table is *born in the bundle* (it creates the bundle dir). It must run before Step 4 because the archive script moves `spec_approvals/<slug>.approval` into the bundle — render it first or the approve-direction gate's human-wait reads `n/a`. Best-effort — a missing/sparse timing log yields a header-only table, never an error.

3. **Verify the spec's declared delta against the landed diff with `verifyAndApplyDelta`, then apply only what it confirms** (gated by `memory.architecture_map.enabled`; skip the whole of Steps 3 and 5.5 when false). This is what keeps `docs/system/` true to what is on disk instead of drifting the moment the next cycle ships.

   **It must run before Step 4, for the same reason Step 2 does.** `archive.sh` moves `docs/specs/<slug>.md` into the bundle; after that `resolveSpecPath` returns `null`, the `## System delta` table is never read, and every array below comes back empty — which is byte-identical to a spec that declared nothing. Verify first, or a real drift archives silently green. The `specMissing` field exists to make that failure loud if the order is ever changed back: when it is `true`, the empty arrays mean *the table was not read*, not *the table was clean*.

   ```
   node -e "import('./.claude/skills/workspace/delta.mjs').then(m=>console.log(JSON.stringify(m.verifyAndApplyDelta({slug:'<slug>', specDir:'docs/system', memDir:'.claude/memory', rootDir:process.cwd(), touchedPaths:JSON.parse(process.argv[1])}),null,1)))" '["<path>","<path>",...]'
   ```

   **Pass the paths as one quoted JSON array, never as bare space-separated words.** The repo's default shell is zsh, which does not word-split an unquoted `$VAR`, so a variable holding N paths arrives as a *single* argument containing spaces and matches no anchor. `verifyAndApplyDelta` reports that case as `inputEmpty: true`, distinct from an honest "nothing matched" — but a single quoted argument is immune to word-splitting in both zsh and bash, so pass one and the distinction never has to be read.

   Scope the list to the **governed surface** (`memory.architecture_map.governed_surface`) — its roots, its code extensions, minus its excluded segments and trees. Corpus files under `docs/system/` are the model itself, not governed surface, so a relocation of the corpus contributes no touched paths.

   Read the arrays before moving on. Each names a different thing the operator owes an answer to:

   | Field | Meaning | What to do |
   |---|---|---|
   | `specMissing` | the spec could not be read at all, so no row was ever parsed | the arrays below are not evidence. Check the step order and the slug before believing them |
   | `confirmed` / `applied` | the spec declared it and the diff proves it; the anchor, digest and shard landed | nothing — this is the success path |
   | `drift` | the spec declared it and the diff does **not** confirm it | the row is wrong or the work did not land. Nothing was written for it. Fix the spec or the code |
   | `unclaimed` | the landing touched a governed path no row claims and no element anchors | a coverage gap. Declare it in a `## System delta` row, or accept it deliberately |
   | `skippedGlob` | applied, but glob-anchored, so it earned no digest | expected for a family anchor; a *file* anchor here means the element is unwitnessed |

   Only confirmed rows are written. A declared row the diff cannot confirm applies **nothing** — no anchor appended, no shard, no digest — which is what makes this step evidence rather than a re-stamp. There is no bulk-refresh path: re-stamping untouched elements would make the model permanently green and launder the drift the digest exists to catch.

4. Run the archive script (move-only; it never touches the already-rendered `timing.md`):
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
   | *(generated by Step 2 above, not moved)* | `timing.md` (per-phase model-vs-human-wait table) |

   Note that `docs/specs/<slug>.md` leaves its source location here. Anything that needs to read the spec runs before this step, not after — that is why Step 3 sits where it does.

5. **Do NOT move `workflow.json`.** `/commit` archives it as its first step so the phase ordering is preserved until the end.

5.5. **Report corpus health, and repair nothing** (same flag gate as Step 3; skip when false):

   ```
   node -e "import('./.claude/skills/system-reconcile/reconcile-report.mjs').then(m=>console.log(JSON.stringify(m.runReconcile({specDir:'docs/system', rootDir:process.cwd()}),null,1)))"
   ```

   This invocation is **report-only**. Surface the seven sections to the user; repair nothing here. `docs/system/` SHALL be byte-identical between Step 3 completing and the workflow ending — Step 3 is the corpus's single writer on the primary tree, and `/system-reconcile` exposes no apply path a workflow phase can reach. A repair the report suggests is a human-confirmed invocation of `/system-reconcile`, never an automatic follow-up to archiving.

6. Append `"archive"` to `workflow.json → completed`.
7. Tell the user: "Archived to `docs/archive/<date>/<slug>/`. Ready for `/grant-commit` → `/commit`." Include any non-empty `drift` or `unclaimed` from Step 3 and the Step 5.5 report — an unread gap report is the same as no gap report. A `specMissing: true` from Step 3 is reported too, and it invalidates the other arrays rather than joining them.

## Constraints

- **Never archive a workflow in-flight.** If the user runs `/archive` before the workflow is done (integrate/document not complete), refuse and tell them which phase is missing.
- **Never delete artifacts.** Move-only. If a target file already exists in the bundle (re-run), refuse and tell the user to pick a new archive date or remove the conflict.
- **Idempotent on partial failure**: if the script moves 3 of 5 files and then fails, re-running continues from where it stopped (the moved files are gone from source, the un-moved are still at source).
