---
key: a-wide-governs-glob-ripples-into-unrelated-literals
category: landmines
scope: [memory-sync]
governs: .claude/memory/README.md, tests/memory-scope-store-invariants.test.mjs
verified-at: 69c3259
last-touched: 2026-08-19
---

- Landmine: **a memory entry's `governs:` glob is cheap to author and expensive later. Every census that intersects it moves, and the cost is paid by whoever re-measures those literals in a workflow that had nothing to do with the entry.**

**Measured 2026-08-13.** `/retrospective` filed one landmine carrying `governs: tests/**, .claude/skills/**` and `scope: [spec, scenario, implement, simplify, integrate]`. That single entry moved three separate literals in `tests/memory-scope-store-invariants.test.mjs`:

| Literal | Moved | Which leg |
|---|---|---|
| `PHASE_BUDGETS.spec` | 68 → 69 | phase leg — the entry is spec-scoped |
| `PATH_LEG_BASELINE['…/memory-index/resolve.mjs']` | 11 → 12 | path leg — `.claude/skills/**` covers it |
| `PATH_LEG_BASELINE['…/harness/checker-fanout.mjs']` | 8 → 9 | path leg — same glob |

The suite went red in the NEXT workflow's verify tick, on a ticket about drift-check that had nothing to do with memory scoping.

- **This is not [[a-checker-aimed-one-axis-off-passes-loudly]].** That one is about a check pointed at the wrong axis. Here every check is aimed correctly and reports honestly; what surprises is the blast radius of a declaration. Filed separately because the fix differs: aim the checker there, narrow the glob here.
- **Before writing a `governs:`, ask what it intersects.** `.claude/skills/**` covers ~345 modules and every path-leg literal under them. Name the module or the directory that actually needs the entry surfaced, not the tree it happens to sit in. The path leg exists to surface a fact when someone edits a governed file — a glob that governs everything surfaces it nowhere useful and moves every count on the way.
- **Corollary for the reviewer.** A census literal going red in a workflow that never touched memory is a signal to look at the last `/memory-sync`, not at the ticket in front of you. Three of the four census corrections in the 2026-08-12/13 session had that shape.
- Related: [[anti-drift-tests-compare-against-the-live-oracle-b4d2]] (why the literals exist at all) and [[census-and-budget-are-different-numbers]] (how to repair one when it moves).
