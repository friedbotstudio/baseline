---
key: two-manifests-two-versions-by-design-2026-06-21
category: decisions
scope: [spec]
source: investigation-conclusion (manifest-version-drift, abandoned)
verified-at: 154cc1f
last-touched: 2026-06-21
---

- Decision: the baseline has TWO manifests with TWO version numbers, on purpose — do NOT "fix" this as version drift. (1) SHIPPED manifest `<target>/.claude/manifest.json` — built by `scripts/build-manifest.mjs` (hardcodes `manifest_version: 3`), carries `{sha256, tier}` per file + `owners.skills`; the baseline spec + per-file upgrade-tier routing; copied verbatim into every install; consumed by consumer-side `audit-baseline` and the three-way upgrade merge. (2) INSTALLED manifest `<target>/.claude/.baseline-manifest.json` — built by `buildManifestFromDir` in `src/cli/manifest.js` (`MANIFEST_VERSION = 2`), bare `{rel: sha}` + `baseline_version`; a content fingerprint of what actually landed in THIS project; consumed by `doctor.js` (`MANIFEST_REL`) and `upgrade.js`. The numbers differ because only the SHIPPED shape changed in the upgrade-flow rework (added tiers/owners → v3); the INSTALLED shape stayed v2.
- Rationale: the split is load-bearing. `merge.js` `readTierFromEntry` distinguishes bare-sha (v2 installed/legacy → BINARY_PROMPT fallback) from `{sha256, tier}` (v3 shipped → full three-tier flow); `upgrade.js` `isLegacyManifest` keys off `manifest_version === 1`; `tests/manifest.test.mjs` pins `buildManifestFromDir` to emit v2. Collapsing to one number would break all three. Pairs with `additive-baseline-version-no-manifest-bump-2026-05-27`, which already records "MANIFEST_VERSION stays at 2" and lists "bump to 3" as a rejected alternative.
- Origin: the 2026-06-19 WhatsApp screenshot (`manifest-version-drift`) showed a fully HEALTHY install; the install message prints `(manifest v2)` (the INSTALLED `.baseline-manifest.json` version) while the visible `.claude/manifest.json` says 3 — a cosmetic naming overlap, not a defect. Workflow abandoned 2026-06-21 as a non-bug; no code changed.
