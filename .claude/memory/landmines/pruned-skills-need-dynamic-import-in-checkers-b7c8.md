---
key: pruned-skills-need-dynamic-import-in-checkers-b7c8
category: landmines
scope: [spec, integrate]
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 3c08c8a
last-touched: 2026-08-26
governs: .claude/skills/harness/checkers/spec-shippability.mjs
---

> On a consumer install the module is absent, so this is a top-level import failure at module load. The adapter's internal try/catch cannot catch it.

- **The trap.** `scripts/build-template.sh` prunes every skill whose `SKILL.md` lacks `owner: baseline` — seven of them, including `spec-shippability-review`, `cli-copy-review` and `faithful-capture`. A checker adapter that imports a pruned skill at the TOP LEVEL throws at module load on any consumer install.
- **Where it is anchored, and why only here.** `governs:` names the adapter alone, not `checker-fanout.mjs`. The fan-out is the victim of this mistake; the adapter is the file a maintainer edits to cause it. Anchoring the victim as well would surface this landmine on every fan-out edit, which is the scatter the placement gate exists to prevent.
- **Why the usual fail-open does not save you.** `checker-fanout.mjs` imports each adapter at its own top level, so the throw happens while the fan-out module is being loaded — before any adapter's `run` executes and before any `try/catch` inside it exists. The whole spec-review boundary fails to load rather than degrading to `{findings: []}`, which is the opposite of every other path in that registry.
- **Invisible on this repo.** The dev tree has all seven skills present, so the import resolves and the adapter passes its tests. The failure only appears on a consumer install — the one place nobody is running the test suite.
- **The pattern.** Load a pruned dependency with `await import()` inside `run`, returning `{findings: []}` on failure. `checkers/spec-shippability.mjs` is the worked example; its `loadAnalyzer()` and the test `test_when_adapter_source_read_then_the_pruned_skill_is_imported_dynamically` lock the shape.
- **Before adding any checker adapter,** check whether its source skill declares `owner: baseline`. If not, the import must be dynamic.
