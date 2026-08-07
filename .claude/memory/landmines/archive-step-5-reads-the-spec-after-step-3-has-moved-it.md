---
key: archive-step-5-reads-the-spec-after-step-3-has-moved-it
category: landmines
scope: [archive, spec, integrate]
source: inferred-from-code
verified-at: 704befc
last-touched: 2026-08-07
---

- **`/archive` Step 5 cannot read the spec it is supposed to verify, because Step 3 already moved it.** `verifyAndApplyDelta` (`.claude/skills/workspace/delta.mjs:286`) resolves the spec via `resolveSpecPath({rootDir, slug})`, which looks at `docs/specs/<slug>.md`. `archive.sh` (Step 3) `git mv`s that file to `docs/archive/<date>/<slug>/spec.md` first. `resolveSpecPath` then returns `{path:null, rel:null}` and the whole `## System delta` table goes unread.
- **The failure is silent and looks like success.** All four result arrays come back empty — `confirmed: []`, `drift: []`, `unclaimed: []` — which is byte-identical to the output for a spec that declared no delta at all. `inputEmpty` stays `false` because the *touched paths* argument was fine; only the spec was missing. A row the diff could not confirm would archive green, which is precisely the drift Step 5 exists to catch.
- **Observed 2026-08-07 (`ship-baseline-output-style`).** The spec declared one row (`change | src-templates | src/*.json`). First run: all-empty. Re-run against a temporary copy of the archived spec: `confirmed: [src-templates]`, `applied: [src-templates]`, `shardsWritten: [diagrams/src-templates.puml]`, `skippedGlob: [src-templates]`. Same tree, same touched paths, opposite verdict.
- **The SOP already knows this hazard for a sibling step and does not know it here.** Step 2 carries an explicit warning that it must run before Step 3 or the approval token is gone from `.claude/state/spec_approvals/`. Step 5 has the identical dependency on a Step-3-moved file and carries no such warning.
- **Workaround if you hit it now:** `cp` the archived `spec.md` back to `docs/specs/<slug>.md`, re-run `verifyAndApplyDelta`, then delete the copy and confirm the tree is clean. Do not `mv` — the bundle copy is the artifact.
- **Real fix, either one:** order Step 5 before Step 3 in `.claude/skills/archive/SKILL.md`, or give `resolveSpecPath` an archive-bundle fallback. Ordering is the smaller change and matches the Step 2 precedent.
- **How to tell the two empties apart in future:** an all-empty result on a spec you know declared rows means the spec was unreadable, not that nothing matched. Check `resolveSpecPath` before believing the arrays. Related: [[epic-child-reverifies-the-epics-whole-system-delta-section]].
