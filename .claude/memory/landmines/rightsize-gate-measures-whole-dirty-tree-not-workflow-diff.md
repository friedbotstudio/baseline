---
key: rightsize-gate-measures-whole-dirty-tree-not-workflow-diff
category: landmines
scope: [tdd, chore, integrate]
verified-at: f36b142
last-touched: 2026-07-19
---

- Path: `.claude/skills/harness/rightsize-gate.mjs` — the post-`tdd` oracle the harness consults to auto-skip a hard subset of `{simplify, document}` (velocity Lever 2, `velocity.rightsize.enabled`).
- Trap: it measures the **entire dirty working tree**, not the diff this workflow produced. Any unrelated file left uncommitted — a memory shard from a prior `/memory-flush`, a stray scratch file, a doc from an earlier session — inflates its `measured.files` / `measured.lines` and pushes the change over `velocity.rightsize.max_lines` (default 80), so the gate refuses to skip anything and the full ceremony runs on a change that did not warrant it.
- Live instance (`timing-instrument-repair`, 2026-07-19): the real diff was **48 insertions in one source file** plus tests. The gate reported `{"skip":[],"keep":["simplify","security","document"],"measured":{"files":5,"lines":267}}` because `touched[]` included two untracked `.claude/memory/` shards written by an earlier `/memory-flush` in the same session. The one mechanism that exists to prevent over-ceremony was defeated by unrelated files, on exactly the workflow the user then flagged as over-engineered.
- Mitigation until fixed: before trusting a `keep`-everything verdict, check `measured.touched[]` against the workflow's actual write set. A clean tree at workflow start makes the gate trustworthy; a dirty one makes it conservative-by-accident. Committing or stashing unrelated work before `/tdd` is the cheap prophylactic.
- Why it is fail-safe-but-wrong: the gate erring toward `keep` never skips a phase that should have run, so it cannot cause a correctness failure — only wasted calendar and tokens. That is why it can sit undetected: its failure mode is silent over-work, not a broken build.
- Family: same class as [[phase-timer-collapses-phases-appended-in-one-workflow-json-write]] and the `standup` reader blindness — an instrument that reports confidently while measuring the wrong thing.
