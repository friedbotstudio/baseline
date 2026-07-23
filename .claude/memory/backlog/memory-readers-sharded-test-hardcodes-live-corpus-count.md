---
key: memory-readers-sharded-test-hardcodes-live-corpus-count
category: backlog
scope: [tests, standup, memory]
status: open
raised-on: 2026-07-23
raised-in-context: rightsize-gate-fix
source: assistant-deferral
estimated-effort: tiny
verified-at: faa3ca9
last-touched: 2026-07-23
---

> verbatim (assistant, 2026-07-23):
> "tests/memory-readers-sharded.test.mjs asserts a hardcoded 16 backlog shards but the live corpus has 14 (it reads the real .claude/memory/backlog via copyLiveCorpus); the assertion drifts every time the backlog count changes."

- Intent: fix the sole standing failure in `node --test tests/*.test.mjs` — `test_when_sharded_backlog_then_gather_returns_all_entries_with_parent_nesting` in `tests/memory-readers-sharded.test.mjs:106` asserts `total === 16`, but the live `.claude/memory/backlog/` shard dir currently holds **14** entries. The test copies the **live** corpus (`copyLiveCorpus`), so the hardcoded literal drifts every time the backlog grows or shrinks (entries closed by `/memory-flush` change the count).
- Fix: derive the expected count **dynamically** from the fixture (e.g. count `.md` files actually copied into the temp corpus), not a hardcoded `16`. A literal count of a mutable live dir is the defect.
- Discovered during `rightsize-gate-fix` (2026-07-23) as a **pre-existing, unrelated** red test — it is NOT in that workflow's diff (`.claude/skills/harness/rightsize-gate.mjs`, `SKILL.md`, `tests/rightsize-gate.test.mjs`). The binding `test.cmd` (the structural audit) is unaffected, so it did not block the landing.
- Family: same "instrument coupled to a mutable live count" shape as the standup reader blindness class.
