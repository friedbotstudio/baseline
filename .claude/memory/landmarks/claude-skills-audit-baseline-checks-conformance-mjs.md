---
key: .claude/skills/audit-baseline/checks/conformance.mjs
category: landmarks
scope: [chore, tdd, integrate]
governs: .claude/skills/audit-baseline/checks/conformance.mjs, .claude/skills/audit-baseline/audit.mjs
verified-at: 02f3c68
last-touched: 2026-09-02
---

- Role: the `audit-baseline` check module, 35 lines, that runs the reader-conformance engine and returns `[name, status, detail]` rows like every other check.
- Registered in `audit.mjs → CHECKS`. Adding a check is: write `checks/<concern>.mjs` exporting `run(ctx)`, list it in `CHECKS`. See [[claude-skills-audit-baseline-audit-mjs-1]].
- Why the audit and not only `npm test`: the audit is what a consumer install runs to prove the baseline is intact, so a reader that drifted from the published grammar fails in *their* audit rather than silently mis-scoping their epic.
- Editing anything under this baseline-owned skill drifts its manifest hash. Run `npm run manifest:refresh` before the skill-ownership check passes.
