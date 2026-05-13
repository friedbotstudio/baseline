# Marketing site — runbook

## Purpose

A static site at `site-src/` that markets and documents the Claude Code Baseline. Built with Eleventy, output to `site/`. The site is not the product; the product is the constitutional layer specified in `seed.md` and enforced by `CLAUDE.md` plus the hooks in `.claude/`. This runbook covers how to develop, build, and extend the site without drifting from the design system in `DESIGN.md`.

## Develop

| Command | Effect |
|---|---|
| `npm run dev:site` | Eleventy serve on `http://localhost:4321` with live reload |
| `npm run build:site` | Production build into `site/` |

No bundler. No PostCSS. No JS framework. CSS is hand-written in one file. JS has no dependencies.

Eleventy config: `eleventy.config.cjs`. Input `site-src`, output `site`, layouts `_layouts`, includes `_includes`, data `_data`. Passthrough copy: `site-src/assets/` → `assets/`. Template formats: `.njk`, `.html`. Markdown engine: nunjucks.

## File layout

```
site-src/
  _data/
    nav.json              # topnav + sidebar nav (key-driven active state)
    site.json             # brand, tagline, repo, version, year, lastUpdated
  _includes/
    topnav.njk            # sticky header. Renders hamburger only on docs pages
    sidebar.njk           # docs sidebar + nav-backdrop sibling for the mobile drawer
    toc.njk               # right-rail TOC (driven by per-page `toc:` frontmatter)
    footer.njk            # 3-col footer (mobile: brand full-width + 2-col links)
    hero-symbols/         # one .njk per docs hero illustration
      hooks.njk
      memory.njk
      skills.njk
      swarm.njk
  _layouts/
    base.njk              # marketing wrapper (used by index.njk)
    docs.njk              # reference wrapper (sidebar + main + optional toc)
  assets/
    site.css              # all styles (~2050 lines, sectioned by /* ----- */)
    site.js               # dev-console typing, click-to-copy, mobile drawer toggle
  index.njk               # homepage (uses base.njk)
  hooks.njk               # docs page (uses docs.njk)
  memory.njk
  swarm.njk
  skills/
    index.njk
    core.njk
    third-party.njk
```

## Page frontmatter contract

| Field | Layout | Effect |
|---|---|---|
| `layout` | both | `base.njk` for marketing, `docs.njk` for reference |
| `pageTitle` | both | `<title>` content |
| `description` | both | `<meta name="description">` content |
| `permalink` | both | Optional Eleventy permalink override |
| `subtitle` | both | Small mono caps after the brand wordmark. `docs.njk` sets `"/ docs"` automatically; `index.njk` sets `"/ v0"` |
| `active` | both | Key matching one entry in `nav.primary`; topnav highlights it |
| `sidebarActive` | docs | Key matching one item in `nav.sidebar.*.items`; sidebar shows the ink rail on it |
| `eyebrow` | docs | Small accent-caps label above the H1 |
| `titlePrimary` | docs | First half of the bicolor H1 (ink) |
| `titleAccent` | docs | Accent-bearing phrase appended to the H1 (defaults to `"."` per the brand sigil) |
| `lead` | docs | Lead paragraph rendered under the H1 |
| `heroSymbol` | docs | Filename (without extension) under `_includes/hero-symbols/`. When set, `docs.njk` renders a 2-col `.docs-hero` with text on the left and the include on the right |
| `toc` | docs | Array of `{ id, label }` objects rendered as the right-rail TOC |

## Navigation data

`_data/nav.json` has two keys:

- **`primary`** — array of `{ href, label, key }`. Renders as the topnav row. The page's `active` frontmatter must match a `key` for the highlighted state.
- **`sidebar`** — array of groups, each `{ label, items: [{ href, label, key }] }`. Renders inside `aside.sidebar` on docs pages. The page's `sidebarActive` frontmatter must match an item `key` for the ink rail to appear in the gutter.

Adding a new page requires touching `nav.json` (primary or sidebar or both) and setting the matching key on the page. Keys must be unique within their list.

`_data/site.json` carries brand-level constants (`brand`, `tagline`, `repo`, `repoSlug`, `version`, `year`, `lastUpdated`). Edit this file when bumping the version stamp or the "last updated" date.

## Adding a new docs page

1. Create `site-src/<slug>.njk` with frontmatter `layout: docs.njk` plus the docs-only fields above.
2. Add a `nav.primary[]` entry to `_data/nav.json` if it should appear in the topnav. Add a `nav.sidebar[].items[]` entry under the appropriate group with a unique `key`.
3. Set `active` to match the topnav key. Set `sidebarActive` to match the sidebar key.
4. If using a hero illustration, create `_includes/hero-symbols/<name>.njk` containing the SVG, then set `heroSymbol: <name>` in the page frontmatter.
5. Run `npm run dev:site`. Verify: topnav active state, sidebar ink rail, hero render, mobile hamburger drawer (resize to ≤720px), footer.

## Layouts

- **`base.njk`** — minimal wrapper. `<head>` (fonts, favicon, stylesheet), skip link, inline SVG defs (wobble filter), topnav, page content, footer, deferred `site.js`. Use this for marketing pages with no sidebar.
- **`docs.njk`** — extends `base.njk`. Wraps content in `.docs-shell` (3-col grid: sidebar 260px, article, optional TOC 220px), renders `<main id="main" class="article">`, optionally renders `.docs-hero` when `heroSymbol` is set, appends `<footer class="docfoot">` with last-updated and "Edit on GitHub" link, conditionally includes the TOC when `toc:` is set.

A page without a sidebar uses `base.njk`. A page with reference-style nav uses `docs.njk`.

## Mobile drawer mechanics

Markup contract (gated on `subtitle == "/ docs"` so marketing pages stay clean):

- **Toggle** — `topnav.njk` emits `<button class="nav-toggle" aria-controls="docs-sidebar" aria-expanded="false">` only when the page subtitle is `"/ docs"`. The button hosts a single `<span class="bars">` that morphs to an X via `::before` and `::after` pseudo-elements when the drawer is open.
- **Sidebar id** — `aside.sidebar` carries `id="docs-sidebar"` for the `aria-controls` linkage.
- **Backdrop** — sibling `<div class="nav-backdrop" aria-hidden="true">` rendered alongside the sidebar.

CSS state machine (declared inside `@media (max-width: 720px)`):

- `.nav-toggle` switches from `display: none` to `display: inline-flex`.
- `aside.sidebar` becomes `position: fixed; top: var(--header); left: 0; width: min(320px, 84vw); transform: translateX(-100%)`.
- `.nav-backdrop` becomes `position: fixed; inset: var(--header) 0 0 0; opacity: 0; pointer-events: none`.
- `body.is-nav-open` flips the sidebar to `translateX(0)`, raises the backdrop to `opacity: 1; pointer-events: auto`, and locks body scroll via `overflow: hidden`.

Outside the mobile breakpoint, `.nav-toggle` and `.nav-backdrop` carry `display: none`, so the markup is inert.

JS behavior (`site.js`, `setNavOpen()` and listeners):

- Toggle click flips `is-nav-open` and syncs `aria-expanded` + `aria-label` on the button.
- Backdrop click closes the drawer.
- `keydown` for `Escape` closes the drawer and refocuses the toggle.
- A click on any `<a>` inside the sidebar closes the drawer (handles same-page anchors).

Accessibility:

- `aria-controls` and `aria-expanded` keep the relationship explicit for screen readers.
- The `aria-label` toggles between "Open documentation navigation" and "Close documentation navigation" based on state.
- ESC restores focus to the toggle so keyboard users do not lose their place.
- The sidebar already carries `aria-label="Documentation navigation"`.
- The global `@media (prefers-reduced-motion: reduce)` rule at the bottom of `site.css` zeros transition + animation duration, including the drawer slide.

## Design contract

`DESIGN.md` at the repo root is the source of truth for tokens, type scale, spacing, motion vocabulary, and the reserved-accent contract.

- Tokens live in the `:root` block at the top of `site.css` — `--ink`, `--text`, `--charcoal`, `--muted`, `--rule`, `--bg`, `--paper`, `--accent`, `--accent-light`, `--accent-soft`, `--accent-faint`, plus the `--code-*` pair and the layout vars (`--content`, `--sidebar`, `--toc`, `--header`).
- Reserved-accent: orange (`--accent` for the H1 second phrase, eyebrows, primary buttons hover, brand sigil; `--accent-light` for the brand dot, syntax highlights, plate hairlines). Active rails on sidebar + TOC use `--ink`, never accent.
- Fonts are loaded from Google Fonts in `base.njk`: Inter Tight (display, 500/600/700), Inter (body, 400/500/600), JetBrains Mono (400/500). The `--display`, `--body`, `--mono` CSS vars point at them.
- When changing a token, update `DESIGN.md` first; the CSS is the implementation, not the spec.

## Responsive breakpoints

| Max-width | What changes |
|---|---|
| 1100px | TOC right rail hides; `.docs-shell` becomes 2-column (sidebar + article) |
| 1000px | Hero collapses to single column; concept rails (`.is-row`) go single column; wobble-frame rotation drops to 0 |
| 900px | Section ledes collapse to single column; concept grids (`.is-2col`) collapse to single column; install plate stacks |
| 720px | Topnav nav links hide; hamburger button appears (docs only); sidebar becomes the slide-in drawer; `.columns` goes single column; hero meta-strip drops to 3-col (5 stats wrap as 3 + 2); footer stays 2-col with the brand row spanning full-width |

## Visual signature moments

| Moment | Where to find it |
|---|---|
| Hero entrance choreography | `site.css` — `@keyframes fb-rise` + delayed `animation` rules on `.hero .eyebrow / h1 / .lead / .ctas / .meta-strip / .dc-frame` |
| Docs hero entrance | Same keyframe applied to `.docs-hero .eyebrow / h1 / .lead / .docs-hero-symbol` |
| Scroll-driven figure reveals | `site.css` — `@supports (animation-timeline: view())` block targeting `.figure, .figure-strata, .callout, .install` |
| Brand dot infinite ring pulse | `site.css` — `.brand .dot` rule and `@keyframes brand-dot-pulse` |
| Wobble-frame hand-drawn outline | `base.njk` `<svg class="svg-defs">` + `site.css` `.wobble-frame` block |
| Dev-console live typing | `site.js` — `SCRIPT[]` array and `runConsoleLoop()`; markup at `index.njk` `.dc-frame > .dev-console > pre#dc-stream` |
| Click-to-copy install command | `site.js` — `[data-copy]` listener; markup at `index.njk` install plate |
| Active-rail contract | `site.css` — `.nav-group a.is-active::before` (sidebar) and `.toc a.is-active::before` (TOC) |
| Mobile hamburger drawer | `topnav.njk` toggle, `sidebar.njk` backdrop sibling, `site.css` `@media (max-width: 720px)` block, `site.js` `setNavOpen()` |
