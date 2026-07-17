---
key: @semantic-release/changelog@6.0.3
category: libraries
scope: [research]
---

- Role: release-time plugin in the semantic-release chain. Runs in the `prepare` step; inserts the release notes (built upstream by `@semantic-release/release-notes-generator`) into `CHANGELOG.md`. Configured at `.releaserc.json:20` with `{changelogFile: "CHANGELOG.md"}`.
- Empirical behavior (verified by `.claude/skills/changelog/tests/keepachangelog-unreleased-preserved_test.mjs:1` during the changelog-skill-and-responsive-svgs workflow): does NOT preserve the `## [Unreleased]` heading position at the top of the file. The plugin prepends `nextRelease.notes` ABOVE the file's existing content (including `# Changelog` and `## [Unreleased]` headings). The Unreleased heading survives in the file body — just displaced downward.
- Companion: `.claude/skills/changelog/unreleased-writer.mjs:1` exports `reinsertUnreleasedHeading(changelogPath)` as the release-time fallback that lifts the heading back to canonical top position. Not yet wired into `.releaserc.json` as a post-prepare step; deferred to a follow-up workflow once the AC-013 integration test confirms wiring shape.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
- Caveat: the plugin's prepend behavior is documented empirically here because context7 did not surface the seam at research time. The fallback `reinsertUnreleasedHeading` is therefore mandatory if the workflow wants keepachangelog 1.0.0 conformance after release-time runs. A future hardening tick would wire the fallback as a `.releaserc.json` post-prepare plugin entry.
