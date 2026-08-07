---
key: epic-child-reverifies-the-epics-whole-system-delta-section
category: landmines
scope: [archive, spec, triage]
governs: .claude/skills/workspace/delta.mjs
load_bearing: true
verified-at: 9235a23
last-touched: 2026-08-07
---

- Path: `/archive` Step 5 → `delta.verifyAndApplyDelta`, on any `epic-child` track.
- Landmine: **an epic's `## System delta` is one spec-level section, so every child re-verifies all of it — and a row a sibling already landed reports as `drift` for every child that follows.** The drift array is not evidence of a defect in the landing that reported it.

**Measured 2026-08-07, epic `system-spec-delta` slice D.** `verifyAndApplyDelta` returned `drift: [{verb: "add", elementId: "system-reconcile-report", anchor: ".claude/skills/system-reconcile/*.mjs", ...}]` with `confirmed: []`, `applied: []`, `unclaimed: []`. That row is **slice B's**, and it landed in commit `db121a1` — `docs/system/elements/system-reconcile-report.md` is on disk with its anchor and its shard. Slice D's diff touches one governed path (`.claude/skills/workspace/shards.mjs`) and nothing under `.claude/skills/system-reconcile/`, so the row cannot be confirmed from that diff and correctly falls to `drift`. Nothing was written, which is the design working. What is wrong is the *reading*: the operator sees a non-empty `drift` and reaches for a fix that does not exist.

**Why it repeats.** The child's spec pin is `docs/specs/<epic>.md#slice-<id>`, and `1db3b6c` taught the resolver to scope the AC scan to the named `## Slice <id>` section. `## System delta` is **not** inside any slice section — it sits at spec level, above them all. So the slice-scoping that fixed the AC path does not reach the delta path. Slices E and F of this epic will each report the same row.

**How to tell a false positive from a real one, in one step.** Take the row's `elementId` and run `git log --oneline -1 -- docs/system/elements/<id>.md`. A commit that is not this workflow's means a sibling already landed it — the row is stale for this child, not drifted. An empty result means the element genuinely never landed, and that is a real `drift`.

**The signal that still matters on an epic-child is `unclaimed`, not `drift`.** `unclaimed` is computed from *this* landing's touched paths, so it is correctly scoped per child and a non-empty value is always a real coverage gap. On slice D it was `[]` because `shards.mjs` already falls under the `workspace-corpus` element's glob anchor.

- Mitigation: read `drift` on an epic-child as advisory and confirm each row against `git log` before acting. Do not "fix" the spec by deleting a row a sibling legitimately landed — the row is the epic's record of what the epic added, and the next child needs it as much as this one did.
- Real fix: scope delta verification per child the way `1db3b6c` scoped the AC scan — either move the delta rows into their owning `## Slice <id>` sections, or have the resolver filter rows to those whose anchor intersects the child's touched paths. Either makes `drift` mean the same thing on a child that it means on a solo track.
- Sibling: [[drift-check-does-not-resolve-epic-child-pinned-specs]] is the same seam one layer over — a check that reads an epic-child's contract from the wrong scope. That one failed open (vacuous green); this one fails loud (spurious drift), which is the better failure but still costs a read.
