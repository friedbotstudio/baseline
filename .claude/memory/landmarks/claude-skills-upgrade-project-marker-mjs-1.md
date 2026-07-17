---
key: .claude/skills/upgrade-project/marker.mjs:1
category: landmarks
scope: [scout]
---

- Role: Foundation — **shipped** CLI helper for `/upgrade-project`'s marker write. Subcommand `record <target> <rel> <baseline_version> <template_sha>` writes `<target>/.claude/.baseline-reconciliations.json` atomically (write-then-rename via `randomUUID` tmpfile). Stdlib only (`node:fs/promises`, `node:path`, `node:crypto`). Exit codes: 0 success, 1 on filesystem error (stderr names `cannot write .claude/.baseline-reconciliations.json: <reason>`), 2 on bad args (stderr names `usage:` line + first missing field or unknown subcommand).
- Companion: byte-parity peer of `src/cli/reconciliation-marker.js → recordReconciliation` (test `test_when_helper_and_lib_invoked_with_same_args_then_produce_byte_equal_markers_modulo_timestamp` enforces drift detection). Invoked from `.claude/skills/upgrade-project/SKILL.md:1` Procedure step 5. Tests at `tests/upgrade-project-marker.test.mjs` (8 scenarios: empty target, append, replace, byte parity, missing args, unknown subcommand, readonly target, sequential records).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: This file exists because the CLI's `src/cli/reconciliation-marker.js` does NOT ship to consumer installs (the npm package's `src/` is for the CLI process itself, not the target's `.claude/`). The v0.8.1 SKILL.md invoked `node -e "import('./src/cli/reconciliation-marker.js')..."` which hit ERR_MODULE_NOT_FOUND on every consumer `/upgrade-project` run. Spec `docs/specs/marker-helper-shipped-instead-of-dev-import.md` (approved 2026-05-26) chose the self-contained shipped-helper pattern over alternatives (build-time symlink, npx-invoked subcommand, inlined `node -e` shell string). Keep marker shape changes synchronized with `src/cli/reconciliation-marker.js`.
