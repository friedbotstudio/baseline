---
key: additive-baseline-version-no-manifest-bump-2026-05-27
category: decisions
scope: [spec]
---

- Decision: stamp `baseline_version` (the running CLI's `package.json` version) into `<target>/.claude/.baseline-manifest.json` AND `<target>/.claude/project.json` from every install/upgrade write path — as an **additive** field on existing schemas. `MANIFEST_VERSION` stays at 2; no schema-version bump.
- Rationale: legacy manifests lacking the field load tolerantly (`buildManifestFromDir`'s opts.baseline_version is optional per `src/cli/manifest.js:38-40`). The fast-path then activates one upgrade later, after the first post-fix run stamps the field. A schema-version bump would force a destructive migration for zero behavioral benefit.
- Rejected alternatives:
  - Bump MANIFEST_VERSION to 3 + treat missing `baseline_version` as schema mismatch → forces destructive migration for every existing consumer manifest.
  - Hash-set equivalence (compare oldManifest.files to a fresh buildManifestFromDir) instead of string-version compare → strictly correct but hashes every shipped file on every upgrade and is harder to message ("byte-identical templates" vs "already on baseline X.Y.Z"). The CLI's package version IS the causal identity of the bundled template, so string compare is sufficient.
  - Stamp baseline_version only in `.baseline-manifest.json` → leaves project.json without an inspectable version field for consumer tooling. The single extra `refreshBaselineVersion` call gives parity.
- Source: archived bundle at `docs/archive/2026-05-26/upgrade-version-aware-noop/` (spec, security, spec.approved).
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
