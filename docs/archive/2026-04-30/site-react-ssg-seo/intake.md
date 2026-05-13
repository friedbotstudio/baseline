# Rebuild the marketing/documentation site as a React + SSG project with first-class SEO

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The marketing/documentation site for `create-baseline` lives at `site/` and is currently a single hand-rolled `index.html` (1,250 lines, 41 KB, all CSS inline) plus a 58 KB `site/assets/src/app.jsx` that runs against globals (`React.useState`, `React.useEffect`) — i.e. CDN-React with no build step, no bundling, no tree-shaking, no asset hashing. Content is hard-coded into the HTML and the JSX module rather than authored as components or content files. SEO is shallow: there is `<title>` + `<meta description>` + favicons + a webmanifest on the one page, but no `sitemap.xml`, no `robots.txt`, no structured data (JSON-LD), no Open Graph image contract, and no per-section/per-page meta — because there is only the one page. Design tokens are duplicated: they exist authoritatively in `DESIGN.md` and again as inline CSS custom properties in `site/index.html`, with no machine link between the two.

The current shape blocks four concrete things:

1. The site can't grow into multi-page documentation (per-skill / per-hook reference) without copy-pasting the head, nav, and styling into every new file.
2. There is no production-grade asset pipeline — bundle size, CSS extraction, image optimization, and content hashing are all absent.
3. Search engines and AI crawlers see a single page with no site graph; no `WebSite` / `SoftwareApplication` schema; no canonical URL discipline.
4. Editing copy means editing 1,250-line HTML with embedded CSS, which is hostile to documentation work.

## Goal

Stand up `site/` as a proper React-based static site, built by an SSG, that emits SEO-complete production HTML for every page and reads the existing `DESIGN.md` tokens as its single source of design truth.

## Non-goals

- **No backend, no server-side rendering at request time.** The output is fully static HTML deployable to any object store / CDN.
- **No CMS integration.** Content is authored as files in this repo (Markdown / MDX or component-defined), versioned alongside code.
- **No user accounts, auth, comments, or interactive write paths.**
- **No analytics product selected here** — see Open questions; the spec phase will decide whether analytics is included at all.
- **No replatforming of `DESIGN.md`.** It remains the source of truth for tokens; the build consumes it, does not regenerate or restructure it.
- **No deletion of existing brand assets** (`site/assets/brandmark*`, `site/assets/favicon/**`) — they are inputs, not work.

## Success metrics

- **Lighthouse SEO score** — baseline: not measured (single hand-rolled page); target: ≥ 95 on every emitted page; measured via: Lighthouse CI on the production build output.
- **Lighthouse Performance score** — baseline: not measured; target: ≥ 90 on the homepage in mobile profile; measured via: Lighthouse CI.
- **Total transferred bytes (homepage, gzipped)** — baseline: ~41 KB HTML + 58 KB JSX runtime + Babel transformer; target: < 80 KB transferred for the above-the-fold render path; measured via: build report.
- **Build determinism** — baseline: no build; target: a single `npm run build` produces byte-identical output across two runs on the same input; measured via: SHA256 diff of the dist directory.
- **Token drift** — baseline: tokens duplicated between `DESIGN.md` and `site/index.html`; target: zero duplication — token source is `DESIGN.md` only, build fails if any component redefines a documented token; measured via: a build-time check.

## Stakeholders

- **Requester**: konark (repo owner, sole maintainer of `setup_exp` per `package.json → repository`).
- **Reviewer**: konark (no other reviewers identified).
- **Operator** (who runs it in prod): konark (the static output will be deployed to whichever target is chosen — see Open questions).

## Constraints

- **Runtime**: Node ≥ 18.17 (per `package.json → engines`). Whatever SSG is chosen must run on this baseline.
- **No git locally** (`.git` is absent). The chosen SSG cannot rely on git metadata for build steps; if it normally does (e.g., Astro's git-based last-modified plugin), that feature must be optional.
- **Existing artifacts must be honored**: `DESIGN.md` (phantomflow-derived tokens, single-theme light) is the design contract; `site/assets/brandmark*` and `site/assets/favicon/**` are pinned inputs; `site/assets/src/app.jsx` carries the section structure (Principle / Pipeline / Memory / Adoption) and is fodder for component decomposition — see Open questions on whether the JSX content carries forward verbatim or is reauthored.
- **The site ships in this monorepo** alongside the `create-baseline` CLI it markets. Build outputs must not pollute the npm package surface (`package.json → files` already names what ships; `site/dist/` or equivalent must not appear there).
- **`workflow.artifacts.document` in `.claude/project.json` was set to `null`** specifically because `docs/site/` was removed (per `docs/init/seed.md` § Deviations). When this work lands, that field must point at the new authoritative site path so `/document` runs against it.
- **Single-theme, light only** — `DESIGN.md` is explicit that the system is single-theme light; the build must not introduce a runtime theme switcher.
- **No new third-party UI libraries** beyond what the SSG itself ships and React. Components compose `DESIGN.md` tokens directly.
- **Deployment target: a self-hosted nginx server.** The build emits plain static HTML / CSS / JS / asset files and nothing else — no edge-only config (`_headers`, `_redirects`, Vercel/Netlify build hooks), no serverless function handlers, no host-specific routing primitives. Anything that requires a non-static runtime is out of scope.
- **Content scope (page set).** The site is multi-page but small. The page set is fixed at intake: a homepage plus reference pages for **Hooks** (single page covering all hooks, not one-per-hook), **Memory** (dedicated page on the memory management system), **Skills** with two sub-surfaces — **Core skills** (the baseline-shipped skills) and **Third-party skills** (vendored / external) — and **Swarm mode** (dedicated page). Per-hook / per-skill / per-command granular pages are explicitly out of scope for this work.
- **`site/assets/src/app.jsx` is a visual-layer reference, not a content source.** The new build re-authors content into the multi-page structure above. The existing JSX may be mined for reusable patterns (token application, glance-card layout, copy-button affordance, table-of-contents pattern, hero composition) but is not carried forward verbatim.
- **Rendering posture: static-by-default with React islands.** Pages emit fully-formed static HTML for all non-interactive content. React (or any client framework) is loaded only on the specific components that require interactivity. A page with no interactive component ships with zero JS bundle attached to it.

## Acceptance criteria

1. Given a clean checkout, when the operator runs the project's documented build command, then a fully static site is emitted to a single output directory, with no JSX/Babel runtime served to the browser at runtime.
2. Given the emitted output, when any HTML file is inspected, then it carries a unique `<title>`, a unique `<meta name="description">`, a `<link rel="canonical">` matching its deploy URL, and Open Graph + Twitter Card meta (image, title, description, url, type) referencing assets that exist in the output directory.
3. Given the emitted output, when the deploy root is inspected, then `sitemap.xml` lists every emitted HTML page with its canonical URL, and `robots.txt` is present and either allows the site or names a deliberate disallow policy.
4. Given the emitted output, when each page is parsed, then it contains at least one valid JSON-LD block whose `@type` is appropriate to the page (homepage: `WebSite` and/or `SoftwareApplication`; other pages: `WebPage` or more specific) and validates against schema.org.
5. Given the production output of the homepage, when a Lighthouse run is executed against it, then SEO score ≥ 95 and Performance score ≥ 90 in the mobile profile.
6. Given the build, when a token (color, type, spacing, motion) referenced by any component is changed in `DESIGN.md`, then a fresh build reflects the change without code edits in any component.
7. Given two consecutive `npm run build` invocations on the same source tree, when the resulting output directories are compared by SHA256, then they are byte-identical.
8. Given a CI run, when the build executes, then it passes a check that no component file redefines a token name already documented in `DESIGN.md`.
9. Given the deployed homepage, when the page is fetched without JavaScript enabled, then the headline, primary navigation, the four section headings (Principle / Pipeline / Memory / Adoption), and primary CTA copy are all visible (i.e., critical content is server-rendered, not hydration-dependent).
10. Given the existing brand assets at `site/assets/brandmark*` and `site/assets/favicon/**`, when the new build runs, then those exact files are referenced (not regenerated, not re-encoded) by the emitted HTML.
11. Given the source tree, when the npm package is packed via `npm pack`, then the build output directory is excluded from the resulting tarball (the marketing site does not ship inside the npx-installed CLI package).
12. Given the build, when the dist directory is inspected, then it contains at minimum the following emitted HTML surfaces: a homepage, a Hooks page, a Memory page, a Skills page (with discoverable Core-skills and Third-party-skills sub-surfaces — exact URL shape resolved in spec), and a Swarm-mode page. Each surface satisfies AC #2–#4 (per-page meta, sitemap presence, JSON-LD).
13. Given the production output of any page that contains no interactive component, when its emitted HTML is inspected, then no `<script>` tag references a React runtime or component bundle (script loading is restricted to the specific pages where an interactive island is present).
14. Given the production output, when it is served through a vanilla nginx static-file configuration with no special directives beyond `try_files`, mimetype mapping, and gzip/brotli, then every page loads at its canonical URL with status 200, internal links resolve, and `sitemap.xml` / `robots.txt` are reachable at the deploy root.

## Open questions

- **Analytics / search.** In scope at all for this work? If yes, which provider class (privacy-respecting like Plausible, in-page like Pagefind for search, none)? Affects `/spec` AC additions only — does not block `/scout` or `/research`. Defaulting to **none** unless raised; can be re-opened in spec.
- **i18n.** English-only, or plan for additional locales now (affects URL structure, sitemap generation, and SSG choice)? Defaulting to **en-only** unless the answer is otherwise.
- **Canonical domain.** Final hostname the site is served under (e.g., `<something>.<tld>` or an IP for early dev) is required to populate canonical URLs, OG image absolute URLs, and `sitemap.xml`'s `<loc>` entries. Can be deferred to deploy time by parameterizing the build via a `SITE_URL` env var with a placeholder default; spec must resolve which approach is taken.
