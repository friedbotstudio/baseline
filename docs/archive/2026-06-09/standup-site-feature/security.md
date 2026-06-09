# Security reports — standup-site-feature

## standup-site-feature-2026-06-09.md

# Security Review — standup-site-feature — 2026-06-09

## Summary

Overall risk: **LOW** (no findings above informational). The change adds static eleventy templates (a feature page, a homepage teaser, an inline SVG, nav/footer/catalog link wiring) plus one build-output test. It introduces no dynamic data rendering, no new script, no external resources, no input/trust boundary, and no dependencies. Nothing here is attacker-reachable.

## Findings

No Critical, High, Medium, or Low findings. The checks below are recorded as Out of scope / Noted.

## Dependencies

No new packages. The change uses the existing eleventy + nunjucks site toolchain and Node builtins (`node:child_process` `execFileSync`) in the test. A06 (vulnerable/outdated components): not applicable.

## Out of scope / Noted

- **A03 Injection / XSS — not present.** The terminal readout and all page copy are static, author-written HTML embedded literally in `site-src/standup.njk` and the `site-src/index.njk` teaser. None of it derives from user input or a request. The only dynamic expressions are `{{ '/standup/' | rel }}` (a trusted internal-path filter) and existing build-time `{{ baseline.* }}` data. There is no untrusted-data sink, so there is nothing to escape beyond nunjucks' default behavior. (CWE-79 N/A.)
- **No new script.** `site-src/assets/site.js` is unchanged. The `data-copy="/standup"` clipboard pill and `data-cta` attribute are handled by the already-shipped `.cli-strip` behavior; this change only reuses the existing component markup. No new event handlers, no `onclick`/`onload`/`onerror`, no `javascript:` URLs (verified by grep over the new files).
- **Inline SVG hero-symbol is inert.** `site-src/_includes/hero-symbols/standup.njk` contains only shapes, text, `<title>`, and inline presentation attributes. No `<script>`, no `foreignObject`, no external `href`/`xlink:href`, no event handlers (verified). SVG is rendered inline from a trusted template, not from user upload.
- **Links — no external surface added.** The teaser and page link only to the internal `/standup/` route. No new `target="_blank"` and no external `http(s)://` link was introduced (verified), so the reverse-tabnabbing concern (CWE-1022, missing `rel="noopener"`) does not arise here.
- **A08 build integrity — clean.** The build-output test invokes `execFileSync('npm', ['run','build:site'], …)` and `execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], …)` with fixed argument arrays and no shell, so there is no command-injection surface (CWE-78 N/A).
- **Secrets — none.** No tokens, keys, or `.env` content in the diff.
- **A01 access control — N/A.** Static public marketing pages; no authn/authz boundary.

