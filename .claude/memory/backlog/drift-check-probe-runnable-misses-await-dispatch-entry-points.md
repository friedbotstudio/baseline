---
key: drift-check-probe-runnable-misses-await-dispatch-entry-points
category: backlog
scope: [tdd]
governs: .claude/skills/tdd/drift_check.mjs
status: picked-up
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: standup-remote-freshness
verified-at: c53a121
last-touched: 2026-08-13
superseded-at: 2026-08-14
---

> I recommend **A**, taken as a separate chore after this workflow lands — the fix is one regex, but folding it in now expands a write set you approved and puts an unrelated change in this diff.

- Defect: `probeRunnable` at `.claude/skills/tdd/drift_check.mjs:294` accepts a file as runnable only on `import.meta.url ===`, `process.argv[1]`, `require.main === module`, or `/^(?:dispatch|main|run)\s*\(/m`. The line anchor means `await dispatch({...})` reads as not-runnable, so a working CLI front door scores `unresolved` on a spec's Contracts row.
- Measured 2026-08-13: **2 of 11** `.claude/skills/*/cli.mjs` fail the current regex (`standup`, `spec`); **0 of 11** fail with `(?:await\s+)?` added. Both were confirmed runnable by execution (`recap --remote` and `--help` exit 0).
- Fix: one regex, plus a live-oracle test asserting every shipped `.claude/skills/*/cli.mjs` probes `runnable`. The relational test is the half that matters — a fixture-only test leaves the same hole one entry-point shape over. The existing fixture at `tests/drift-check-contracts.test.mjs:117` writes `dispatch({...})` WITHOUT `await`, which is why the suite is green against a broken probe.
- Do not broaden further (leading whitespace, `void`, `return`). The line anchor is deliberate: it stops an incidental `run(` deep in a file reading as an entry point. `await` is the one prefix with evidence behind it.
- Human accepted the false positive twice (`workflow.json → accepted_findings`, passes 1 and 2) and directed the follow-up as track `tdd-quickfix`, slug `drift-check-await-entry-point`.
