---
owners: [research]
category: validated library APIs
size-cap: 500
key: lib@version
verifies-against: lockfile + context7
---

# Validated library APIs

Library APIs the team has confirmed via `context7` MCP against the version present in this repo's lockfile. Saves a context7 round-trip when a stable choice is referenced again.

Each entry's stable key is `<lib>@<version>`. If the lockfile bumps, re-verify and update the version.

---

## context7@mcp

- Role: live library documentation MCP server. Used by `research`, `implement`, `security`, `spec` for any third-party API lookup.
- API: `mcp__plugin_context7_context7__resolve-library-id` then `mcp__plugin_context7_context7__query-docs`
- Verified-at: HEAD
- Last-touched: 2026-04-27
- Caveat: declared in `.mcp.json` at repo root. Travels with the repo; no plugin install required.

## @11ty/eleventy@3.1.5

- Role: static site generator for the marketing site. Reads `site-src/`, writes `site/`.
- Config file: `eleventy.config.cjs` at project root. `.cjs` extension is mandatory because the root `package.json` declares `"type": "module"`. Returns `{ dir, templateFormats, htmlTemplateEngine, markdownTemplateEngine }` plus an `addPassthroughCopy({ "site-src/assets": "assets" })` call.
- Layout dirs: `site-src/_layouts/` for layouts, `site-src/_includes/` for partials, `site-src/_data/` for site-wide JSON data. Pages reference layouts via frontmatter `layout: base.njk` / `layout: docs.njk`.
- Scripts: `npm run build:site` (one-shot), `npm run dev:site` (watch + serve on `:4321` with hot reload).
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat (config filename): the legacy `.eleventy.cjs` filename is NOT recognized in 3.x. Must be `eleventy.config.cjs` (or `.eleventy.js` for ESM). Misnaming silently falls back to defaults and fails layout resolution with confusing "layout does not exist" errors.
- Caveat (imperative API): some 2.x setters were removed in 3.x (`setHtmlTemplateEngine`, `setMarkdownTemplateEngine`). Use the return-value config object for those instead of imperative method calls.

## semantic-release@25.0.3

- Role: the release pipeline driver — runs the plugin chain (commit-analyzer → release-notes → changelog → npm → git → github) on CI to compute next version, generate notes, publish to npm, and tag. Configured in `.releaserc.json` at project root.
- Plugin chain (current): `@semantic-release/commit-analyzer` → `@semantic-release/release-notes-generator` → `@semantic-release/changelog@6.0.3` → `@semantic-release/npm` → `@semantic-release/git@10.0.1` → `@semantic-release/github`.
- Branches config: this repo's `.releaserc.json` declares `branches: ["main"]` and caps via `releaseRules` (see commit-analyzer entry); the `branches` field accepts strings, regex objects, and channel/range/prerelease objects but in this repo it's a flat string array.
- Scripts: invoked via `npm run release` (mapped to `semantic-release` in `package.json → scripts.release`) inside the release CI job.
- Verified-at: 01780d7
- Last-touched: 2026-05-14
- Caveat: v25 requires Node ≥ 20.8.1; CI must run on a recent enough Node. The plugin chain is order-sensitive — `commit-analyzer` must run first (determines release-or-not + bump type), and `git` must run before `github` so the tag exists when GitHub release is created. Trusted-publisher OIDC for npm is a parallel concern handled in the workflow YAML, not in `.releaserc.json`.

## @semantic-release/commit-analyzer@13.0.1

- Role: the first plugin in the semantic-release chain. Parses commits since the last release and decides (a) whether to release at all and (b) the bump type (major / minor / patch) using `releaseRules`. Configured under `plugins[]` in `.releaserc.json` with optional `preset` + `releaseRules` array.
- `releaseRules` shape: an array of objects each matching commits and assigning a `release` verdict. Match keys: `type`, `scope`, `breaking: true`, `revert: true`, `subject`, `header`, `body`, `message` (the last three accept micromatch globs). Verdict values: `"major"` / `"minor"` / `"patch"` / `false` (suppress release for matching commits).
- This repo's usage: `releaseRules` is used to (1) cap `main`-branch releases at 0.x by remapping `breaking: true` to `minor`, and (2) exclude maintenance scopes (e.g. `release`) from triggering a release — the "scope-based filtering" topic queried 24+ times this session.
- Rules are evaluated in array order; the first match wins. To suppress a commit, place its rule before any catch-all.
- Verified-at: 01780d7
- Last-touched: 2026-05-14
- Caveat: `releaseRules` extends but does NOT replace the default preset rules (Angular convention by default) — defaults still apply for commits no custom rule matches. To make a scope explicitly NOT trigger a release, you need an explicit `{scope: "<name>", release: false}` entry that fires before the default `feat`/`fix`/`BREAKING CHANGE` rules. The minor-cap-on-breaking trick (`{breaking: true, release: "minor"}`) only works because rules are evaluated before the preset; it is the documented v0.x safety belt.

## nunjucks@3.2.4

- Role: template engine for every `.njk` file in `site-src/`. Drives layouts, includes, frontmatter variable substitution.
- Eleventy 3.x dropped Nunjucks from its transitive dependencies. Install explicitly: `npm install -D nunjucks`. Without it, Eleventy fails at startup when it tries to render any `.njk` template.
- Frontmatter convention: `layout: <name>.njk` (full filename with extension). Includes use `{% include "<name>.njk" %}`.
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: not the same package as `@11ty/nunjucks` (which is an Eleventy fork at 4.x-alpha). Use the upstream `nunjucks` package; that's what 11ty 3.x's internal Nunjucks engine imports.
