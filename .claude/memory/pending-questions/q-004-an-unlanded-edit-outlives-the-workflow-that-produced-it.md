---
key: Q-004
category: pending-questions
scope: [intake, spec, integrate]
source: inferred-from-code
verified-at: 309d70e
last-touched: 2026-08-17
---

- **Question.** When a workflow's edits are on disk but its `workflow.json` is replaced before `/commit`, nothing tracks the orphaned change. Should `/triage` refuse to overwrite a `workflow.json` whose write surface is dirty, or should it stash a pointer to the in-flight edit?
- **The live instance (open, do not close this).** `docs/roadmap-execution-plan.md` carries an uncommitted edit marking Epic 11 row E as SUPERSEDED. It was produced by the `epic11-slice-e-superseded` chore, which reached `verify` and failed on a suite that was already red at HEAD. `/triage` then replaced `workflow.json` with `fix-failing-tests-at-head` to repair the tests. The roadmap edit is correct and still on disk with no workflow pointing at it.
- **Why the guardrails did not catch it.** `/triage`'s constraint is "if a workflow.json already exists for an open request, ask whether to replace it" — a question about the *request*, not about the *working tree*. `completed` was `[]`, so replacement looked free; the cost was invisible because it lived in the diff rather than in the statefile.
- **Why it nearly landed in the wrong commit.** The replacement workflow's write surface is `tests/**`. Its `/commit` will name paths explicitly (`git add -A` is hard-blocked by `FORBIDDEN_RE`), so the roadmap edit stays unstaged — but only because the operator remembered. Nothing mechanical protects it, and `rightsize-gate baseline` recording the path in `rightsize_base[]` is a measurement exclusion, not a custody record.
- **Answer shape wanted.** Either a `/triage` preflight that refuses replacement while the outgoing workflow's write surface is dirty (naming the paths), or an explicit decision that carrying an orphaned edit across workflows is the operator's business and the pipeline should not model it.
- **Next action regardless of the answer:** re-triage the chore and land the roadmap row now that the suite is green.
