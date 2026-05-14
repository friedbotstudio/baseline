# Codebase Scout Report — ga4-instrumentation

Scope drawn from `docs/intake/ga4-instrumentation.md` Problem + Goal: inject the gtag.js loader on every site page; instrument three interactions (button clicks, install-command copy, outbound clicks to `friedbotstudio.com`).

## Primary touchpoints

- `site-src/_layouts/base.njk:3-13` — the universal `<head>`. Every page-generating layout chains through here. `docs.njk` declares `layout: base.njk` at its top, so `base.njk` is the single ancestor of every rendered page. **Single injection point** for the gtag loader; line 13 (immediately before `</head>`) is the natural slot.
- `site-src/_layouts/docs.njk:1-3` — extends `base.njk`. Used by `cli.njk`, `hooks.njk`, `install.njk`, `memory.njk`, `swarm.njk`.
- `site-src/index.njk:343-351` — the existing install-command copy affordance. A real `<button class="cli-strip" data-copy="npx @friedbotstudio/create-baseline@latest .">…</button>` with hint state machine and SVG check icon. The JS handler is already wired (see below). Instrumenting copy is a *bolt-on* event, not new clipboard work.
- `site-src/assets/site.js:244-271` — `document.querySelectorAll("[data-copy]")` is the existing copy handler. Single delegated listener attaches `click` on every `[data-copy]` element. The GA event fire belongs inside this same handler (or a sibling listener registered against the same selector) so we measure the same gesture the user actually performs.
- `site-src/_includes/footer.njk:9` — **the only outbound link to `friedbotstudio.com` in the entire site**. `<a href="https://friedbotstudio.com">Friedbot Studio Private Limited</a>`. Since the footer is included from `base.njk:45`, this link appears on every rendered page. There is **one** location to instrument; no proliferating selector required.
- `site-src/_includes/topnav.njk:3-9` — the only other `<button>` element on the site, used as a docs sidebar toggle (renders only when `subtitle == "/ docs"`). Not a CTA in the marketing sense.
- `site-src/index.njk:17-18`, `site-src/404.njk:15-16` — anchor elements styled as buttons (`<a class="btn btn-primary">`, `<a class="btn btn-secondary">`). These are the marketing CTAs (`Get the baseline`, `Read the docs`, `Back to overview`, `Install instead`). They are *not* `<button>` elements; the intake's "button clicks" wording maps to these CTA-class anchors.

## Entry points that reach this code

- The eleventy build entry is `npm run build:site` → `eleventy.config.cjs`. Site source: `site-src/`. Output: `obj/site/`.
- Eleventy template engine: nunjucks (`njk`). The `rel` filter at `eleventyConfig.addFilter("rel", …)` rewrites root-style internal paths at render time; **external URLs and inline `<script>` tags do not pass through `rel` and need no special treatment**.
- The dev preview runs via `npm run dev:site` → `eleventy --serve --port=4321`. Same build pipeline; differs only in environment.

## Existing tests

- `tests/site-relative-paths.test.mjs` — walks every `*.html` in `obj/site/` after a fresh `npm run build:site` and asserts no internal href/src starts with `/`. **Directly relevant pattern** for asserting gtag presence per-page: same `obj/site/` walk, different assertion (`grep` for `googletagmanager.com/gtag/js?id=G-MYCZFYXE38` per file).
- `tests/site-build-id.test.mjs` — the closest existing analogue. Three tests: (1) structural assertion that `footer.njk` interpolates `build.build_id`; (2) `_data/build.js` returns `gha-<GITHUB_RUN_ID>` when set; (3) returns `'dev'` when unset. **Exact template for the dev-vs-prod data-file tests** we will need (env-gated measurement ID).
- `tests/rel-url.test.mjs` — unit tests for the `rel` filter. Not affected by this work.
- `tests/publish-check.test.mjs`, `tests/npm-pack-tarball.test.mjs` — package-publication tests. Not in scope; `site-src/**` does not ship in the npm tarball.

## Constraints and co-changes

- **Dev-vs-prod detection is already established.** `site-src/_data/build.js` already keys off `process.env.GITHUB_RUN_ID` to decide `gha-<id>` vs `'dev'`. **This is the precedent** for any new analytics data file (e.g. `site-src/_data/analytics.js`). The intake's open question about dev-vs-prod handling has a clear pre-existing pattern.
- **Site data files live at `site-src/_data/`.** Current files: `baseline.json`, `build.js`, `nav.json`, `site.cjs`. Adding `analytics.js` (or `analytics.cjs`) is the natural co-change.
- **Eleventy passthrough copy** at `eleventy.config.cjs:4` already wires `site-src/assets/` → `obj/site/assets/`. The gtag loader is inline `<script>` in `base.njk`; the **handler code** (event listeners) belongs in `site-src/assets/site.js` next to the existing `data-copy` handler.
- **Article X.1 copy-register rules apply to `site-src/**/*.njk`.** Any added inline prose must follow the bans (no em-dashes, no hero-metric, etc.). The gtag snippet itself is HTML/script, not copy — register rules do not apply to it. Inline comments inside `<script>` are also code, not copy.
- **CSS class `.btn`, `.btn-primary`, `.btn-secondary`** are defined at `site-src/assets/site.css:334-347`. The instrumentation only needs to *read* these selectors (or a `data-*` attribute we add); CSS changes are not in scope.
- **Layout chain is exactly 2 levels deep.** Every page is `<page>.njk` → `docs.njk` → `base.njk`, or `<page>.njk` → `base.njk`. No deeper chain to worry about.

## Patterns in use here

- **Inline `<script>` blocks at the bottom of `base.njk`** are already in use — there is a "console signature" IIFE at `base.njk:47+` (continues past the head into the body close). Adding a gtag block in `<head>` matches the existing styling.
- **`_data/*.js` modules use ESM `export default`** (per `build.js`) for env-driven values, and **CommonJS `module.exports`** (per `site.cjs`) for static values. Either form works; pick by need.
- **Tests dynamically import `_data/*.js` with URL cache-busting** (per `tests/site-build-id.test.mjs:39-58` and the convention recorded in `.claude/memory/conventions.md → test-esm-env-cache-bust`) so the same module can be tested under different `process.env` states.
- **YAML-free workflow assertions** (the `topLevelBlock` / `jobBlock` helpers in `.claude/memory/conventions.md → test-yaml-line-parsing`) are not applicable here; no `.github/workflows/` change is anticipated.
- **The existing `data-copy` handler is a delegated `querySelectorAll`** — register-once, attach-per-element. Pattern: a follow-up `analytics.js` (or extension to `site.js`) can register a single delegated `click` listener on `document` that branches by selector match.

## Risks / landmines

- **Only 2 real `<button>` elements exist.** The intake says "button clicks across the site" — this is plausibly a *category mismatch* with the actual DOM. The marketing CTAs (`Get the baseline`, `Read the docs`, etc.) are styled `<a>` tags, not `<button>`s. Spec should clarify whether the AC means `<button>` (DOM-strict; tiny surface, just `cli-strip` + `nav-toggle`) or "CTA-style elements" (broader, includes the four `.btn-primary`/`.btn-secondary` anchors). Lazy interpretation could under-instrument the site.
- **The `nav-toggle` button** is purely UI mechanical (open/close docs sidebar). Tracking it as a "button click" event probably isn't useful analytically. Spec should either exclude it explicitly (selector allowlist) or accept the noise.
- **`cli-strip` button click === copy command event** (it is the same gesture). If we fire both `button_click` and `copy_command` for the same click, we double-count. Spec should either treat copy as a *specialization* of button (one event with parameter) or exclude `cli-strip` from the general button listener.
- **`friedbotstudio.com` link is in the footer** — the footer appears on every page, so the outbound link is universal. But it is *one specific anchor*. Spec should decide: instrument by URL match (any `<a href*="friedbotstudio.com">`), by adding a `data-outbound` attribute, or by hardcoding the footer template. URL match generalizes if more friedbotstudio.com links appear later; explicit attribute is more deliberate.
- **The "click to copy" UX already wraps `data-copy` clicks in a state-machine** (`is-copied` class, hint swap, 1800ms reset). The GA event fire must not interfere with this animation; ideally it's `gtag('event', …)` called *alongside* `navigator.clipboard.writeText`, not awaited.
- **`navigator.clipboard.writeText` is async** and there's a `try/catch` fallback to `execCommand("copy")`. The GA event should fire regardless of which path succeeded (or even if both fail) — the *user intent* is what we're measuring, not the technical outcome.
- **External font preconnects** at `base.njk:8-10` go to `fonts.googleapis.com` / `fonts.gstatic.com`. Adding `<link rel="preconnect" href="https://www.googletagmanager.com">` would mirror this pattern for the gtag loader. Performance-relevant but not required.
- **`obj/site/` is gitignored** (per the eleventy output convention; the build target is regenerated). Test assertions that walk `obj/site/` already account for this and trigger a build in `before()`.
- **No existing analytics code on the site.** Clean slate — no conflicting `dataLayer`, no other GTM/plausible/posthog tag to worry about. The constitutional voice console-signature IIFE at `base.njk:47+` is unrelated; it only writes to `console.log`.

## Resolves these intake open questions

- **Q (dev-vs-prod handling)** → established precedent: `process.env.GITHUB_RUN_ID`. A new `site-src/_data/analytics.js` keying on the same env var fits naturally; pages in dev get an empty measurement ID (or `undefined`) and a templated `{% if analytics.measurement_id %}` guards the snippet emission. Confirmed in spec.
- **Q (where in eleventy layout)** → `site-src/_layouts/base.njk` head, one injection. `docs.njk` chain-inherits.
- **Q (install command + copy affordance exists?)** → Yes. `site-src/index.njk:343` (`<button class="cli-strip" data-copy="…">`). JS handler at `site-src/assets/site.js:244`. Bolt-on the GA event, no new UI work.
- **Q (which buttons to instrument?)** → The DOM contains only `cli-strip` and `nav-toggle` as real `<button>`s; the *marketing CTAs* are `<a class="btn-*">`. Spec must decide DOM-strict vs CTA-broad. Scout recommends CTA-broad: instrument by `data-track` attribute (added explicitly to CTAs + cli-strip) for deliberate scope.
- **Q (outbound link scope)** → Currently exactly one link to `friedbotstudio.com` (footer.njk:9, on every page). Selector strategy is a spec call: URL-match generalizes; explicit `data-outbound` is deliberate.

## Still open for research / spec

- Cookie-consent posture for this iteration (deploy without banner vs include one; GDPR position).
- Outbound link click measurement: synchronous before navigation (`transport_type: 'beacon'` / `event_callback`) vs async accept-some-loss.
- Event parameter schema: should align with `.claude/skills/google-analytics/references/recommended-events.md` where applicable; bespoke names for events not in the recommended set.
