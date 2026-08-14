---
key: accent-on-the-alpha-banner-tint-has-no-contrast-headroom-so-opacity-cannot-fix-it
category: landmines
scope: [design-ui, document]
source: inferred-from-code
verified-at: 8201af6
last-touched: 2026-08-14
caveat: measure the blended surface, not the token pair; --accent-soft is an alpha fill, so its effective background is not any token in DESIGN.md.
---

- **`--accent` text on the alpha banner tops out at 3.95:1, so no opacity value reaches the 4.5:1 small-text floor.** The banner's background is `--accent-soft`, which is `--accent-light` at 15% over `--bg`, blending to `#f4dfd6`. Measured against that surface: `--accent` 3.95:1, `--ink` 15.36:1, `--charcoal` 11.35:1, `--muted` 5.81:1, `--faint` 1.93:1. Reaching for `opacity` to de-emphasise small text here makes it strictly worse: accent at `.62` measures **2.37:1**, and even full strength fails.
- **This bit on 2026-07-26** adding 9.5px field keys to the banner (`status` / `stage` / `pin`). The design detector did **not** flag it — it reported a `flat-type-hierarchy` false positive on the same block and stayed silent on the real defect. The catch came from computing the blend by hand, which is the only reliable method: `getComputedStyle` returns `oklch()` in Chrome, so the naive `color.match(/[\d.]+/g)` parse silently reads oklch components as RGB and produces garbage ratios (it reported 1.03:1). Resolve colours through a canvas `fillStyle` round-trip instead.
- **The fix is hue, not transparency.** `--muted` at full opacity clears at 5.81:1 and, being cool slate against a warm field, still reads *quieter* than the accent value it labels. `--charcoal` also passes at 11.35:1 but visually outweighs the thing it labels and inverts the hierarchy. DESIGN.md already says this in prose — *"never use accent for body-size text"* — but states it against `--bg` (5.6:1), which is the surface accent text is NOT on when it sits in the banner.
- **The incumbent banner body has the same problem at 12.5px** (3.95:1 against a 4.5:1 requirement). Pre-existing, untouched, and a separate decision: fixing it means either restating the banner in `--ink`/`--charcoal` and leaving accent to the border and background, or accepting the miss on a status strip. Do not "fix" it as a side effect of adding a field to the banner.
- **Related:** the reserved-accent contract in DESIGN.md lists which surfaces may carry accent at all. Adding a new accent surface is a contract change, not a local style choice.
