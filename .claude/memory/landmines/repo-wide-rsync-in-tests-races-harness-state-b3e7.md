---
key: repo-wide-rsync-in-tests-races-harness-state-b3e7
category: landmines
scope: [integrate, tdd]
source: assistant-deferral
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 60c5aeb
last-touched: 2026-08-10
governs: tests/upgrade-project.test.mjs, .claude/state/.harness_active
---

> The marker did vanish during the run, and the test passed anyway. That is the fix proving itself, not luck.

- **The trap.** A test that rsyncs the live repo into a temp dir must exclude `.claude/state/`. The harness creates and deletes `.claude/state/.harness_active` at every phase boundary; when it vanishes between rsync's file enumeration and its open, rsync exits non-zero and the test throws `rsync failed: … .harness_active: No such file or directory`.
- **Why it looks like a flake and is not.** It fires precisely when the suite runs from inside a live `/harness` workflow — which is exactly what `/integrate` does. Across three full-suite runs in one workflow it failed, passed, failed, tracking nothing but marker churn. Re-running until green is the tempting response and the wrong one; the race stays armed for the next workflow.
- **The fix** is one line in the exclude list: `'--exclude=.claude/state',` alongside `--exclude=obj` and `--exclude=.config`. Runtime state is never an input to a manifest built from the shipped template.
- **Confirming it rather than assuming it.** Re-run the full suite with the marker deliberately armed (`echo "<slug>" > .claude/state/.harness_active`) so the race gets a real chance to fire. A green run with the marker absent proves nothing.
- **The general rule.** Any helper that copies, hashes, or walks the repo wholesale is exposed to `.claude/state/` churn. Exclude it by default; nothing under it is ever a build input.
