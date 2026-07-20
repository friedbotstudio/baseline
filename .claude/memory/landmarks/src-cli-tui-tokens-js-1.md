---
key: src/cli/tui/tokens.js:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Foundation — ANSI brand-color helpers translating Friedbot Studio's oklch tokens (from `site-src/assets/site.css :root`) to 24-bit truecolor escape sequences. Exports named helpers (`accentShadow`, `accent`, `accentLight`, `muted`, `success`, `warn`, `error`, `rule`), plus the raw `paintRGB(rgb, text)` function and a frozen `PALETTE` map used by `src/cli/tui/splash.js:1` to paint the wordmark row-by-row (bevel banding: shadow / mid / highlight / mid / shadow). Respects `NO_COLOR` env var and `process.stdout.isTTY`; falls back to plain when either disables color.
- Companion: `src/cli/tui/splash.js:1` (consumes `paintRGB` + `PALETTE.accentShadow/accent/accentLight`), `src/cli/tui/{install,upgrade,doctor,meta}.js` (consume named helpers), `site-src/assets/site.css` (the canonical brand palette these tokens approximate).
- Caveat: the RGB triples are oklch-to-sRGB *approximations*; exact perceptual match is impossible across terminal palettes. The new `accentShadow` triple (122,41,7 ≈ #7a2907) approximates `oklch(35% 0.15 41.5)` — keep it in sync with both the docs-site value and the wordmark's outer bevel bands. If you add another paint helper, also add the matching `PALETTE.<name>` key so splash.js can reach it without importing every helper individually.
