# Security reports — ship-baseline-output-style

## ship-baseline-output-style-2026-08-07.md

# Security Review — main (ship-baseline-output-style) — 2026-08-07

## Summary

Overall risk: **LOW**. The diff adds one JSON config key to two byte-identical settings files, removes a redundant copy of that key from dev-local settings, adds a prose payload file, and adds test coverage. No new dependency, no new executable code path in shipped runtime, no secret material, and no new trust boundary. `npm audit` reports 0 vulnerabilities. Two MEDIUM-adjacent surfaces were examined in depth — the shipped `settings.json` upgrade path and the prompt-adjacent nature of the style file — and both resolve to LOW with the mitigations already in place.

## Findings

### [LOW] Shipped `settings.json` gains a key on a file that also carries all hook wiring

- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-1188
- **File**: `src/settings.template.json:3`, `.claude/settings.json:3`
- **Evidence**:
  ```json
  {
    "$schema": "https://json.schemastore.org/claude-code-settings.json",
    "skillListingBudgetFraction": 0.05,
    "outputStyle": "Baseline",
    "hooks": {
  ```
- **Impact**: `.claude/settings.json` is the single file wiring all 26 enforcement hooks. Any mechanism that rewrites it during an upgrade is, in principle, a mechanism that could reorder or drop a guard. Adding a key increases the number of upgrades in which that file legitimately differs from a consumer's copy, so the merge path is exercised more often.
- **Recommendation**: No change. The existing routing is already the safe one and was verified: `.claude/settings.json` appears in neither `NEVER_TOUCH` nor `SPECIAL_MERGE` (`src/cli/install.js:15,33`), so an edited consumer copy is staged for `/upgrade-project` human reconciliation rather than structurally auto-merged. The approved spec rejected adding it to `SPECIAL_MERGE` for exactly this reason. `tests/output-style-default.test.mjs` now pins that routing, so a future change to it fails a test rather than passing silently. This finding is recorded to document that the blast radius was considered, not because a defect exists.

### [LOW] Style file is prompt-adjacent content shipped into every consumer session

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-77 (adjacent; no interpreter involved)
- **File**: `.claude/output-styles/baseline.md`
- **Evidence**:
  ```markdown
  ## Scope
  Apply the language rules to your chat messages.
  Do not apply the language rules to:
  - Code, comments, commit messages, and test names.
  - Files that a skill owns...
  - Governance and specification documents. That voice is deliberate.
  ```
- **Impact**: The file's contents reach the model's context in every consumer session, so its text has the same character as prompt content. A style file that carried directive-shaped instructions could attempt to weaken constitutional rules — the classic instruction-precedence concern.
- **Recommendation**: No change. Scanned for directive-shaped override language (`ignore previous`, `disregard`, `override`, `system prompt`, `constitution`) — none present. The file constrains only register and explicitly scopes itself *out* of code, skill-owned files, governance documents, and direct quotes, so it narrows rather than widens what the model will do. Precedence is unambiguous under Article I.4: `seed.md` > `CLAUDE.md` > implementation, and an output style is implementation. It grants no capability, disables no hook, and touches no consent path. Treat any future edit to this file as a prompt change and review it as such — that is the standing control, and it is why the file is hashed into `manifest.json` (drift is detectable).

### [LOW] Test harness executes `bash` with an inherited environment

- **OWASP**: A03 - Injection | **CWE**: CWE-88
- **File**: `tests/output-style-default.test.mjs:151`
- **Evidence**:
  ```js
  execFileSync('bash', [BUILD_SCRIPT], {
    cwd: isolatedRoot,
    env: { ...process.env, PKG_ROOT: isolatedRoot },
    stdio: 'pipe',
  });
  ```
- **Impact**: None reachable. Noted for completeness because the line shells out.
- **Recommendation**: No change. `execFileSync` with an argument array performs no shell interpolation, so there is no injection point. Both `BUILD_SCRIPT` and `isolatedRoot` are locally derived — the former from `import.meta.url`, the latter from `mkdtemp` — and neither is attacker-influenced. This is dev-time test code that never ships to a consumer (it lives under `tests/`, outside the payload allowlist). The pattern is byte-for-byte the one already used by `tests/template-payload.test.mjs:135`. The temp directory is removed in an `after()` hook.

## Dependencies

No new packages. `git diff HEAD -- package.json package-lock.json` is empty. `npm audit --omit=dev` reports **0 vulnerabilities**.

## What was checked

- OWASP A01–A10 against the diff. Only A03, A04, and A05 had any surface; all three are recorded above as LOW.
- Secrets hygiene: grep for `api_key` / `secret` / `token` / `password` / `private key` / PEM headers across the new and modified files — no matches.
- Trust boundaries: none introduced. No HTTP handler, CLI entrypoint, message consumer, or file parser is added or modified.
- AuthN / AuthZ: no consent path, approval token, or guard is touched. `git_commit_guard`, `direction_approval_guard`, and the other 24 hooks are unmodified — the `hooks` block of `settings.json` is byte-unchanged.
- Cryptography: none added. The only hash involved is the build's existing sha256 manifest stamping.
- Input validation: the one new parser is `frontmatterOf` in the test file, which reads a repo-local file under test — not a trust boundary.

## Out of scope / Noted

- `.claude/settings.local.json` is gitignored dev-local state and is not part of the shipped payload; removing the redundant key from it has no consumer-facing effect.
- The style file is not witnessed by the `docs/system/` corpus because `.claude/output-styles/` sits outside `memory.architecture_map.governed_surface`. This was raised at gate A and accepted by the reviewer. It is a traceability gap, not a security one — the file is still sha256-hashed into `manifest.json`, so tampering remains detectable by `audit-baseline`.

