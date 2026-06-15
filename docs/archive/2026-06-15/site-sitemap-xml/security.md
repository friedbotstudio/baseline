# Security reports — site-sitemap-xml

## site-sitemap-xml-2026-06-15.md

# Security Review — site-sitemap-xml — 2026-06-15

## Summary

Overall risk: **LOW** (effectively none). The change is a static-site addition: an Eleventy template (`site-src/sitemap.njk`) that renders `obj/site/sitemap.xml` at build time, plus a build-time `url` field on `site-src/_data/site.cjs` read from the existing `site-src/CNAME`. No runtime service, no request handling, no secrets, no network, no new dependency. The diff was reviewed against the OWASP Top 10; nothing applies.

## Findings

None at any severity. Notes on the surfaces checked:

- **Information exposure (A01/A05):** the sitemap lists the site's public page URLs. These are already public (the pages ship in `obj/site`); a sitemap is their intended discovery mechanism. The `/404.html` page is excluded. No private path, draft, or state file is emitted (`collections.all` is the rendered public page set; the sitemap excludes itself via `eleventyExcludeFromCollections`).
- **Injection (A03):** `site.cjs` reads `site-src/CNAME` with `fs.readFileSync` and interpolates it into `https://<cname>`. The CNAME is a repo-owned, version-controlled file (the GitHub Pages domain assertion), not external input. The value flows into Nunjucks text output, not a shell or a query. No injection path.
- **XML correctness:** output is well-formed (`<?xml?>` + `<urlset>`); `<loc>` values are absolute under the CNAME origin. Page URLs are baseline-controlled slugs, so no untrusted content is interpolated into the XML without context.
- **Crypto / authn / SSRF:** not applicable — no crypto, no auth, no outbound requests (the build reads a local file; gitignore.io and other network surfaces are not touched by this change).

## Dependencies

No npm packages added or upgraded. The community sitemap plugin was deliberately rejected in research (offline-first, no new dep). `npm audit` not applicable.

## Out of scope / Noted

- `obj/site/sitemap.xml` is build output under the gitignored `obj/` tree; only the source (`sitemap.njk`, `site.cjs`) is committed.
- The origin is single-sourced from `CNAME`, so a domain change updates the sitemap automatically with no second edit to keep in sync.

