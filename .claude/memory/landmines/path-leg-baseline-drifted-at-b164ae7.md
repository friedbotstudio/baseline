---
key: path-leg-baseline-drifted-at-b164ae7
category: landmines
scope: [tdd, integrate]
governs: tests/memory-scope-store-invariants.test.mjs,.claude/hooks/lib/governed-memory.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- **The trap.** `tests/memory-scope-store-invariants.test.mjs → test_when_path_leg_measured_then_governs_hit_counts_unchanged` FAILS on a clean tree at HEAD `b164ae7`. `PATH_LEG_BASELINE` expects 10 governed hits for `.claude/skills/memory-index/resolve.mjs`; the live store returns 11. The extra hit is `constraints/zero-runtime-dependencies`.
- **Why it was already wrong when written.** The `constraints` category landed in the SAME commit as the baseline, so the pinned number was stale the moment it was committed. Nothing has drifted since; the pin never matched.
- **Why this entry exists.** A workflow that touches nothing under `.claude/memory/` will still see this red at `/integrate` and burn a cycle deciding whether it caused it. It did not.
- **How to prove it is not yours, in one step.** `git worktree add --detach <tmp> HEAD`, run the single file there, watch it fail identically, then `git worktree remove --force <tmp>`. Do NOT use `git stash` or `git checkout -- <path>` — `git_commit_guard`'s `FORBIDDEN_RE` hard-blocks worktree path-discard.
- **The fix, when someone owns that file.** Re-measure all four `PATH_LEG_BASELINE` entries and re-pin. **Do NOT widen the assertion into a range or a `>=`** — the whole value of the pin is that a hit-count change is loud. A quiet baseline is the same defect one layer up.
- **Related.** [[a-check-that-measured-nothing-reports-success]] is the same family from the other side: there a check silently measures nothing, here a check loudly measures the wrong constant.
