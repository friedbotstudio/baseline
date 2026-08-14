---
key: @semantic-release/commit-analyzer@13.0.1
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: the first plugin in the semantic-release chain. Parses commits since the last release and decides (a) whether to release at all and (b) the bump type (major / minor / patch) using `releaseRules`. Configured under `plugins[]` in `.releaserc.json` with optional `preset` + `releaseRules` array.
- `releaseRules` shape: an array of objects each matching commits and assigning a `release` verdict. Match keys: `type`, `scope`, `breaking: true`, `revert: true`, `subject`, `header`, `body`, `message` (the last three accept micromatch globs). Verdict values: `"major"` / `"minor"` / `"patch"` / `false` (suppress release for matching commits).
- This repo's usage: `releaseRules` is used to (1) cap `main`-branch releases at 0.x by remapping `breaking: true` to `minor`, and (2) exclude maintenance scopes (e.g. `release`) from triggering a release — the "scope-based filtering" topic queried 24+ times this session.
- Rules are evaluated in array order; the first match wins. To suppress a commit, place its rule before any catch-all.
- Caveat: `releaseRules` extends but does NOT replace the default preset rules (Angular convention by default) — defaults still apply for commits no custom rule matches. To make a scope explicitly NOT trigger a release, you need an explicit `{scope: "<name>", release: false}` entry that fires before the default `feat`/`fix`/`BREAKING CHANGE` rules. The minor-cap-on-breaking trick (`{breaking: true, release: "minor"}`) only works because rules are evaluated before the preset; it is the documented v0.x safety belt.
