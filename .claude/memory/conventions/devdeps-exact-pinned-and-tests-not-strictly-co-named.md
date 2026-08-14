---
key: devdeps-exact-pinned-and-tests-not-strictly-co-named
category: conventions
scope: [scenario, implement, tdd]
source: code-pattern
convention: A new docs-site FEATURE PAGE is a `layout: docs.njk` peer of `site-src/swarm.njk` / `site-src/memory.njk` (clone its frontmatter: permalink, pageTitle, title, titleAccent, eyebrow, lead, active, sidebarActive, heroSymbol, toc). It REQUIRES a matching `site-src/_includes/hero-symbols/<heroSymbol>.njk` partial — `docs.njk` includes it unconditionally (`{% include "hero-symbols/" + heroSymbol + ".njk" %}`), so a missing partial is a BUILD FAILURE, not a soft warning. Wire the page into discovery in the same change: `site-src/_data/nav.json` (both `primary[]` and the `sidebar` Reference group), `site-src/_includes/footer.njk` Docs list, and the relevant `site-src/skills/*.njk` catalog. For any terminal / command-output / recap UI, REUSE the existing dark dev-console component (`.wobble-frame.dc-frame` > `.dev-console` > `.dc-bar` [`.dc-dots` r/y/g + `.dc-file`] > `pre.dc-body`, defined in `index.njk:33-39` with `--code-bar-bg`/`--dc-*`/`--tok-*` tokens) as STATIC text inside a `<figure aria-labelledby>` + `<figcaption>` (text, never an `<img>`), and the `.cli-strip data-copy="…"` pill for click-to-copy. Do not reinvent either.
why: caught live in `standup-site-feature` (2026-06-09). The page + homepage teaser reused `.dc-*` and `.cli-strip` with zero new component CSS, and the readout-as-real-text satisfied the text-not-image accessibility AC. Hero symbols use bespoke per-symbol CSS scoped under `.<name>-svg` in `site.css`; to keep a page tick self-contained you can instead inline-style the symbol's shapes with `var(--token)` presentation attributes (fill/stroke) plus the shared `.hero-symbol-svg` wrapper, needing no `site.css` edit.
applies-to: `site-src/*.njk` feature pages; `site-src/_includes/hero-symbols/*.njk`; `site-src/_data/nav.json`; `site-src/_includes/footer.njk`; the `.dc-*` and `.cli-strip` components in `site-src/index.njk` + `site-src/assets/site.css`.
verified-at: 8201af6
last-touched: 2026-08-14
---

- how to apply: after any `npm install -D`, edit the new `package.json` devDep to drop the `^`/`~`; run `node scripts/check-files-diff.mjs` (expects "files-diff: clean"). When wiring per-module tooling, pass the test path as an argument; do not infer it.

- how to apply: when authoring tests in `/scenario`, annotate each test with its covered `AC-NNN` (comment or string) so the token lands in the diff; after `/tdd`, run `node .claude/skills/tdd/drift_check.mjs --slug <slug>` expecting exit 0. If an AC is genuinely untested (e.g. an integration AC), add a real test rather than only a comment.

- how to apply: route the page + any teaser through `design-ui`→`impeccable` at `/tdd` Step 6 (Article XI.2 — `site-src/**` is in `tdd.ui_globs`, so the spec MUST carry a populated `## Design calls` row per surface); let the implement tick do only the non-design wiring (nav/footer/catalog); verify with the eleventy build (`npm run build:site` → `obj/site/<page>/index.html`) and, on a UI change, the `/integrate` playwright smoke. Rendered copy on `site-src/**` is Article XI.1-bound (lowercase, no em dash, no fluff).
