---
key: nunjucks@3.2.4
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: template engine for every `.njk` file in `site-src/`. Drives layouts, includes, frontmatter variable substitution.
- Eleventy 3.x dropped Nunjucks from its transitive dependencies. Install explicitly: `npm install -D nunjucks`. Without it, Eleventy fails at startup when it tries to render any `.njk` template.
- Frontmatter convention: `layout: <name>.njk` (full filename with extension). Includes use `{% include "<name>.njk" %}`.
- Caveat: not the same package as `@11ty/nunjucks` (which is an Eleventy fork at 4.x-alpha). Use the upstream `nunjucks` package; that's what 11ty 3.x's internal Nunjucks engine imports.
