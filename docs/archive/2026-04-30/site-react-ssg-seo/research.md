# Pattern Research — site-react-ssg-seo

The intake fixes the shape: nginx-static deploy, ~6 multi-page surfaces (Home + Hooks + Memory + Skills/Core + Skills/Third-party + Swarm), React **on islands** (AC #13: zero JS on pages with no interactive component), `DESIGN.md` as the single source of design truth (AC #6, #8), byte-deterministic builds (AC #7), Node ≥ 18.17, no git locally. The lockfile is empty — there are no project-level dependencies yet — so versions cited below are flagged `unverified` against a lockfile and pinned only to the current major series confirmed via context7.

## Candidate A — Astro 5.x (with `@astrojs/react`)

- **Summary**: Multi-page-by-default static-site framework whose model is "islands": a page renders to plain HTML server-side; opt specific components into client-side hydration with `client:*` directives. Ships **zero JS by default** on any page that uses no `client:*` directive. Perfect literal match for AC #13.
- **API references (current)**:
  - `astro@5.x` — client directives `client:load`, `client:idle`, `client:visible`, `client:media="…"`, `client:only="react"` — context7 `/withastro/docs` → "Client Directives Overview".
  - `astro@5.x` — file-based routing under `src/pages/` (`.astro`, `.md`, `.mdx`); the chosen URL shape (`/hooks/`, `/memory/`, …) is just folder/file names. context7 `/withastro/docs` → "Hydrate interactive components with client directives".
  - `astro@5.x` — `astro:content` collections for typed MDX, `defineCollection` + `glob` loader. context7 `/withastro/docs` → "Configure content collection loader for MDX files". Useful if Hooks / Skills pages get authored as MDX with frontmatter.
  - `astro@5.x` — global stylesheet imported in frontmatter (`import '../styles/tokens.css'`); `<style define:vars={…}>` bridges JS values into CSS custom properties when needed. context7 `/withastro/docs` → "Define CSS Variables in Astro Style Tag" / "Import global stylesheet in Astro page".
  - `@astrojs/react` integration adds React renderer for `.tsx`/`.jsx` components used inside `.astro` files.
  - `astro@5.x` — files in `public/` are copied through to `dist/` verbatim (no hashing, no rename) — exactly the contract AC #10 needs for `brandmark*` and `favicon/**`.
- **Fits**:
  - Multi-page (~6 pages) — yes, file-based routing; sweet spot.
  - React-on-islands not React-everywhere — yes, this is Astro's central design.
  - nginx-static — yes, `astro build` emits a `dist/` with plain HTML/CSS/JS. No edge runtime, no `_redirects`, no functions.
  - DESIGN.md as single token source — yes, by importing one global `src/styles/tokens.css` derived from DESIGN.md; no Astro feature competes with this.
  - Single-theme light — yes, no theming layer in Astro to disable.
  - Visual-reference reuse from existing `app.jsx` — yes, the existing function components (PipelineSubway, MemoryFlowPlate, SkillCatalog, etc.) carry over as React components mounted via `client:visible` only on interactive bits; non-interactive ones render as static HTML directly from the same JSX tree (Astro renders React components to HTML on the server when no `client:*` is set).
- **Tests it enables**:
  - HTML assertions per page (per-page meta, JSON-LD presence, canonical URL) using `node --test` against the post-build `dist/` (matches the existing test runner in `package.json`).
  - A "no-JS islands" check: walk every `dist/**/*.html`, parse it, assert that pages with no interactive island contain no `<script>` tag pointing into `_astro/`. Directly verifies AC #13.
  - A determinism check (AC #7): `astro build` is deterministic when source is byte-identical and no plugin reads wall-clock or git metadata; SHA256 the `dist/` tree across two runs.
  - A token-drift check (AC #6, #8): grep components for `--color-*` / `--font-*` declarations that don't appear in `DESIGN.md`.
- **Tradeoffs**:
  - **Two component languages.** `.astro` files for layouts and pages, `.tsx` (or `.jsx`) for React. This is Astro's design and the cost of getting islands. The reference-layer `app.jsx` is JSX — it carries over to `.tsx` cleanly; Astro adds `.astro` shells around it. A reviewer may resent the second file type.
  - **Dependency surface**: Astro pulls in Vite, Rollup, and its own core. Lockfile-empty repo gains ~hundreds of transitive deps. Smaller than Next.js/Gatsby; larger than DIY.
  - **Build determinism caveats.** Vite/Rollup's default output is deterministic for byte-identical input, but a few Astro features inject content-hashed filenames; the determinism check (above) verifies the dist tree end-to-end rather than trusting the toolchain.
  - **AC #6 enforcement is convention, not framework.** Astro doesn't itself stop a component from defining `--color-foo: …`. The build needs a check (a small CI script) that grep-asserts no token-shadowing. This is true of every candidate.
  - **No git locally** — Astro itself does not require git. Its docs mention plugins like `astro:git` but they are opt-in.

## Candidate B — Vike + React (Vite-based, prerender mode)

- **Summary**: Vike is a Vite-native meta-framework that renders React via SSR/SSG. Setting `prerender: true` produces fully static HTML for every route at build time. More flexible and lower-level than Astro; you keep React-only authoring (no second component language).
- **API references (current)**:
  - `vike@0.4.x` — `prerender: true` (or `{ partial, parallel, noExtraDir }`) in `pages/+config.ts`. context7 `/vikejs/vike` → "Configure Pre-rendering and Dynamic Routes" / "Configure All Pages for Pre-rendering (SSG + SPA)".
  - `vike@0.4.x` — file-based routing via `pages/<route>/+Page.tsx`, `+config.ts`, `+data.ts`, `+onBeforePrerenderStart.ts`. Same source.
  - `vite@7.x` — Rollup-driven build, deterministic given deterministic input.
  - `react@19.x` — used as the rendering engine; Vike orchestrates `renderToString` / `renderToStaticMarkup` under the hood.
- **Fits**:
  - Multi-page — yes, file-based routing.
  - nginx-static — yes, `dist/client/` is a plain folder of HTML/CSS/JS.
  - React-everywhere — yes (this is React-first; that's what flips against AC #13). See Tradeoffs.
  - DESIGN.md as token source — yes, plain CSS import.
- **Tests it enables**: Same family as Astro — post-build HTML assertions, determinism check. The "no-JS on no-island pages" check is **harder** to satisfy because Vike's default is to ship a hydration bundle per page; you must opt out.
- **Tradeoffs**:
  - **AC #13 is fightable, not free.** Vike's default is React-everywhere with hydration. Achieving "no JS unless an island is present" requires per-page configuration to disable the client bundle (Vike supports this via "SSG-only" pages, but it is opt-in, not the default). Every page becomes a decision rather than a default.
  - **Single-component-language story is the strongest reason to pick this over Astro.** If we strongly prefer authoring everything as `.tsx` and only pages-that-are-islands ship JS, Vike gives that. But operationally we have to be vigilant that no page silently re-acquires a JS bundle.
  - **Smaller community / fewer recipes** for the exact use case (marketing site with islands). The framework is modular and stable but more "build it yourself" once you go past basics.
  - **Same dependency-surface character** as Astro (Vite + Rollup + framework core). No real win on bytes-installed.

## Candidate C — Vite + custom React static-rendering script (DIY)

- **Summary**: Use Vite for the asset pipeline only. Write a small Node script that imports each page-component, calls `react-dom/server`'s `renderToStaticMarkup`, wraps the output in a layout shell, and writes one `.html` per route. Hand-roll routing, sitemap generation, MDX support (or skip MDX entirely and author pages as `.tsx`), and any island wiring (one Vite entry per island, mounted via `<script type="module">` only on pages that include it).
- **API references (current)**:
  - `react-dom@19.x` → `renderToStaticMarkup(<Page />)` returns a plain HTML string with **no `data-reactroot` / hydration attributes**. context7 `/reactjs/react.dev` → "renderToStaticMarkup > Overview" / "Basic usage of renderToStaticMarkup". Optional `identifierPrefix` for `useId` if multiple islands appear on the same page.
  - `vite@7.x` → library-mode build for islands (`build.lib`), or a per-island multi-entry build via `build.rollupOptions.input`.
  - `vite@7.x` → `import.meta.glob` for enumerating page components from a routing convention.
- **Fits**:
  - Multi-page — yes, but you write the routing yourself.
  - React-on-islands — yes, *because you choose what to bundle*. Every island is an explicit decision.
  - nginx-static — yes.
  - DESIGN.md as token source — yes, plain CSS.
  - AC #13 — yes by construction: a page renders via `renderToStaticMarkup` and unless you explicitly add a `<script>` referencing an island bundle, the page has none.
- **Tests it enables**: Same family. The DIY story is the *easiest* to test against AC #13 because the build script is short enough to unit-test directly.
- **Tradeoffs**:
  - **You re-implement what an SSG provides for free.** Routing, sitemap, robots.txt, MDX support, dev-server with content reload, image optimization, asset hashing for bundled JS — every item is now your code. seed.md § VI.4 says "reuse libraries for what they already do." This candidate is the YAGNI violation in candidate form, *unless* the page set is small enough and the requirements narrow enough that the cost stays small.
  - **Realistic effort here is low** because the page set is fixed at ~6 pages, content scope is closed (no per-skill / per-hook expansion per intake), and there are at most a handful of islands (CopyButton, the scroll-spy sidebar, possibly the pipeline subway interactivity).
  - **Smallest dependency footprint** — `react`, `react-dom`, `vite`, and a small handful of build helpers. No framework core.
  - **No off-the-shelf MDX**. If we want MDX for the Hooks/Memory/Skills/Swarm pages, we add `@mdx-js/rollup` and the Vite MDX plugin and own that wiring too.

## Recommendation

**Candidate A — Astro 5.x with `@astrojs/react`.**

Three reasons, in order:

1. **AC #13 is Astro's default, not a constraint we have to enforce.** "Zero JS unless `client:*` is set" is the framework's posture. Vike makes us opt out per page; DIY makes us write a checker. Astro makes the AC structural rather than aspirational.
2. **The page set and content shape match Astro's sweet spot.** Six static pages, with content that benefits from MDX-or-similar (the reference pages enumerate hooks, skills, memory facts in tabular/list form). Astro's content collections are designed for exactly this.
3. **Keeps the visual-reference reuse cheap.** The existing `app.jsx` components — `PipelineSubway`, `MemoryFlowPlate`, `SkillCatalog`, `HookBoundaryGrid`, the `useScrollSpy` hook, `CopyButton` — port to `.tsx` with no logic change. Astro renders them to static HTML server-side; the few that need interactivity (CopyButton, the sidebar's scroll-spy) get `client:visible`.

**What would flip the decision:**

- If a reviewer prefers a single-component-language codebase (`.tsx` only, no `.astro` shells), pick **Candidate B (Vike)**, accepting the cost of opting every page out of hydration to keep AC #13.
- If a reviewer prefers the smallest dependency surface and the page set is *guaranteed* not to grow beyond ~6, pick **Candidate C (Vite + DIY)**. The build script remains short; the tradeoff is ongoing: any new feature (MDX, image optimization, content reloading) becomes our code.
- If the page set were to grow into "one page per skill / one page per hook" (40+ pages) or content-author velocity became the binding constraint, **Astro becomes the strongest pick** by a wider margin (content collections, dev-server, MDX out of the box).

## Open questions

The following are the decisions a human reviewer must make at `/spec` before architecture is fixed. None are blocking research; all materially affect the spec's component diagram.

- **Authoring model inside Astro.** Three choices, in increasing MDX-weight: (a) all pages and components as `.astro` + `.tsx`, no MDX; (b) reference pages (Hooks / Memory / Skills / Swarm) as MDX in a content collection, homepage as `.astro`; (c) all six pages as MDX. (b) is the conventional middle ground; (a) is closest to the existing `app.jsx` and simplest to reason about; (c) is over-MDX-ing for a marketing+docs site this small.
- **Source-of-truth path for design tokens.** `DESIGN.md` is human-authored Markdown with CSS code fences. Two options: (1) hand-maintain a `src/styles/tokens.css` whose contents mirror the CSS fences in `DESIGN.md`, plus a build-time check that the two stay aligned; (2) extract the CSS fences from `DESIGN.md` at build time into a generated `tokens.css`. (2) is more correct (zero drift by construction) but introduces a build step; (1) is simpler and the drift check enforces correctness. Spec to decide.
- **Where does `node_modules` live?** Repo root (the simpler convention) or scoped under `site/` (keeps the CLI scaffolder package's dep surface clean — `package.json → files` already excludes `node_modules`, so this is mostly an aesthetic question; either works for the npm tarball).
- **Fonts: Google Fonts CDN vs self-hosted via `@fontsource/*` packages.** The current site loads Plus Jakarta Sans and Inter from `fonts.googleapis.com`. Self-hosting via `@fontsource/plus-jakarta-sans` + `@fontsource/inter` removes a third-party request and lets nginx set its own caching; cost is bytes shipped from origin and a small build complication. AC #5's Lighthouse Performance ≥ 90 is achievable either way.
- **Asset locations.** Astro's `public/` ships verbatim (matches AC #10). The existing `site/assets/brandmark*` and `site/assets/favicon/**` need to move into `<chosen-source-root>/public/` (or be referenced from there via a build-time copy step). Spec to fix the source layout.
- **MDX or static-defined content for the reference pages.** Tied to "Authoring model" above. If the Hooks / Memory / Skills / Swarm pages are MDX with frontmatter, they get content-collection benefits (typed schema, `getCollection`); if they're hand-written `.astro`, they're simpler but lose the type-safety. Spec to commit.
- **React major version.** Existing site loads React 18.3.1 from a CDN (`site/index.html:1245-1246`). Project has no React in `package.json`. Pick 18.3.x or 19.x. 19.x is current per context7 `/facebook/react` (versions list includes `v19_1_1`, `v19_2_0`). For islands without server components, either works; 19.x is the forward-compatible choice.
- **One small landmine from scout: the webmanifest file at `site/assets/favicon/site.webmanifest`** has icon paths (`/android-chrome-*.png`) that don't match where the icons actually live (`/assets/favicon/android-chrome-*.png`), and empty `name` / `short_name` fields. AC #10 asks for brand assets unchanged. Decide at spec time whether the webmanifest counts as "brand asset" (immutable, ship the bug) or "site config" (correct it as part of the build).
