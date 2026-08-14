---
key: @11ty/eleventy@3.1.6
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: static site generator for the marketing site. Reads `site-src/`, writes `site/`.
- Config file: `eleventy.config.cjs` at project root. `.cjs` extension is mandatory because the root `package.json` declares `"type": "module"`. Returns `{ dir, templateFormats, htmlTemplateEngine, markdownTemplateEngine }` plus an `addPassthroughCopy({ "site-src/assets": "assets" })` call.
- Layout dirs: `site-src/_layouts/` for layouts, `site-src/_includes/` for partials, `site-src/_data/` for site-wide JSON data. Pages reference layouts via frontmatter `layout: base.njk` / `layout: docs.njk`.
- Scripts: `npm run build:site` (one-shot), `npm run dev:site` (watch + serve on `:4321` with hot reload).
- Caveat (config filename): the legacy `.eleventy.cjs` filename is NOT recognized in 3.x. Must be `eleventy.config.cjs` (or `.eleventy.js` for ESM). Misnaming silently falls back to defaults and fails layout resolution with confusing "layout does not exist" errors.
- Caveat (imperative API): some 2.x setters were removed in 3.x (`setHtmlTemplateEngine`, `setMarkdownTemplateEngine`). Use the return-value config object for those instead of imperative method calls.
