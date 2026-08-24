---
key: a-checker-aimed-one-axis-off-passes-loudly
category: landmines
load_bearing: true
scope: [spec, scenario, implement, simplify, integrate]
governs: tests/**, .claude/skills/**
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Landmine: **this baseline's recurring failure is not a missing checker. It is a checker that exists, is loud, passes, and is aimed one axis off the thing that breaks.** A green result from an adjacent axis reads as coverage, so nobody looks again.

**Seven instances, measured across the `consumer-install-defects` and `diagram-shard-rewrite-loses-fields` cycles (79e41cb, be0a351):**

| Checker | Axis it checks | Axis that broke |
|---|---|---|
| `test_when_backfilled_shard_is_rewritten_from_its_own_arguments_then_bytes_identical` | writer round-trips a FULLY-supplied call | a caller that omits fields |
| `test.cmd` verify contract | the command exits 0 | whether it executes any of the suite |
| `readme-gate.mjs` | the directory-count table, backticked field names | the subcommand count in the same file |
| `writeConstraint` | the category is registered (`UnregisteredCategoryError`) | the entry's content survives the write |
| `drift_check` | an AC id appears in an added line | whether that line is the covering one |
| `rightsize-gate` | the base list and the diff are compared | the two use different path vocabularies |
| `no-jvm-available` | the entry names its own re-verify command | nothing ever ran it |

**The sharpest one, because it was well-built and still blind.** A corpus-wide idempotence test read every live shard's four arguments back out, passed all four into `writeDiagramShard`, and asserted byte-equality. It was green for months and could never have caught the defect: it proved WRITER round-trips WRITER, while the loss came from CALLER under-supplying. The pair was wrong, not the technique.

- **The check that catches this class:** for any assertion you rely on, name the two things it proves agree, then name the two things that actually have to agree. When those pairs differ, the assertion is decoration. Write the pairs down; the mismatch is invisible while the test is green.
- **Corollary — a loud guard on one axis reads as care on every axis.** `writeConstraint` throws a named error class for an unregistered category and silently destroys the entry body. The visible rigour on axis A is what stops anyone asking about axis B.
- **Corollary — a self-describing oracle nobody runs is not an oracle.** The `no-jvm-available` entry carried `Re-verification: run java -version` and was false for an unknown number of months. An instruction is not a check.
- Related: [[anti-drift-tests-compare-against-the-live-oracle-b4d2]] is the sub-case where the two things are a literal and a live count. This entry is the general form.
- **Not** the same as [[a-wide-governs-glob-ripples-into-unrelated-literals]], though this entry's own `governs:` glob produced that one. There, every checker is aimed correctly and reports honestly; what surprises is the blast radius of a declaration. Aim the checker for this entry; narrow the glob for that one.
- Related: [[a-synthesizing-writer-erases-fields-its-arguments-cannot-carry]] is the instance that cost the most (19 shards).
