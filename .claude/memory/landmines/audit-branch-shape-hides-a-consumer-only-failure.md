---
key: audit-branch-shape-hides-a-consumer-only-failure
category: landmines
load_bearing: true
scope: []
governs: .claude/skills/audit-baseline/checks/**, .claude/skills/audit-baseline/expected-baseline.mjs, scripts/build-template.sh
verified-at: 7d7039c
last-touched: 2026-08-26
---

- **The trap.** `checks/memory.mjs` has two branches. The sharded branch validates category directories and never walks loose `.md` files; the flat branch rejects any file outside `EXPECTED_MEMORY_FILES`. This dev repo migrated to the sharded shape, so it runs the first branch. `scripts/build-template.sh` ships a **flat** store, so every consumer install runs the second. A change that only the flat branch can see is invisible to this repo's own green suite.
- **Observed 2026-08-26.** `/memory-sync` Step 4.5 creates `_discard-ledger.md` on the first flush, and build-template.sh line 190 excludes it from the shipped template. The first flush in any install therefore produced `unexpected: ["_discard-ledger"]` and turned the audit permanently red. It reached us from a user's `/upgrade-project` report, not from CI.
- **How to avoid it.** When you change anything the audit reads about the memory store, run it against a **flat** tree before believing the suite: copy `obj/template` somewhere, add whatever runtime file the change concerns, and run `CLAUDE_PROJECT_DIR=<copy> node <copy>/.claude/skills/audit-baseline/audit.mjs`. A green run in this repo says nothing about the branch consumers execute.
- **The fix shape, when a file is created at runtime.** It goes on `OPTIONAL_MEMORY_FILES`, never `EXPECTED_MEMORY_FILES` — EXPECTED means required-present, so listing it there trades an `unexpected` failure for a `missing` one on any install that has not flushed yet. Keep the roster a literal Set rather than a pattern; that is what bounds the widening.
- **General shape.** Two on-disk shapes for one artifact, with the dev repo on one and every consumer on the other, means the suite covers the branch nobody ships. Same class as [[discard-ledger-is-inert-until-memory-sync-step-4-5-runs]]: the reading half was correct and the failure lived entirely in what never got exercised.
