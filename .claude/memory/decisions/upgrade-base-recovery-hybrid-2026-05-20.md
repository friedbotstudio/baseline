---
key: upgrade-base-recovery-hybrid-2026-05-20
category: decisions
scope: [spec]
source: archived bundle at `docs/archive/2026-05-20/upgrade-flow-rework/` (intake, scout, research, spec, security, spec.approved). Also: `src/cli/upgrade-tiers.js → resolveBase` is the implementation.
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Decision: BASE-content recovery for `create-baseline upgrade`'s three-tier merge uses a HYBRID strategy — local cache at `.claude/.baseline-prior/<rel>` is primary (read on every resolve, sha256-verified against `oldManifest.files[rel]`), with `libnpmpack.pack('@friedbotstudio/create-baseline@<baseline_version>')` as the npm fallback when the cache is absent. Cache writes-through on every successful npm fetch so subsequent upgrades short-circuit to the cache path. Failed BASE recovery (cache sha mismatch / npm fail / sha mismatch / legacy `manifest_version: 1` with no `baseline_version`) throws `NoBaseError` and routes the file to the tier-1 binary prompt — NEVER fall back to using LOCAL as BASE (security AC-008 hard rule). Companion: `baseline_version` is added to the installed manifest at fresh-install time (`src/cli/install.js → readPackageVersion` reads CLI's own package.json) so subsequent upgrades have a version anchor.
- Rationale: 95% of upgrades hit the cache → zero network. Legacy projects (manifest_version: 1, pre-rework) get a one-time fall-through to tier-1 with a clear notice. A compromised npm registry serving the recorded version is mitigated by sha256 verification (the consumer's installed manifest, written at the prior install, is the integrity anchor). Tarball extraction is bsdtar/GNU-tar-safe by default and additionally hardened by a path-resolution check.
- Rejected alternatives:
  - **npm-only re-fetch on demand** (research candidate 1A) — offline upgrade impossible; registry yank breaks even when content was previously present locally.
  - **Cache-only with no npm fallback** (research candidate 1B) — legacy cold-start (projects installed pre-rework) has no recovery path other than tier-1 fallback for every file. Hybrid keeps the cache fast path while preserving graceful resilience.
