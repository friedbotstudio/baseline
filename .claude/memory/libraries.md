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

## nunjucks@3.2.4

- Role: template engine for every `.njk` file in `site-src/`. Drives layouts, includes, frontmatter variable substitution.
- Eleventy 3.x dropped Nunjucks from its transitive dependencies. Install explicitly: `npm install -D nunjucks`. Without it, Eleventy fails at startup when it tries to render any `.njk` template.
- Frontmatter convention: `layout: <name>.njk` (full filename with extension). Includes use `{% include "<name>.njk" %}`.
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: not the same package as `@11ty/nunjucks` (which is an Eleventy fork at 4.x-alpha). Use the upstream `nunjucks` package; that's what 11ty 3.x's internal Nunjucks engine imports.
