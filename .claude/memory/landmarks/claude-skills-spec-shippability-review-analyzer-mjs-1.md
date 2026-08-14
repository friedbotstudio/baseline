---
key: .claude/skills/spec-shippability-review/analyzer.mjs:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Domain — shared shippability checks for C1 (`DEV_TREE_RUNTIME_REF`) + C3 (`UNSHIPPED_MODULE_IMPORT`). Pure functions, no I/O. Exports: `collectShellFences(text)` → `[{startLine, body}]` (handles BOTH column-0 tagged fences AND indented bash/sh/shell fences — the latter is the typical SKILL.md numbered-list shape that the original column-0-only regex missed), `runDevTreeAndUnshippedChecks(fences, manifest, sourcePath)` → `findings[]` (combined C1+C3 walk; dedupes per `line:refPath`). Static patterns `RUNTIME_INVOCATION_PATTERNS` (import/require, node/python/bash invocation, bare `./dev-prefix/` reference).
- Companion: consumed by `.claude/skills/spec-shippability-review/check.mjs:1` (per-spec drafts) AND `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs:1` (aggregate shipped-SKILL.md scan). C2 (`DEV_HELPER_EXTENSION`) stays in check.mjs because it scans write_set lines, not shell fences. Tests indirectly via consumer tests at `tests/spec-shippability-review.test.mjs` (6 fixtures preserved byte-equal after refactor → AC-007 satisfied) and `tests/shipped-skill-md-shippability.test.mjs`. Extracted per spec `docs/specs/marker-helper-shipped-instead-of-dev-import.md` (approved 2026-05-26).
- Caveat: This skill is dev-only (no `owner: baseline` frontmatter on the parent SKILL.md → pruned by build-template.sh Stage 1.5). The analyzer.mjs file lives inside that dev-only skill dir and is itself never shipped to consumers — it runs at spec-draft time AND build time only, both in the dev tree.
