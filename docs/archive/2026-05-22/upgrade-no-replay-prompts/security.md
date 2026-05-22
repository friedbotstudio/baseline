# Security reports — upgrade-no-replay-prompts

## upgrade-no-replay-prompts-2026-05-23.md

# Security Review — upgrade-no-replay-prompts — 2026-05-23

## Summary

**Risk: LOW.** The diff adds a per-target reconciliation marker (`.claude/.baseline-reconciliations.json`) and expands the `NEVER_TOUCH` list. All work is local filesystem operations on user-controlled paths; no network, no auth, no crypto-as-security-mechanism, no new dependencies. One LOW finding about shell-string interpolation in a documentation example; no MEDIUM/HIGH/CRITICAL findings.

Reviewed: `src/cli/reconciliation-marker.js` (NEW), `src/cli/{install,merge,doctor}.js`, `scripts/build-manifest.mjs`, `.claude/skills/upgrade-project/SKILL.md`, plus 5 test files. Total diff ≈ 300 lines.

## Findings

### LOW — Shell-string interpolation in `/upgrade-project` SKILL.md example

- **OWASP**: A03 Injection (documentation-driven; no exploitation surface in CLI execution path) | **CWE**: CWE-77
- **File**: `.claude/skills/upgrade-project/SKILL.md:67-73` (the new Procedure step 5 example)
- **Evidence**:
  ```
  node -e "import('./src/cli/reconciliation-marker.js').then(m => m.recordReconciliation('<target>', '<rel>', '<baseline_version_to>', '<incoming_sha256>'))"
  ```
- **Impact**: Documentation example shows single-quoted shell substitution for `<rel>`, `<target>`, etc. If a `rel` value happens to contain a single quote (e.g., the user creates a file named `weird'name.md` and somehow stages it), the LLM-driven substitution would break out of the quoted string, potentially executing arbitrary shell. In practice, `rel` values come from `stage_manifest.files[].rel` written by the CLI itself (`upgrade-tiers.js:writeStage`), and `validate rel before writing` per existing SKILL.md:113 already rejects path-traversal `rel` values. The actual *injection* risk reduces to "a maliciously crafted stage manifest with a quote-containing rel" — which already requires `.claude/state/` write access (i.e., a local attacker who already has command execution).
- **Recommendation**: Change the example to use `node -e ... process.argv[2] ...` with positional arguments via argv, or to pipe a small JSON payload via stdin. This eliminates the shell-quoting surface entirely. Defer to a follow-up — not blocking, and the upstream `rel` validation already exists.

## Dependencies

**No new packages.** `package.json` and `package-lock.json` unchanged. `@clack/prompts@1.4.0` remains the sole runtime dependency.

`npm audit` not re-run (no dep delta to check). Pre-existing audit posture unchanged.

## What I checked (positive notes)

- **`src/cli/reconciliation-marker.js`** — file operations use `node:fs/promises`. Atomic write via `randomUUID()` tmpfile + `rename` — no race, no predictable tmp name. JSON parse wrapped in try/catch with graceful `null` return. The `rel` parameter is stored as a JSON object key, NOT used to construct a filesystem path (no path-traversal vector through `rel`). The only filesystem path constructed is `<target>/.claude/.baseline-reconciliations.json` — fixed shape, `target` comes from CLI argv.
- **`src/cli/merge.js`** — marker-consult is pure string equality (`reconciled_against_template_sha === template_sha`). No injection, no eval, no remote call.
- **`src/cli/doctor.js`** — adds a single path-equality exclusion to the `added` scan. No new trust boundary.
- **`src/cli/install.js`, `scripts/build-manifest.mjs`** — added 2 string literals each to frozen lists. No code-execution surface.
- **Tests** — exercise the API directly; readonly-fs test uses tmpdir with try/finally chmod restoration.
- **Secrets scan** — no hardcoded tokens, keys, or `.env` material in the diff.

## Out of scope / Noted

- **Scout landmine #1** (v2/v3 manifest-shape mismatch at `.baseline-manifest.json`) is independently broken but NOT in this spec's scope per Non-goals. The mismatch does not introduce a security concern — both schemas store sha256 hex strings; the issue is doctor's silent miscount, not data integrity. Worth fixing in a separate intake.
- **`.baseline-reconciliations.json` schema_version forward-compat** — the marker module rejects unsupported schema_versions with a stderr warning and returns null. This is conservative (no destructive action on unknown shape) but means a future CLI version downgrade would silently ignore the marker. Documented behavior; not a security issue.
- **`/upgrade-project --dry-run` correctness** — the spec explicitly forbids the dry-run path from calling `recordReconciliation` (would silently lie to the next upgrade about user review). Enforced by SKILL.md prose and the AC-009 test. Worth periodic verification as the skill evolves.

