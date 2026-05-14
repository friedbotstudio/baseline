# site-relative-urls — archive bundle

**Date:** 2026-05-14
**Track:** chore (no failing-test-driven code change; refactor + test infra + config)
**Trigger event:** First successful Pages deploy of the eleventy site at `https://friedbotstudio.github.io/baseline/` exposed asset 404s — the rendered HTML referenced `/assets/site.css` and `/assets/site.js` as root-relative paths, which resolve to `https://friedbotstudio.github.io/assets/...` (the wrong host root) instead of `https://friedbotstudio.github.io/baseline/assets/...` (the correct project-page subpath).

## What was added

A pure helper + an eleventy filter wrapper + a CNAME + two new test files. The single artifact built by `npm run build:site` now serves correctly at any mount point — `/baseline/` (project-page URL), `/` (custom domain root), or any subpath we ever publish under.

| File | Role |
|---|---|
| `site-src/_filters/rel-url.cjs` | Pure function `relUrl(absPath, pageUrl)` that converts root-style paths (`/assets/site.css`) to page-relative form (`./assets/site.css` from `/`, `../assets/site.css` from `/cli/`, `../../assets/site.css` from `/skills/core/`) using depth derived from `pageUrl` segments. No-ops on empty/non-string, fragment links, protocol-relative, absolute URLs, and already-relative paths. |
| `eleventy.config.cjs` | Imports `relUrl`; registers it as the `rel` eleventy filter (using `function(absPath) { return relUrl(absPath, this.page && this.page.url); }` so `this.page` binds correctly); adds `addPassthroughCopy("site-src/CNAME")` so the CNAME ships in `obj/site/`. |
| `site-src/CNAME` | One-line file: `baseline.friedbotstudio.com`. GitHub Pages reads it from the deployed artifact and serves the site at the custom domain. |
| `site-src/_layouts/base.njk` | `<link href="/assets/site.css">` and `<script src="/assets/site.js">` → piped through `\| rel`. |
| `site-src/_includes/topnav.njk` | Brand link + data-driven nav items piped through `\| rel`. |
| `site-src/_includes/footer.njk` | Brand link + 4 docs nav links piped through `\| rel`. |
| `site-src/_includes/sidebar.njk` | Data-driven nav items piped through `\| rel`. |
| `site-src/index.njk`, `site-src/install.njk`, `site-src/404.njk`, `site-src/skills/index.njk` | Inline page links piped through `\| rel`. External URLs (`{{ site.repo }}`, fonts.googleapis.com) stay as-is — filter is a no-op on them. |
| `tests/rel-url.test.mjs` | 11 unit tests across two suites: passthrough cases (empty/non-string, fragments, protocol-relative, absolute URLs, already-relative) and depth-aware rewriting (depths 0/1/2, bare root, inline fragments, falsy pageUrl). |
| `tests/site-relative-paths.test.mjs` | 1 smoke test that runs `npm run build:site` then walks every `*.html` in `obj/site/` asserting no `<link>`, `<script>`, `<a>`, or `<img>` uses an internal leading-slash href/src. Catches future regressions structurally — a contributor who adds `href="/foo"` without piping through `\| rel` fails this test. |

## Why this matters (vs. the alternatives)

The pre-implementation discussion considered four patterns for "single artifact serves at multiple mount points":

| Pattern | Why not chosen |
|---|---|
| A. `pathPrefix` build-for-one-target | Would force operator to pick: project URL OR custom domain. The other URL 404s or auto-redirects. The user explicitly wanted both to serve real content. |
| B. Page-relative URLs via `\| rel` filter (chosen) | Single artifact, both URLs serve correctly, depth-agnostic via filter, no JS runtime cost, no FOUC, no noscript edge case. One repeated mechanical pattern in templates with structural enforcement via the smoke test. |
| C. `<base href>` set inline by JS + relative URLs | Works at both URLs; JS-runtime cost (small), FOUC risk (small), noscript edge case (broken assets). Chosen against because Pattern B carries the same dual-mount property without the JS dependency. |
| D. Build twice, deploy two artifacts | Workflow + infrastructure complexity; one Pages site can host one artifact. Overkill for this size. |

## What's NOT included (operator actions, post-merge)

This change makes the build emit the right artifact. It does not configure the deployment surface. After this lands, the operator (repo owner) needs to:

1. **DNS** — Add a CNAME record at `baseline.friedbotstudio.com` pointing to `friedbotstudio.github.io` in the friedbotstudio.com DNS provider. Subdomain CNAME, not apex; not pointing at `/baseline/` (DNS doesn't do paths).
2. **GitHub Pages source** — Repo Settings → Pages → Source: GitHub Actions (already required for the existing release workflow's `deploy-pages` job; no change if already set).
3. **Trigger the deploy** — `gh workflow run "Release" --repo friedbotstudio/baseline --field mode=docs-only`. The build uploads `obj/site/` (now with `CNAME` inside it) and the Pages deploy picks up both the content and the custom-domain assertion.
4. **HTTPS** — Once DNS propagates (minutes to ~24h), GitHub auto-provisions a Let's Encrypt certificate for the custom domain. Toggle "Enforce HTTPS" in Settings → Pages once the cert is issued.

After step 3, both URLs serve real content correctly:
- `https://baseline.friedbotstudio.com/` (custom domain, primary)
- `https://friedbotstudio.github.io/baseline/` (project URL, equivalent — GitHub auto-redirects to custom domain once CNAME is set, but if a visitor lands on the project URL anyway, all internal links resolve correctly thanks to the page-relative paths)

## Workflow shape

- **Slug:** `site-relative-urls`
- **Track:** chore
- **Entry phase:** `chore` (per `/triage`)
- **Exceptions:** intake, brd, scout, research, spec, review, tdd
- **Conditional phases run:** `simplify` (diff > 30 lines + > 3 files), `integrate` (diff touches test surface)
- **Conditional phases skipped (with rationale):**
  - `security` — no new attack surface; filter is pure string manipulation, no input from network/users
  - `document` — internal build mechanic; no user-facing prose, no count, no convention added beyond the filter's own JSDoc-style header
  - cross-engine smoke (within integrate) — visual surface is byte-identical to pre-change build modulo URL prefix; the new `tests/site-relative-paths.test.mjs` smoke walker is the cheaper structural equivalent

See `harness.log` (this directory) for per-phase timestamps.

## Companion artifacts (live, not archived)

- The full implementation diff is committed in the same commit as this archive bundle:
  - `site-src/_filters/rel-url.cjs` (new)
  - `eleventy.config.cjs` (filter + CNAME passthrough)
  - `site-src/CNAME` (new)
  - `site-src/_layouts/base.njk`, `_includes/topnav.njk`, `_includes/footer.njk`, `_includes/sidebar.njk`, `index.njk`, `install.njk`, `404.njk`, `skills/index.njk` (template sweep)
  - `tests/rel-url.test.mjs`, `tests/site-relative-paths.test.mjs` (new)
- Pending-questions **Q-002** (silent-failure prerequisites need enforcement ACs) is the meta-finding that informed this work's structure: the asset-404 failure was a silent surprise because nothing in the workflow asserted "the rendered HTML's internal links resolve correctly at the deployed URL". The new `tests/site-relative-paths.test.mjs` smoke walker is exactly the kind of enforcement check Q-002 advocates for. If/when Q-002 is resolved into a binding spec rule, this test pattern is one example of the rule in practice.
