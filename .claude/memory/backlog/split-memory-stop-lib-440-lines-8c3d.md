---
key: split-memory-stop-lib-440-lines-8c3d
category: backlog
scope: []
status: open
raised-on: 2026-07-13
raised-in-context: extractor-noise-and-prereq-drift (`/simplify` flagged)
source: assistant-deferral
estimated-effort: small
verified-at: 1414f27
last-touched: 2026-07-13
governs: .claude/hooks/lib/memory_stop.mjs
---

> verbatim (assistant, 2026-07-13, `/simplify` flagged row): "`.claude/hooks/lib/memory_stop.mjs` is ~440 lines, far past the ~80-line guideline — but it was ALREADY 386 lines before this change; the smell predates the diff."

- Intent: split `.claude/hooks/lib/memory_stop.mjs` along layer lines. The block-classification predicates (`filterNoise`, `isFlushReport`, `isSelfReferential`, `stripSkillEnvelope`) are a cohesive unit and are the natural seam.
- Why NOT done in its workflow: code-structure Principle 7 puts module-size restructuring in `/simplify`, not initial composition — and splitting mid-workflow would have ballooned an already 1425-line diff. The size smell predates the change that surfaced it.
