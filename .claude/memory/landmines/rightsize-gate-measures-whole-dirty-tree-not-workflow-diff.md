---
key: rightsize-gate-measures-whole-dirty-tree-not-workflow-diff
category: landmines
scope: [tdd, chore, integrate]
verified-at: faa3ca9
last-touched: 2026-07-23
superseded-at: 2026-07-23
---

- **RESOLVED 2026-07-23 (workflow `rightsize-gate-fix`).** Both defects fixed in `.claude/skills/harness/rightsize-gate.mjs`: `check` now excludes `tdd.test_globs` rows (D1) and `workflow.json → rightsize_base[]` rows (D2, the first-arm dirty-path snapshot), and it reads `project.json` from disk (previously the CLI path used config DEFAULTS, so `test_globs` was `[]` and D1 was inert). The reusable lesson lives on in [[cli-mjs-invoked-bare-uses-config-defaults-unless-it-reads-project-json]]. Kept for one flush cycle for traceability; Step 0a auto-closes it via `superseded-at`.

- **CORRECTION 2026-07-20 — this entry's title under-describes the defect, and the dirty-tree cause is only half of it.** Re-run on a **clean** tree (`chore-archive-node`, immediately after commit `40057f8`) the gate STILL refused to skip: `{"skip":[],"keep":["simplify","security","document"],"measured":{"files":4,"lines":129}}`. Of those 129 lines, **2** were the behavior change (one JSONL node per file); the rest were the test proving it and the fixture. The gate counts **test lines** toward a threshold meant to gauge change *risk*, so writing a thorough test makes the gate MORE conservative — backwards, and self-defeating under TDD discipline where every change ships with tests.
- **It has never fired.** Swept every `workflow.json` in `docs/archive/**`: not one records a `rightsize-gate` entry in `auto_skipped[]`. `velocity.rightsize.max_lines` is 80; a TDD-disciplined change essentially never lands under 80 total lines. Velocity Lever 2 has been inert since it shipped, which is why nobody noticed either bug — an oracle that always says "keep everything" is indistinguishable from no oracle at all.
- Fix both together: exclude paths matching `project.json → tdd.test_globs` from the measurement (the classifier already exists), AND scope the measurement to the workflow's own diff rather than the whole dirty tree. Either alone leaves the gate broken. Tracked: [[rightsize-gate-counts-test-lines-and-never-fires-4b7e]].

- Path: `.claude/skills/harness/rightsize-gate.mjs` — the post-`tdd` oracle the harness consults to auto-skip a hard subset of `{simplify, document}` (velocity Lever 2, `velocity.rightsize.enabled`).
- Trap: it measures the **entire dirty working tree**, not the diff this workflow produced. Any unrelated file left uncommitted — a memory shard from a prior `/memory-flush`, a stray scratch file, a doc from an earlier session — inflates its `measured.files` / `measured.lines` and pushes the change over `velocity.rightsize.max_lines` (default 80), so the gate refuses to skip anything and the full ceremony runs on a change that did not warrant it.
- Live instance (`timing-instrument-repair`, 2026-07-19): the real diff was **48 insertions in one source file** plus tests. The gate reported `{"skip":[],"keep":["simplify","security","document"],"measured":{"files":5,"lines":267}}` because `touched[]` included two untracked `.claude/memory/` shards written by an earlier `/memory-flush` in the same session. The one mechanism that exists to prevent over-ceremony was defeated by unrelated files, on exactly the workflow the user then flagged as over-engineered.
- Mitigation until fixed: before trusting a `keep`-everything verdict, check `measured.touched[]` against the workflow's actual write set. A clean tree at workflow start makes the gate trustworthy; a dirty one makes it conservative-by-accident. Committing or stashing unrelated work before `/tdd` is the cheap prophylactic.
- Why it is fail-safe-but-wrong: the gate erring toward `keep` never skips a phase that should have run, so it cannot cause a correctness failure — only wasted calendar and tokens. That is why it can sit undetected: its failure mode is silent over-work, not a broken build.
- Family: same class as [[phase-timer-collapses-phases-appended-in-one-workflow-json-write]] and the `standup` reader blindness — an instrument that reports confidently while measuring the wrong thing.
