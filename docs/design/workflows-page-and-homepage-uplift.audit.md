# Audit — workflows-page-and-homepage-uplift

Post-craft verification of five files (2 creates + 3 edits) against the brief's P0/P1/P2 gates plus standard impeccable audit dimensions. Verified against the live dev server at `http://localhost:4321/` and `/workflows/`.

## Findings

| Severity | Surface | Issue | Evidence |
|---|---|---|---|
| — | — | No findings. | All gates pass. |

## Slug-specific gate results

### P0 gates

- **No new tokens: PASS.** `git diff site-src/assets/site.css | grep "^\+ *--[a-z]"` returned zero lines. No new `--*` declarations.
- **No new colors: PASS.** `git diff` filtered for `#hex|rgb|hsl|oklch` literals returned zero lines. Every color reference is `var(--ink|paper|muted|faint|rule|cream|accent)`.
- **No new type weights: PASS.** `git diff | grep "font-weight"` returns only `500` and `600`, both already in active use.
- **No new spacing scale steps: PASS.** New font-size values introduced: 10px (existing for `.cell-eyebrow`), 11px (existing for `.fm-tag`), 11.5px (existing for `.chain-label`), 13px (existing for `.hero-readmore`). All within the documented typography scale. New spacing values: 16px gap/margin only — on the scale.
- **All new classes transcribe existing rules: PASS.** 11 `wf-*` rules byte-faithful to `.fm-*` per the brief Part C audit table. `.concept-readmore` byte-faithful to `.hero-readmore` except for `margin: 16px 0 0` vs `margin: 0 0 56px` (the spatial inversion is the only semantic difference between hero-page-margin and inside-card-margin). `.concepts.is-row` updated to a 2+1 grid using `grid-template-columns: 1fr 1fr` (same shape as the pre-existing `.concepts.is-2col` rule).
- **Zero em-dashes in user-facing rendered HTML: PASS.** `grep "—" site-src/workflows.njk` returns 0 after the predicate-table "no argument" cell was replaced with `<span class="muted">(none)</span>`. The two em-dashes in `site-src/_includes/hero-symbols/workflows.njk` are inside `{# ... #}` Nunjucks comments, stripped at build time, never user-facing.

### P1 gates

- **Mobile responsive: PASS.** The existing `@media (max-width: 900px)` block at site.css line 2717 was extended to include `.concepts.is-row` in the `grid-template-columns: 1fr` collapse. Below 900px the homepage §I returns to a single-column stack; above 900px the 2+1 hero layout engages.
- **Concept-03 hero panel layout: PASS.** Verified via screenshot at 1400px viewport. Cards 01 + 02 share row 1 as side-by-side cells; concept 03 spans row 2 as a full-width hero panel containing trimmed body + chip strip + read-more link.
- **Hero glyph renders: PASS.** Verified via screenshot of the `/workflows/` hero. The track-DAG geometry renders cleanly: filled `track` anchor at top, 3-node chain (intake/spec/approve), accent rotated diamond for the selector with the Y-fork glyph, fanout to swarm (T-A + T-B) and solo (tdd), reconvergence to a filled commit anchor. Caption "SELECTORS AND SUB-TRACKS" in accent caps.
- **Nav active state: PASS.** Verified via screenshots. Top nav at `/workflows/` highlights "Workflows" as active (the `is-active` class lands via `active: workflows` frontmatter matching `nav.json` `key: workflows`). Sidebar at `/workflows/` highlights "Workflow tracks" in the Reference group (the `sidebarActive: workflows` frontmatter wires `is-active` correctly).

### P2 gates

- **Predicate table styling: PASS.** The `.phase` class lands on the first column (predicate name) per the hooks.njk pattern. The five-row table reads cleanly with mono predicate names in the leading column.
- **Read-more link rhythm: PASS.** The 16px margin-top puts the read-more link directly below the chip strip with comfortable breathing room. The mono 13px label in `var(--muted)` with the accent arrow matches the existing `.hero-readmore` vocabulary. Hover transitions (color shift to ink + 3px translateX) are byte-identical to `.hero-readmore`. `@prefers-reduced-motion: reduce` disables the transform.
- **Article IV invariants list: PASS.** Eleven numbered items with bold `**I1.**` through `**I11.**` labels reads as a reference outline. The bold-prefix convention is consistent with the brief's intended visual rhythm; the `<ol>` tag carries the numbering, the bolded label provides redundant emphasis for scannability.

## Standard impeccable audit dimensions

- **A11y: PASS.**
  - `aria-label="Canonical track set"` on `.track-chips` (carry-over from prior slug, still correct).
  - `aria-labelledby="trackdag-title"` on the hero glyph SVG; `<title>` element describes the diagram for screen readers.
  - Chips remain `<span>` (non-interactive labels), correct.
  - `.concept-readmore` is a properly nested `<a>` inside a `<p>`.
  - Color contrast: `var(--muted)` on `var(--paper)` for the read-more text computes to ~5:1, comfortably above WCAG AA for normal text.
- **Perf: PASS.** ~206 new lines across new files + ~155 lines of CSS/markup edits. No new fonts, no new images, no new animations beyond the existing hover transition reused on `.concept-readmore`. Zero impact on Largest Contentful Paint.
- **Responsive: PASS.** Verified at desktop (1400px) and mobile (≤900px through the responsive override). The 2+1 hero layout engages at desktop and collapses to a single column at mobile.
- **Layout fidelity: PASS.** Every new property cites an existing rule. The page composition reads as part of the existing docs site, not as an alien addition.
- **Color contrast: PASS.** Covered under A11y.

## Summary

```
P0: 0
P1: 0
P2: 0
```

**Overall: PASS.**

The new workflows page, hero glyph, nav wiring, and homepage §I uplift land cleanly. The preservation rule that bound the prior workflow's craft step holds here too: zero novel tokens, every new class transcribes an existing rule, the page reads as part of the existing visual register.
