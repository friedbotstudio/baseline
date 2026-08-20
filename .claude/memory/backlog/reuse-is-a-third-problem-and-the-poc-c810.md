---
key: reuse-is-a-third-problem-and-the-poc-c810
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-20
raised-in-context: spec-entry-intake-node
verified-at: 1b4c320
last-touched: 2026-08-20
governs: .claude/skills/spec/SKILL.md, .claude/skills/implement/SKILL.md, .claude/skills/code-structure/SKILL.md
---

> **Reuse is a third problem, and the PoC does not touch it.** The fix is a rule in
> the spec: before it commits to a new function, it names the existing function it
> considered and says why that one does not fit.

- `code-structure` states reuse-before-create as a principle and `implement` repeats
  it as a constraint, but neither leaves a record. A worker that never found the
  existing module and one that considered it and rejected it produce the same diff.
- The proposal is to make the consideration a written artifact at spec time — one
  line per new function naming the candidate it displaces — so the reuse decision is
  reviewable at gate A instead of being inferred from the code afterwards.
- Not scoped yet. It needs a decision on where the rule lives (spec template section
  vs. a code-review checker) before it is worth a track.
