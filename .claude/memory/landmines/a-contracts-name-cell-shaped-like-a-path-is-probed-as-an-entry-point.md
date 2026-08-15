---
key: a-contracts-name-cell-shaped-like-a-path-is-probed-as-an-entry-point
category: landmines
load_bearing: true
scope: [spec, tdd, integrate]
governs: docs/specs/**, .claude/skills/tdd/**, .claude/skills/spec/**
verified-at: 18204a1
last-touched: 2026-08-15
---

- **The trap.** `drift_check.mjs → probeRunnable` (`.claude/skills/tdd/drift_check.mjs:276`, called at :307) treats any Contracts row whose **Name** cell looks like a path as an **invocation entry point** and tries to run it. A library function written as `` `append.mjs → nextEpicNumber` `` is not runnable, so the row lands as unresolved and `drift_check` exits 1. The row is correct English and wrong grammar.
- **The fix is a cell move, not a rename.** Put the module in the **Kind** cell (`Fn (append.mjs)`) and the bare symbol in **Name** (`` `nextEpicNumber` ``). Reserve a path-shaped Name for a row that genuinely is an entry point, e.g. `` `.claude/skills/roadmap-sync/cli.mjs backfill` ``.
- **Why it is expensive rather than annoying.** Drift runs at the END of `/tdd`, long after gate A. Amending the spec to fix the rows changes its bytes, so `computeSpecContentHash` no longer matches the approval token and the harness **re-yields at gate A** (`harness/SKILL.md` → "Gate-A content re-check on resume"). Measured this cycle: hash `2ab8f544` → `6cfe6423`, `approve-direction` removed from `completed`, and a second human approval bought nothing but a formatting correction. Eight rows were wrong in one spec.
- **Check it at spec time, when it is free.** Read every Contracts Name cell before gate A and ask of each: would running this as a command make sense? If not, it belongs in Kind.
- Related: [[a-hand-rolled-cli-parser-fails-the-same-runnable-contract]] is the other half of the same probe, on the implementation side rather than the spec side.
- Instance of [[a-checker-aimed-one-axis-off-passes-loudly]] inverted: here the checker is aimed correctly and the *authored input* is in the wrong shape. The cost still lands at the end of the cycle.
