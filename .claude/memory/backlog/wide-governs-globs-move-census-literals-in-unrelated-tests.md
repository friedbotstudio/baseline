---
key: wide-governs-globs-move-census-literals-in-unrelated-tests
category: backlog
scope: [memory-sync, tdd]
governs: .claude/memory/**
status: picked-up
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: cost
verified-at: e36bcb9
last-touched: 2026-08-13
superseded-at: 2026-08-14
---

> Assertions pin exact counts derived from the live memory store, while 45 memory entries carry a ** glob in governs:, so any flush that adds one broadly-scoped entry moves counts in files it has nothing to do with.

- Measured 2026-08-13: `PHASE_BUDGETS.spec` actual 73 vs cap 71; PATH_LEG_BASELINE drift on four paths (scoped-memory 9 was 8, memory-index/resolve 16 was 12, process_lifecycle_guard 9 was 8, checker-fanout 13 was 9). 45 entries carry a `**` glob.
- The repair splits by kind: the path leg is a CENSUS (re-measure, name the commit). `PHASE_BUDGETS.spec` is a BUDGET (re-measuring to 73 makes a zero-headroom tripwire).
- Relates to [[a-wide-governs-glob-ripples-into-unrelated-literals]], [[census-and-budget-are-different-numbers]]. RCA AI-04 and AI-05.
