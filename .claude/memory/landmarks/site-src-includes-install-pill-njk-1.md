---
key: site-src/_includes/install-pill.njk:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Domain — compact click-to-copy install-command pill, quieter cousin of `.cli-strip`. Single `<button data-copy="…">` with monospaced command, prompt glyph, and copy/check icon pair. Reuses the existing `[data-copy]` handler at `site-src/assets/site.js:244` (Clipboard API + execCommand fallback; flips `.is-copied` for ~1.8s). Feedback IS the icon swap (copy → check) — no hint-text element by design.
- Companion: `site-src/assets/site.css` `.install-pill` block defines the dark terminal aesthetic at compact scale; `site-src/_data/site.cjs` is unrelated but the sister `site.byline` field shipped in the same workflow. Consumers: `site-src/index.njk` (hero, wrapped in `.hero-install`) and `site-src/install.njk` (page top, wrapped in `.page-install`).
- Caveat: the existing loud `.cli-strip` above the footer of `index.njk` stays unchanged — pill and strip serve different placements (header-adjacent vs. final CTA). Do not collapse them into a shared base class; the duplication is intentional system-kinship at different scales.
