# Security reports — marker-helper-shipped-instead-of-dev-import

## marker-helper-shipped-instead-of-dev-import-2026-05-27.md

# Security Review — marker-helper-shipped-instead-of-dev-import — 2026-05-27

## Summary

Overall risk: **LOW**. The change adds three new Node ESM helpers (one CLI marker writer, one shared analyzer, one aggregate scanner) plus prose edits to two SKILL.md files and one build-script stage. All new code is stdlib-only — no third-party packages added. No untrusted-input handling beyond a small CLI argv surface that is operator-invoked (Claude Code in-session). No new authentication, cryptography, network, or persistence concerns beyond reusing the existing `recordReconciliation` write semantics already audited under upgrade-no-replay-prompts.

## Findings

*(none — no Critical / High / Medium / Low findings worth raising as security concerns)*

## What was checked

### A01 Broken Access Control
- `.claude/skills/upgrade-project/marker.mjs:42` — `recordReconciliation(target, rel, ...)` writes to `<target>/.claude/.baseline-reconciliations.json`. `target` is an argv-supplied path. **Threat model**: the invoker is the /upgrade-project skill running in main context — Claude controls the value (typically `.`). No remote / unauthenticated caller. Path traversal via `target` is not a meaningful attack surface here because the invoker has filesystem access anyway.
- `rel` is stored as a JSON object key (not as a filesystem path inside marker.mjs). The path-traversal concern for `rel` is owned by /upgrade-project's reconciliation step (which writes LOCAL files); the SKILL.md already documents the descendant-check requirement.

### A02 Cryptographic Failures
- Atomic-write tmp suffix uses `crypto.randomUUID()` (`marker.mjs:97`). Cryptographically secure. No hardcoded IVs, no homegrown crypto, no weak hashing.
- No password handling or secret comparison.

### A03 Injection
- No SQL, no shell-string concatenation, no template-string SQL/HTML.
- `scripts/build-template.sh` Stage 1.6 invokes `node "$SCANNER" --root "$TEMPLATE_DIR/.claude/skills" --shipped-tree "$TEMPLATE_DIR/.claude" --report-root "$PKG_ROOT"`. All variables are double-quoted; shell injection requires a malicious `PKG_ROOT` / `TEMPLATE_DIR`, which the build operator controls.
- `analyzer.mjs:107` — only call to `re.exec()` is `RegExp.prototype.exec` against a string, not `child_process.exec`. Static patterns (`RUNTIME_INVOCATION_PATTERNS`) — no dynamic regex construction from user input.
- No `eval`, `Function()`, `vm.run*`, or dynamic `require()`/`import()` anywhere in new production code.

### A04 Insecure Design
- The scanner reads files via `readdir(absRoot, { withFileTypes: true })` which does NOT follow symlinks by default in `findSkillMds` since `entry.isDirectory()` checks the Dirent (symlink dirs return false unless the symlink target is followed; `readdir` returns Dirent objects whose `isDirectory()` checks the symlink itself, not its target — this is the safer mode). No symlink-traversal escape possible from the scanner.
- `walkFiles` recurses via `readdir(..., withFileTypes)`. Same default symlink behavior: a symlink-to-directory is reported as symlink not directory, so recursion skips it. No infinite-loop or escape risk.

### A05 Security Misconfiguration
- Build script gates: Stage 1.6 (new) follows the existing Stage 1.5 prune + Stage 4 audit pattern. Failure exits non-zero, aborting before npm pack — net-positive for shipping safety.
- No new environment variables, no debug endpoints, no permissive defaults.

### A06 Vulnerable and Outdated Components
- No new npm packages. `package.json` unchanged. All new code uses Node stdlib (`node:fs/promises`, `node:path`, `node:crypto`, `node:test`).
- No CVE check required.

### A07 / A08 / A10
- No authentication, no JWTs, no integrity-verified deserialization concerns.
- No outbound HTTP / DNS / network: scanner is purely filesystem-local.

### A09 Logging and Monitoring
- Scanner and marker helper write diagnostic strings to stderr on errors; no log injection (single-line plain text, no structured-log forging).
- No log-suppression mechanisms.

### Secrets hygiene
- No hardcoded tokens, API keys, private keys, or env-var leakage.
- Tests use `'a'.repeat(64)` and similar fake SHA-like strings — clearly synthetic, not real hashes.
- Fixture SKILL.md files at `.claude/skills/spec-shippability-review/tests/fixtures/...` contain intentional "bad" `node -e "import('./src/foo.js')..."` payloads as planted regressions for tests. **These never reach `obj/template/`** — Stage 1.5 prunes the entire `spec-shippability-review/` dir (no `owner: baseline` on its top-level SKILL.md), removing the fixtures along with it. Verified: the prune `rm -rf` covers `tests/fixtures/` as a subdirectory.

### Input validation
- `marker.mjs` validates argc (exits 2 with usage when args are missing or unknown subcommand). The 4 positional args are stored as JSON values — `JSON.stringify` escapes control characters and quotes correctly. No JSON injection possible via `rel`, `baseline_version`, or `template_sha`.
- `scan-shipped-skills.mjs` parses `--root`, `--report-root`, `--manifest`, `--shipped-tree` as filesystem paths. `existsSync` check on `--root` returns exit 3 cleanly on missing.

## Dependencies

No new packages added in this diff. `package.json` and `package-lock.json` unchanged. No `npm audit` run needed (delta is zero).

## Out of scope / Noted

- **Symlink behavior** in `walkFiles` (scan-shipped-skills.mjs): Node's `readdir(..., { withFileTypes: true })` returns symlinks as their `Dirent.isSymbolicLink() === true` (and `isDirectory()`/`isFile()` reflect the symlink itself, not its target). Practical effect: symlinked directories are skipped by the recursion (`entry.isDirectory()` returns false), and symlinked files are skipped by the `entry.isFile()` check in `findSkillMds`. This is actually a feature, not a hole — but worth flagging if anyone later changes the recursion to follow links.
- **Build-script lock** (`/tmp/create-baseline-build.lock.d`): pre-existing concurrency primitive, unchanged here. The mkdir-based mutex is atomic; the 60s timeout is fine for serial CI but produces flakes under parallel `node --test` runs (already documented in the implement report).
- **Future hardening**: if `scan-shipped-skills.mjs` ever becomes invocable from untrusted input (e.g., as a CI webhook with attacker-controlled `--root`), tighten the symlink behavior to an explicit `lstat`-based reject. Currently the only invoker is the build operator. Not relevant to this PR.

