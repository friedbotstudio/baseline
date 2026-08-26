---
key: integrate-verdict-predates-the-archive-that-invalidates-it-2b71
category: backlog
scope: [integrate]
status: picked-up
source: assistant-deferral
raised-on: 2026-08-26
raised-in-context: velocity-envelope-derives
governs: .claude/skills/integrate/SKILL.md, .claude/skills/archive/SKILL.md, .claude/skills/commit/SKILL.md
verified-at: 7d7039c
last-touched: 2026-08-26
deferred: risk
superseded-at: 2026-08-26
---

> The binding PASS is stamped at Phase 9 and the tree changes at Phase 10.5, so a workflow can commit a suite it never ran.

- **The hole.** `/integrate` runs the full suite and stamps `.claude/state/last_test_result` at Phase 9. `/archive` then writes `docs/archive/<date>/<slug>/` at Phase 10.5, and `/commit` stages it. No phase re-runs the suite between them, so the commit carries a tree the binding verdict never saw.
- **Measured 2026-08-26.** The archive bundle is a new sample for `envelopeFor`, which re-fitted the `tdd-quickfix` envelope from 39,105 to 38,227. `tests/site-shipped-claims.test.mjs` compares the velocity page against that fit, so CI went red on the commit that had just landed — twice, on consecutive releases.
- **No live victim remains.** The velocity page was the only assertion pinned to the live archive corpus; it now derives from `envelopeFor` at build time. `tests/envelope-fit.test.mjs` reads fixture roots, not the repo. So this is a latent hole, not a current break, which is why it is deferred rather than fixed.
- **Fix shapes, both with a cost worth weighing.** Re-stamp the verdict after `/archive` — honest, but it doubles the suite run on every workflow. Or have `/commit` re-run only the tests whose inputs the archive touched — cheaper, and it needs a dependency map that does not exist.
- **Do not fix it by excluding the workflow's own bundle from the fitter.** The bundle is a real sample and the next workflow would count it anyway; that only moves the discontinuity by one commit.
