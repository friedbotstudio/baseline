---
key: semantic-release@25.0.3
category: libraries
scope: [research]
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Role: the release pipeline driver — runs the plugin chain (commit-analyzer → release-notes → changelog → npm → git → github) on CI to compute next version, generate notes, publish to npm, and tag. Configured in `.releaserc.json` at project root.
- Plugin chain (current): `@semantic-release/commit-analyzer` → `@semantic-release/release-notes-generator` → `@semantic-release/changelog@6.0.3` → `@semantic-release/npm` → `@semantic-release/git@10.0.1` → `@semantic-release/github`.
- Branches config: this repo's `.releaserc.json` declares `branches: ["main"]` and caps via `releaseRules` (see commit-analyzer entry); the `branches` field accepts strings, regex objects, and channel/range/prerelease objects but in this repo it's a flat string array.
- Scripts: invoked via `npm run release` (mapped to `semantic-release` in `package.json → scripts.release`) inside the release CI job.
- Caveat: v25 requires Node ≥ 20.8.1; CI must run on a recent enough Node. The plugin chain is order-sensitive — `commit-analyzer` must run first (determines release-or-not + bump type), and `git` must run before `github` so the tag exists when GitHub release is created. Trusted-publisher OIDC for npm is a parallel concern handled in the workflow YAML, not in `.releaserc.json`.
