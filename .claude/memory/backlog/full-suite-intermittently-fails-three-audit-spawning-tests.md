---
key: full-suite-intermittently-fails-three-audit-spawning-tests
category: backlog
status: open
raised-on: 2026-08-05
raised-in-context: architecture-map
source: assistant-deferral
verified-at: 35212e8
last-touched: 2026-08-05
---

> "The first full-suite run after these edits reported 3 failures. Three subsequent runs are clean at 2199 pass / 0 fail. I didn't capture the failing names, so I can't tell you what they were." — later captured, second occurrence.

- `npm test` intermittently reports exactly **3 failures**, always the same tests, all of which spawn `node .claude/skills/audit-baseline/audit.mjs` as a subprocess and assert exit 0:
  - `tests/article-ii-advisory-subagents.test.mjs → test_when_full_change_then_audit_baseline_passes`
  - `epic-close governance — counts + mirror (AC-007) → test_when_audit_baseline_runs_then_it_passes`
  - `the baseline audit stays green after the batch → test_when_audit_baseline_runs_then_it_exits_zero`
- Observed **twice** on 2026-08-05, the first time BEFORE any change in that batch — so it is not attributable to the `architecture-map` work. Both times the next run was clean.
- Ruled out: each failing file passes in isolation (6/6); `audit.mjs` standalone exits 0 with no FAIL rows; **8 concurrent `audit.mjs` invocations produced 0 non-zero exits**, so naive parallel contention is not the mechanism.
- Not yet captured: the audit's own stdout/stderr from *inside* a failing run. `execFileSync` throws and the reporter truncates the payload, so the actual complaint is still unknown. That is the next diagnostic step — wrap the spawn and dump `e.stdout`/`e.stderr` to a file.
- Why it matters: this is a CI-red risk on a suite that is otherwise deterministic, and a flaky gate trains people to re-run rather than read.
