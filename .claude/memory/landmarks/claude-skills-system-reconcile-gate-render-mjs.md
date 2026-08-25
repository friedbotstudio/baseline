---
key: .claude/skills/system-reconcile/gate-render.mjs
category: landmarks
scope: [tdd, chore]
verified-at: 290a41b
last-touched: 2026-08-25
governs: .claude/skills/system-reconcile/gate-render.mjs,.claude/skills/system-reconcile/cli.mjs
---

- Role: Foundation layer for the `/archive` Step 5.5 corpus gate. Turns a `reconcile-report` corpus report into the lines an operator reads: `countRows`, `memberLabel`, `gateVerdict`.
- **Why it is a separate file.** `cli.mjs` calls `dispatch(...)` at module scope, so importing it executes the CLI and prints usage. A renderer nothing can import is a renderer nothing can test, and the security fix below needed a test.
- `memberLabel` clips every value through `.claude/skills/lib/terminal-text.mjs`. The members are element ids, `element_id`s and shard paths read from `docs/system/`; that header names the exact impact of leaving them raw — an erase-line escape "wipes the line printed above it and forges a passing row", so a crafted record could show a reader a `GATE PASSED` line the gate never emitted. Security review 2026-08-25, MEDIUM, CWE-150, fixed in the same cycle.
- Guarded by `tests/archive-corpus-gate.test.mjs` — control bytes inert, a 5,000-character id bounded under 200 chars, and a structural assertion that this file imports the shared sanitizer.
- Caveat: this module renders; it never decides. `gatingFailures` in `reconcile-report.mjs` is the verdict, and `gaps` is reported and never gates because two gaps pre-date the rule.
