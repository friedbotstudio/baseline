---
key: archive-step-5-reads-the-spec-after-step-3-has-moved-it
category: landmines
scope: [archive, spec, integrate]
source: inferred-from-code
verified-at: 6fdd6ee
last-touched: 2026-08-07
---

> **STATUS: FIXED 2026-08-07.** The bullets below describe the defect as it stood; the fix and the surviving lesson are at the bottom. Kept rather than deleted so the next reader does not rediscover and re-fix it.

- **(historical) `/archive` Step 5 could not read the spec it was supposed to verify, because Step 3 had already moved it.** `verifyAndApplyDelta` (`.claude/skills/workspace/delta.mjs:286`) resolves the spec via `resolveSpecPath({rootDir, slug})`, which looks at `docs/specs/<slug>.md`. `archive.sh` (Step 3) `git mv`s that file to `docs/archive/<date>/<slug>/spec.md` first. `resolveSpecPath` then returns `{path:null, rel:null}` and the whole `## System delta` table goes unread.
- **The failure is silent and looks like success.** All four result arrays come back empty — `confirmed: []`, `drift: []`, `unclaimed: []` — which is byte-identical to the output for a spec that declared no delta at all. `inputEmpty` stays `false` because the *touched paths* argument was fine; only the spec was missing. A row the diff could not confirm would archive green, which is precisely the drift Step 5 exists to catch.
- **Observed 2026-08-07 (`ship-baseline-output-style`).** The spec declared one row (`change | src-templates | src/*.json`). First run: all-empty. Re-run against a temporary copy of the archived spec: `confirmed: [src-templates]`, `applied: [src-templates]`, `shardsWritten: [diagrams/src-templates.puml]`, `skippedGlob: [src-templates]`. Same tree, same touched paths, opposite verdict.
- **The SOP already knows this hazard for a sibling step and does not know it here.** Step 2 carries an explicit warning that it must run before Step 3 or the approval token is gone from `.claude/state/spec_approvals/`. Step 5 has the identical dependency on a Step-3-moved file and carries no such warning.
- **FIXED 2026-08-07 (`archive-delta-ordering`). The key names the OLD step numbers; do not go looking for the defect at them.** Both halves of the recommended fix landed:
  - The SOP was reordered. Delta verification is now **Step 3**, ahead of the `archive.sh` move at **Step 4**, and carries an explicit before-the-move warning mirroring the one Step 2 already had. Old Step 3 → 4, old Step 4 → 5. Step 5.5 keeps its number because `tests/system-spec-delta-archive-verify.test.mjs` asserts a literal `5.5` marker.
  - `verifyAndApplyDelta` now returns **`specMissing`**, true when the spec could not be read at all — either `resolveSpecPath` returned null or `readSourceText` returned null. It is the sibling of `inputEmpty` and appears on every return path, so the field is never `undefined`. A structural test pins the step order, so a silent regression fails a test rather than an archive.
- **The lesson outlives the fix.** An all-empty verdict still needs a reason attached before it is believed. `specMissing: true` means the table was never parsed; the empty arrays are not evidence of a clean delta. `/archive` Step 3's results table now leads with that row for the same reason.
- The reorder was proven by the structural test, not by the workflow that landed it: `archive-delta-ordering` ran on a `tdd-quickfix` track with no spec at all, so Step 3 and Step 4 could not race there. The first spec-track archive after this is what exercises both together.
- Related: [[epic-child-reverifies-the-epics-whole-system-delta-section]], and the brittleness of the ordering test itself is tracked at [[archive-ordering-test-keys-on-prose-mentions-4b7c]].
