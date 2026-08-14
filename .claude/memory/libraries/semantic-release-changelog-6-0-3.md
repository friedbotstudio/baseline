---
key: @semantic-release/changelog@6.0.3
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: release-time plugin in the semantic-release chain. Runs in the `prepare` step; inserts the release notes (built upstream by `@semantic-release/release-notes-generator`) into `CHANGELOG.md`. Configured at `.releaserc.json:20` with `{changelogFile: "CHANGELOG.md"}`.
- Empirical behavior (measured during the changelog-skill-and-responsive-svgs workflow, 2026-05-17; the test that measured it is gone with the skill): does NOT preserve the `## [Unreleased]` heading position at the top of the file. The plugin prepends `nextRelease.notes` ABOVE the file's existing content (including `# Changelog` and `## [Unreleased]` headings). The Unreleased heading survives in the file body — just displaced downward.
- Companion: none. The `changelog` skill was renamed `whatsnew` and the Unreleased-curation approach was retired with it — `unreleased-writer.mjs` and `reinsertUnreleasedHeading` no longer exist, and `tests/whatsnew-cutover.test.mjs` now asserts the tree carries no unreleased curation at all. The follow-up workflow this bullet deferred to never ran, because the requirement was dropped rather than deferred.
- Caveat: the plugin's prepend behavior is documented empirically here because context7 did not surface the seam at research time. The behavior claim still holds; only the mitigation is gone. Anything wanting keepachangelog 1.0.0 conformance would have to rebuild it — do not cite `reinsertUnreleasedHeading` as an available fallback.
