---
key: spec-lint-add-row-check-requires-the-file-to-exist
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-08
raised-in-context: skill-helper-cli-dispatchers
verified-at: 4cc46e0
last-touched: 2026-08-08
governs: .claude/skills/spec-lint/lint.mjs,.claude/skills/workspace/coverage.mjs,.claude/skills/spec/template.md
---

> `spec-lint`'s `system_delta` check calls `governedFiles()`, which walks the tree, so an `add` row naming a path the work has not created yet FAILs with "falls outside the governed surface" — a misleading message, since the anchor is inside the declared surface by root, extension and exclusions.

- **The work.** Check an `add` row's anchor against the surface POLICY — `roots`, `codeExtensions`, `excludedSegments`, `excludedTrees` from `memory.architecture_map.governed_surface` — rather than against the walked list of files that happen to exist. Or report a distinct "declared, not yet created" status instead of reusing the outside-the-surface failure.
- **The contradiction.** An `add` row exists precisely to declare a governed path the work is ABOUT to create. Requiring the file first means a spec introducing a genuinely new governed file cannot pass its own lint until after implementation, which inverts the order the phase sits in.
- **Proven, not inferred (2026-08-08).** In a sandbox with the live `governed_surface` copied in, `governedFiles()` returned `[]` for `.claude/schemas/graph-document.v1.json` before the file existed and returned the path immediately after `writeFileSync`. Policy checks all passed throughout: root matched `.claude/schemas/`, extension matched `.json`, no exclusion applied.
- **Why nobody hit it before.** Every prior `add` row in this repo pointed at a GLOB that already matched existing files, so the walk found something and the check passed. A brand-new single file was the untested case.
- **Bounded by.** `spec-lint` is preflight and never blocks — the Write-boundary hooks are the enforcement. So this misreports rather than halts, which is also why it can sit in the backlog rather than being urgent.
