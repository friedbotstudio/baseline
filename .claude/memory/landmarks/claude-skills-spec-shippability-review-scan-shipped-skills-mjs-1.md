---
key: .claude/skills/spec-shippability-review/scan-shipped-skills.mjs:1
category: landmarks
scope: [scout]
---

- Role: Orchestration — aggregate scanner for shipped SKILL.md prose. CLI: `[--root <skills-dir>] [--report-root <project-root>] [--manifest <path> | --shipped-tree <dir>]`. Walks `<root>/<slug>/SKILL.md` (immediate children only, NOT recursive into `*/tests/fixtures/...`), extracts shell fences via analyzer.mjs's `collectShellFences`, runs `runDevTreeAndUnshippedChecks` per file, aggregates findings into `<report-root>/.claude/state/spec-shippability/shipped-skills.json`. Exit 0 CLEAN / 1 NEEDS_REVIEW / 2 BLOCKED / 3 missing root. The `--shipped-tree <dir>` mode (Stage 1.6 usage) derives the shipped-files set from a directory walk instead of reading manifest.json — sidesteps the chicken-egg dependency on build-template.sh Stage 3 (manifest is stamped AFTER Stage 1.6).
- Companion: wired into `scripts/build-template.sh` Stage 1.6 (between Stage 1.5 prune and Stage 2 overlay; build aborts on exit 2/3). Tests at `tests/shipped-skill-md-shippability.test.mjs` (5 scenarios incl. clean tree, planted dev-tree ref, planted unshipped import, missing root, whole-file regression on `upgrade-project/SKILL.md`) and `tests/build-shipped-skills-gate.test.mjs` (3 scenarios incl. structural ordering + behavioral planted-blocker). Spec: `docs/specs/marker-helper-shipped-instead-of-dev-import.md` AC-004 / AC-005 / AC-006.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: The aggregate report at `.claude/state/spec-shippability/shipped-skills.json` uses `slug: "shipped-skills"` as a sentinel key, distinct from per-spec reports at `.claude/state/spec-shippability/<slug>.json`. `spec_approval_guard.sh` reads per-slug paths only and is unaffected (AC-007). Symlink behavior: `readdir(..., { withFileTypes: true })` reports symlinks via `isSymbolicLink()` and `isDirectory()`/`isFile()` reflect the symlink itself (not target), so symlinked dirs are skipped by recursion and symlinked files are skipped by the `isFile()` check in `findSkillMds`. Don't change to follow-links without an explicit `lstat` guard.
