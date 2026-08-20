---
key: ref-affordance-makes-the-swarm-predicate-always-resolve-solo-4f2c
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-20
raised-in-context: work-planner-envelope
verified-at: b93a5e4
last-touched: 2026-08-20
governs: .claude/skills/harness/SKILL.md, .claude/skills/spec/SKILL.md
---

> Zero C4 Components because the spec references `@ref element:harness-helpers`
> instead of drawing them. That is a genuine interaction between two features: any
> spec using the reference affordance can never take the swarm path.

- The harness resolves swarm-vs-solo by counting `^\s*Component\(` in the approved
  spec (`harness/SKILL.md`, "Swarm vs solo at Phase 6"). `/spec` Step 2.5 lets a spec
  satisfy all three C4 kinds with one `@ref element:<id>` line instead of drawing
  them, which is the encouraged form.
- A spec that takes the affordance therefore counts **zero** components and always
  resolves solo, however decomposable the work actually is. Measured on
  `work-planner-envelope`: 7 independent modules, count 0, routed solo.
- Not necessarily wrong — solo was the right call here — but the predicate is reading
  a drawing convention rather than the decomposition, so the two features silently
  disagree about what a component is.
- Unscoped: the fix could resolve components from the referenced element, count the
  spec's Layout rows, or read the dependency graph. That is a design decision, not a
  patch.
