---
key: devdeps-exact-pinned-and-tests-not-strictly-co-named
category: conventions
scope: [scenario, implement, tdd]
source: code-pattern
convention: (1) Every entry in `package.json → devDependencies` SHALL be an EXACT version (no `^`/`~` range). `npm install -D <pkg>` writes a `^` range by default — change it to the bare version immediately. (2) A module's test is NOT reliably named `tests/<basename>.test.mjs`; tooling that needs a module's test SHALL take the test path explicitly rather than derive it from the module name.
why: (1) `scripts/check-files-diff.mjs` enforces `DEVDEP_RANGE_FORBIDDEN` and `tests/publish-check.test.mjs` fails the suite on any ranged devDep (caught `@stryker-mutator/core=^9.6.1` in `-f029`; fix was `9.6.1`). Exact pins keep the published/packed dependency set reproducible. (2) The co-name assumption is false in this repo — e.g. `.claude/skills/memory-flush/route.mjs` is tested by `tests/memory-flush-routing.test.mjs` (not `memory-flush-route.test.mjs`); the mutation oracle (`scripts/mutation-oracle.mjs`) therefore takes `<module> <testPath>` both explicit.
applies-to: `package.json` devDependencies; `scripts/check-files-diff.mjs`; `tests/publish-check.test.mjs`; `scripts/mutation-oracle.mjs` (the `test:mutation` interface).
verified-at: b667aa8
last-touched: 2026-06-21
source: code-pattern
convention: `.claude/skills/tdd/drift_check.mjs` (the harness drift-check-tick) resolves a spec AC to "resolved" ONLY when its literal `AC-NNN` token appears in an IMPLEMENTATION or TEST added-line of the branch diff — never from the spec markdown's own `| AC-NNN |` rows (those are excluded). Descriptive test names alone (`test_when_X_then_Y`) leave every AC `unresolved` and drift_check exits 1 (which the harness treats as a stop-and-surface yield, NO auto-loop).
why: caught live in `standup-skill` (2026-06-08) — all 9 ACs were implemented and green, but the test file used descriptive names with no `AC-NNN` literals, so drift_check reported 9/9 unresolved. The fix is annotation, not code: a top-of-file traceability comment block mapping each `AC-NNN` to its test, plus inline `// AC-NNN` on key tests, puts the tokens in added-lines.
applies-to: `.claude/skills/tdd/drift_check.mjs`; every test file authored under `/scenario` for a spec-track workflow.
verified-at: dba75fe
last-touched: 2026-06-08
source: code-pattern
convention: A new docs-site FEATURE PAGE is a `layout: docs.njk` peer of `site-src/swarm.njk` / `site-src/memory.njk` (clone its frontmatter: permalink, pageTitle, title, titleAccent, eyebrow, lead, active, sidebarActive, heroSymbol, toc). It REQUIRES a matching `site-src/_includes/hero-symbols/<heroSymbol>.njk` partial — `docs.njk` includes it unconditionally (`{% include "hero-symbols/" + heroSymbol + ".njk" %}`), so a missing partial is a BUILD FAILURE, not a soft warning. Wire the page into discovery in the same change: `site-src/_data/nav.json` (both `primary[]` and the `sidebar` Reference group), `site-src/_includes/footer.njk` Docs list, and the relevant `site-src/skills/*.njk` catalog. For any terminal / command-output / recap UI, REUSE the existing dark dev-console component (`.wobble-frame.dc-frame` > `.dev-console` > `.dc-bar` [`.dc-dots` r/y/g + `.dc-file`] > `pre.dc-body`, defined in `index.njk:33-39` with `--code-bar-bg`/`--dc-*`/`--tok-*` tokens) as STATIC text inside a `<figure aria-labelledby>` + `<figcaption>` (text, never an `<img>`), and the `.cli-strip data-copy="…"` pill for click-to-copy. Do not reinvent either.
why: caught live in `standup-site-feature` (2026-06-09). The page + homepage teaser reused `.dc-*` and `.cli-strip` with zero new component CSS, and the readout-as-real-text satisfied the text-not-image accessibility AC. Hero symbols use bespoke per-symbol CSS scoped under `.<name>-svg` in `site.css`; to keep a page tick self-contained you can instead inline-style the symbol's shapes with `var(--token)` presentation attributes (fill/stroke) plus the shared `.hero-symbol-svg` wrapper, needing no `site.css` edit.
applies-to: `site-src/*.njk` feature pages; `site-src/_includes/hero-symbols/*.njk`; `site-src/_data/nav.json`; `site-src/_includes/footer.njk`; the `.dc-*` and `.cli-strip` components in `site-src/index.njk` + `site-src/assets/site.css`.
verified-at: dba75fe
last-touched: 2026-06-09
---

- how to apply: after any `npm install -D`, edit the new `package.json` devDep to drop the `^`/`~`; run `node scripts/check-files-diff.mjs` (expects "files-diff: clean"). When wiring per-module tooling, pass the test path as an argument; do not infer it.

- how to apply: when authoring tests in `/scenario`, annotate each test with its covered `AC-NNN` (comment or string) so the token lands in the diff; after `/tdd`, run `node .claude/skills/tdd/drift_check.mjs --slug <slug>` expecting exit 0. If an AC is genuinely untested (e.g. an integration AC), add a real test rather than only a comment.

- how to apply: route the page + any teaser through `design-ui`→`impeccable` at `/tdd` Step 6 (Article X.2 — `site-src/**` is in `tdd.ui_globs`, so the spec MUST carry a populated `## Design calls` row per surface); let the implement tick do only the non-design wiring (nav/footer/catalog); verify with the eleventy build (`npm run build:site` → `obj/site/<page>/index.html`) and, on a UI change, the `/integrate` playwright smoke. Rendered copy on `site-src/**` is Article X.1-bound (lowercase, no em dash, no fluff).
