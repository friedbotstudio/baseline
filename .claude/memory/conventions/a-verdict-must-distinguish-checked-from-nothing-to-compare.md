---
key: a-verdict-must-distinguish-checked-from-nothing-to-compare
category: conventions
scope: [spec, tdd, implement]
governs: .claude/skills/**
verified-at: c53a121
last-touched: 2026-08-13
---

- Rule: a verdict must never collapse "checked and equal" into "could not check" or "nothing to compare". Each is a different claim about what the tool actually did, and only one of them is a verification.
- Shape of the bug: a sentinel that means two things. `compareHead` in `.claude/skills/standup/gather.mjs` returned `{sha, unreachable}` where `sha: null` meant BOTH "compared and equal" AND "there was nothing to compare". Three of its four return paths produced the same value for three different reasons.
- It happened TWICE in one function in one workflow (2026-08-13). The probe-failure collapse was caught during implement by reading the code. The no-upstream collapse survived implement, simplify, security AND integrate, and was found only because a human asked what happens on a repo that never tags releases. A branch that had never been pushed rendered `Remote check: local refs match origin.`
- Fix shape: name every outcome. `compareHead` now returns `{state, sha}` with `diverged | matched | unreachable | not-comparable`, surfaced as `release.remote.headState`.
- Test shape that catches it: assert the negative case does NOT claim the positive (`assert.doesNotMatch(text, /match(es)? origin/i)`), AND assert the genuine positive still claims it. Without the second assertion the obvious over-correction — never claiming a match again — passes.
