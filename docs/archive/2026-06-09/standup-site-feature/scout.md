# Codebase Scout Report — feature the standup skill on the marketing site

Eleventy site (`site-src/` → `obj/site/`, config `eleventy.config.cjs:23-25`). Build: `npm run build:site` (= `eleventy`), dev: `npm run dev:site` (port 4321). Scout ran with a structured intake + brief.

## Primary touchpoints

### New files to create
- `site-src/standup.njk` — the feature page. Clone the frontmatter shape of `site-src/swarm.njk:1-22` (layout `docs.njk`, `permalink: /standup/index.html`, `pageTitle`, `title`, `titleAccent: "."`, `eyebrow`, `lead`, `active: standup`, `sidebarActive: standup`, `heroSymbol: standup`, `toc[]`).
- `site-src/_includes/hero-symbols/standup.njk` — REQUIRED. `docs.njk:21` does `{% include "hero-symbols/" + heroSymbol + ".njk" %}`; a missing partial is a build error (AC-3). Clone the SVG structure of an existing one, e.g. `site-src/_includes/hero-symbols/swarm.njk` or `memory.njk` (7 exist: cli, hooks, install, memory, skills, swarm, workflows).

### The terminal-block centerpiece — REUSE, don't invent
- `site-src/index.njk:33-39` — the existing **dev-console component**: `.wobble-frame.dc-frame` → `.dc-bar` (titlebar) → `.dc-dots` (`.r`/`.y`/`.g` traffic lights) + `.dc-file` (path label) → `<pre class="dc-body"><code>`. This is the exact terminal aesthetic the standup readout should use. The hero instance streams via JS (`id="dc-stream"`); the standup block should be a **static** `.dc-body` with the real readout as text. **This satisfies AC-4 (text not image) and AC-9 (real readout) with the established look.**
- CSS tokens for it: `site-src/assets/site.css:31-66` — `--code-bg`, `--code-bar-bg` ("dev-console title bar"), `--code-bar-border`, `--dc-str`/`--dc-ok`/`--dc-wait`/`--dc-dim` (dev-console syntax), `--mac-red` (traffic-light dots), `--tok-*` (syntax tokens). No new color tokens needed.
- Contrast pattern: `site-src/cli.njk:26-34` uses `.cli-preview` for a TTY **image** (`cli-splash.png`). Do NOT copy that for standup — AC-4 forbids an image. Use the `.dc-*` text pattern instead.

### Figure / a11y precedent
- `site-src/index.njk:55,86` — `<figure class="figure-strata" aria-labelledby="strata-cap">` … `<figcaption id="strata-cap">`. `site-src/memory.njk:68` — `<figure class="figure plate-flow" aria-labelledby="memflow-cap">`. The standup readout wraps in `<figure aria-labelledby="...">` + a summarizing `<figcaption>` (AC-4 a11y).

### Homepage teaser — `site-src/index.njk`
- Section order with line anchors: hero (10), What it is (45), Why hooks (122), **How it flows (184)**, Architectural principle (465), **Adoption (519, `id="install"`)**, Common questions (564). The intake says "between How it flows and Adoption"; the concrete recommended slot is a new `<section class="section">` **immediately before line 519 (Adoption)** so the teaser lands right before the install CTA. (Design call: confirm exact slot in spec.)
- Copy-pill to mirror: `site-src/index.njk:552` — `<button class="cli-strip" data-copy="npx @friedbotstudio/create-baseline@latest ." aria-label="...">`. The `/standup` pill reuses `.cli-strip` + `data-copy="/standup"`.
- GA4 CTA pattern: `site-src/index.njk:21` — `<a data-cta="read-the-docs" href="{{ '/skills/' | rel }}">`. The teaser link to `/standup/` uses a `data-cta="..."` attribute (success-metric measurability).

### Nav + footer + catalog wiring
- `site-src/_data/nav.json` — `primary[]` (add `{ "href": "/standup/", "label": "Standup", "key": "standup" }`, natural slot after `/swarm/` or near `/skills/`) AND `sidebar[]` "Reference" group (add the same). 7 primary items today.
- `site-src/_includes/footer.njk:14-18` — the Docs `<ul>` (Hooks, Memory, Swarm mode, Skills). Add `<li><a href="{{ '/standup/' | rel }}">Standup</a></li>`.
- `site-src/skills/core.njk:157-162` — the **Generators** category. The count header is data-driven: `<h2 id="generators">Generators ({{ baseline.skills.byCategory.generators }})</h2>` already renders **2** (set during the standup-skill workflow). The skill NAMES are hardcoded `<li><code>name</code>. desc</li>` — `whatsnew` is at line 162. Add a `<li><code>standup</code>. …</li>` after it. **No count edit needed** (byCategory.generators is already 2).

### Data the page may use
- `site-src/_data/baseline.cjs` — provides `baseline.skills.total`, `baseline.skills.byCategory.*`, `baseline.skills.categoriesWord` (computed from `derive-counts.mjs`). Used already in `skills/core.njk:10-11`. Adding a site page does not change skill counts; `categoriesWord` unchanged (standup joins existing `generators`, no new category) — audit stays green (AC-11).
- `site-src/_data/site.cjs` — `byline`, `tagline`, `repo`, `brand`.

## Entry points that reach this code
- Build: `eleventy` emits `obj/site/standup/index.html` from `site-src/standup.njk` (AC-1 verifiable by building then statting the file).
- Runtime: the page is reached at `/standup/` via topnav/footer/teaser links.
- `docs.njk` layout (`site-src/_layouts/docs.njk:6,9-29`) wraps the page: sidebar include, heroSymbol include, eyebrow, lead (`| safe`), toc.

## Existing tests
- `tests/publish-check.test.mjs` / `tests/derive-counts.test.mjs` — governance counts; not affected (no skill-count change). 
- No existing test renders or asserts site HTML output. The site build itself (`npm run build:site`) is the practical "does it compile + emit the page" check. Spec should decide whether to add a lightweight build/output assertion or rely on the eleventy build + the integrate-phase playwright smoke.

## Constraints and co-changes
- `prefers-reduced-motion` convention is well-established — `site-src/assets/site.css` has 10 `@media (prefers-reduced-motion: reduce)` blocks (lines 259, 386, 616, 883, 952, 1707, 1803, 1888, 1920). Any reveal-on-scroll the standup section adds MUST add its own gated block (AC-8).
- Article X.1 (copy bans) + Article X.2 (design-ui mandatory) bind — `site-src/**` is `tdd.ui_globs`.
- Fonts (`base.njk:10`): Inter Tight, Inter, JetBrains Mono (the mono is what `.dc-body` uses).

## Patterns in use here
- Feature pages are `layout: docs.njk` with a `toc[]` and a `heroSymbol`; sections are `<section class="section">` with `<h2>` headers and the accent-dot (`<span class="accent">.</span>`). Figures use `<figure aria-labelledby>` + `<figcaption>`. The dev-console (`.dc-*`) and install pill (`.cli-strip`/`data-copy`) are reusable components, not bespoke markup. Copy is lowercase and plain.

## Risks / landmines
- **Missing hero-symbol partial = build failure** (`docs.njk:21` include). Create `hero-symbols/standup.njk` before the page references `heroSymbol: standup`.
- **Don't reach for `.cli-preview` (image)** for the readout — AC-4 requires real text; use `.dc-*`.
- **`obj/` is gitignored** (build output) — the committed change is `site-src/**` only; the rendered `obj/site/` is not committed (CI/Pages builds it). The "page reachable" AC is verified by building locally, not by committing `obj/`.
- The homepage is long (631 lines) with several bespoke figures (`figure-strata`, bento grid); insert the teaser as its own clean `<section>`, do not entangle it with neighbors.
- `skills/core.njk` skill names are hardcoded prose; the generators count is data-driven and already 2 — add only the `<li>`, do not touch counts (double-bumping would break audit).
