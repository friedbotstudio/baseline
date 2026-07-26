---
key: github-pages-has-no-redirects-so-a-moved-url-is-a-permanent-404
category: landmines
scope: [scout, spec, document]
source: inferred-from-code
verified-at: e98b712
last-touched: 2026-07-26
caveat: this constrains any future site IA change; check it BEFORE promising a restructure, not after.
---

- **The docs site is GitHub Pages on a custom domain, and Pages supports no per-path redirects at all.** Deploy is `actions/upload-pages-artifact` + `deploy-pages` in `.github/workflows/release.yml`; the domain comes from `site-src/CNAME`. There is no `_redirects`, no `netlify.toml`, no `vercel.json`, no redirect plugin, and no meta-refresh pattern anywhere in the repo.
- **Consequence: moving a URL produces a hard 404 the moment it ships.** The only workaround is a per-old-path meta-refresh stub, which would have to be built from scratch, plus a test asserting each stub resolves, plus a decision between absolute targets (which break the mount-point portability that `site-src/_filters/rel-url.cjs` exists to protect) and depth-computed relative targets (silently easy to get wrong).
- **This is why the 2026-07-26 IA restructure moved ZERO urls.** Nav grouping was reorganised and four pages were added; all 15 existing URLs stayed put. That got the full IA benefit at none of the risk.
- **Related trap, now fixed:** `404.njk` piped its own recovery links through the `rel` filter, which computes depth from the 404 page's own url (`/404.html`, depth 1). Pages serves that one file for a miss at ANY depth, so a miss at `/skills/anything/` resolved every recovery link one level wrong. The 404 page is the one surface that must use absolute `site.url` links; the fix carries a comment saying so.
