# Security reports — velocity-lever-ranking

## velocity-lever-ranking-2026-07-17.md

# Security Review — velocity-lever-ranking (rebuild-tax lever) — 2026-07-17

## Summary

The change adds a `build-template.sh --manifest-only` fast path (+ `manifest-refresh.mjs` wrapper + npm script) that re-stamps the manifest while SKIPPING the audit + prose-scan + memory-seed + mirror-sync stages. The one security-relevant question — *can the fast path let an unaudited/polluted template reach consumers?* — is answered **no**: the ship-time hook (`prepack`) runs the full build with no flag, so the published artifact always passes the complete audit + shipped-skill prose scan. No injection surface. Overall risk: **LOW**.

## Findings

*(none — no Critical/High/Medium)*

## Verified

- **[A08 Software & Data Integrity] Supply-chain: the fast path cannot ship an unaudited template.** `package.json → prepack` is `bash scripts/build-template.sh` (no `--manifest-only`), so `npm pack`/publish always runs Stages 0a–4 including `audit-baseline` (Stage 4) and the shipped-SKILL prose scan (Stage 1.6). `--manifest-only` is a dev-inner-loop convenience only; it never runs at pack time. The audit is *deferred to integrate*, never *removed*. ✓
- **[A03 Injection] No command-injection surface in `manifest-refresh.mjs`.** `spawn('bash', [buildScript, '--manifest-only'])` uses a fixed argv array (no shell string interpolation) and `buildScript` defaults to a module-relative fixed path (`join(SCRIPT_DIR, 'build-template.sh')`), not user/env input. The `spawn`/`buildScript` params are dependency-injection for tests, unreachable from the CLI entry (`process.exit(runManifestRefresh())` with no args). ✓
- **[Correctness/integrity] A `--manifest-only` refresh produces an audit-consistent manifest.** Stage 3 re-hashes the same tree the audit later re-derives from; AC-004's test (`--manifest-only` then full `audit.mjs` → exit 0) proves the fast path never produces a manifest the authoritative audit would reject. ✓
- **[Fail-safe] `set -euo pipefail` + the `MANIFEST_ONLY=""` default.** An unrecognized arg leaves `MANIFEST_ONLY` empty → full build (fail-safe to the audited path). The wrapper maps a null child status (killed child) to exit 1, never a false success. ✓

## Dependencies

No new packages. Bash + Node ESM stdlib only.

## Out of scope / Noted

- The lever optimizes the **baseline maintainer's inner loop** only (a consumer editing their own files never rebuilds the baseline manifest) — a scope fact, not a security concern.

