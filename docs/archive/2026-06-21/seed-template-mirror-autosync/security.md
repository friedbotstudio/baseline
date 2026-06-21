# Security reports — seed-template-mirror-autosync

## seed-template-mirror-autosync-2026-06-21.md

# Security Review — seed-template-mirror-autosync — 2026-06-21

## Summary

Overall risk: **LOW**. The change adds a stdlib-only Node helper (`scripts/sync-constitution-mirror.mjs`) that reconciles two local repo files into their template mirrors, a guarded invocation in `build-template.sh` Stage 0b, a `package.json` script, and a test. No network, authentication, cryptography, secrets, database, or untrusted-input surface is introduced. All execution is dev/build-time by the maintainer. No CRITICAL/HIGH/MEDIUM findings.

## Findings

No CRITICAL, HIGH, or MEDIUM findings.

### [LOW] CLI `--root` is joined with fixed relative paths without normalization
- **OWASP**: A04 - Insecure Design (defensive note) | **CWE**: CWE-22 (path traversal — not exploitable here)
- **File**: `scripts/sync-constitution-mirror.mjs` (`parseArgs` → `reconcile` → `join(rootDir, pair.live/template)`)
- **Evidence**:
  ```js
  else if (argv[i] === '--root') rootDir = argv[++i];
  // ...
  const live = readUtf8(join(rootDir, pair.live)); // pair.live/template are fixed constants
  ```
- **Impact**: None in practice. `rootDir` is a trusted maintainer-supplied build argument, not a network/HTTP boundary; the path suffixes (`docs/init/seed.md`, `src/seed.template.md`, etc.) are hardcoded constants, so there is no attacker-controlled traversal. The only writes are to the two fixed template paths under `rootDir`.
- **Recommendation**: Accept as-is. This is a build tool invoked by the repo owner; adding `realpath`/allowlist validation would be ceremony with no threat model behind it (YAGNI). Documented here for completeness.

## Dependencies

No new packages. The helper imports only Node stdlib (`node:fs`, `node:path`, `node:url`, `node:process`). `package.json` adds one script entry (`sync:constitution`), no dependency change. No CVE surface.

## Out of scope / Noted

- **A08 (Software & Data Integrity) — intended behavior, not a finding**: build Stage 0b now *writes* `src/*.template.md` from the live constitution during `npm run build`/`prepack`. This is the deliberate self-heal (the spec's guarantee that drift cannot ship) and is idempotent — a no-op on an in-sync tree. It mutates only committed, repo-internal files the maintainer reviews before commit; it touches nothing outside the repo and runs no external code. The §16 splice preserves the reserved placeholder, so the self-heal cannot leak this repo's project-specific config into a consumer install.
- The helper fails closed (exit 2, zero writes) on a missing source or absent §16/§17 marker — a safe-by-default posture verified by test `test_when_missing_live_seed_then_exit_two_and_no_partial_write`.

