# Design audit — cli-strip-fit-scoped-name

Two surfaces in one chore. Both polished in one iteration each.

---

## Surface 1 — Hero SVG label (CLI page)

**Target:** `site-src/_includes/hero-symbols/cli.njk` + `site-src/assets/site.css`.

### Audit 1 (pre-polish) — P0=1, P1=0

| Finding | Severity | Detail |
|---|---|---|
| Text overflow | P0 | `npx @friedbotstudio/create-baseline` at 14px mono / 600 / -.005em measures ~307px against a 232px rect. Visible UI break. |

### Polish — applied changes

1. `cli.njk` line 12: `<rect class="cf-cmd" x="64" width="232"/>` → `<rect class="cf-cmd" x="44" width="272"/>`. Symmetric viewBox margins; right edge x=316 mirrors mode-rects span (x=48-312).
2. `site.css` line 1956: `.cmdfork-svg .cf-cmd-label { font-size: 14px → 12px }`. Char width drops from 8.3px to 7.2px.

### Audit 2 (post-polish) — P0=0, P1=0

37 chars × 7.2px = 266px ≤ 272px rect. Center alignment preserved (x=180 = (44+272)/2). Surrounding geometry (fork y=106, mode rects y=188, caption y=334) unmoved. **Final state: clean.**

---

## Surface 2 — Landing CLI strip + dev-window install snippet

**Target:** `site-src/assets/site.css` (markup in `site-src/index.njk` unchanged).

### Audit 1 (pre-polish) — P0=0, P1=2

| Finding | Severity | Detail |
|---|---|---|
| Install-snippet line clipping at narrow viewports | P1 | `.install-snippet pre` is 13px mono inside parent with `overflow: hidden`. The 47-char install line is ~367px wide; at <380px viewports the snippet inner width is smaller and the long line is silently clipped (no horizontal scrollbar). |
| `.cli-strip` cli-cmd wrap at narrow viewports | P1 | At 12.5px font (<720px breakpoint), cli-cmd is 330px. At viewports <400px, the strip's inner width is smaller; `.cli-cmd` has no `white-space` rule so it wraps onto a new line, breaking the single-line strip aesthetic. |

### Polish — applied changes (CSS-only; markup + data-copy unchanged)

1. `.install-snippet pre`: add `overflow-x: auto`. Long install lines scroll horizontally inside the snippet without breaking the parent's rounded border-radius.
2. `.cli-prompt`: add `flex: 0 0 auto` so the `$` glyph never shrinks.
3. `.cli-cmd`: add `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Flex-shrinkable; elides gracefully at extreme widths. Data-copy attribute on the parent button stays verbatim for clipboard fidelity.
4. New `@media (max-width: 480px)` rule: `.cli-strip { font-size: 11.5px; gap: 8px }`. Gives cli-cmd more room before ellipsis kicks in on phones.

### Audit 2 (post-polish) — P0=0, P1=0

Viewport math after polish:

| Viewport | Strip inner | cli-cmd at active font | Outcome |
|---|---|---|---|
| 1440px | ~640px | 14px → 370px | full text, no ellipsis |
| 720px | ~640px | 12.5px → 330px | full text |
| 480px | ~400px | 11.5px → 290px | full text |
| 375px | ~295px | 11.5px → 290px | full text (5px margin) |
| <375px | <290px | 11.5px → 290px | graceful ellipsis; data-copy intact |

Install-snippet long line scrolls horizontally on narrow viewports; rounded corners preserved. **Final state: clean.**

---

## Combined design audit summary

| | Pass | Notes |
|---|---|---|
| Em dashes in copy | n/a | No prose changes |
| OKLCH color discipline | yes | No color tokens touched |
| Type hierarchy ≥1.25 ratio | yes | 14px caption / 12px label maintained on surface 1; cli-strip 14→12.5→11.5 progression maintains contrast at each breakpoint |
| Card-grid / hero-metric / glass / gradient-text bans | n/a | None used or added |
| Layout property animation | n/a | No motion added |
| AI slop test | yes | Mechanical fit fixes; no category-reflex aesthetics introduced |
| Data-copy clipboard fidelity | yes | Verbatim install command preserved |

Both surfaces clean on iteration 1; iteration cap (3) not exhausted; `final_state: complete` for the chore.
