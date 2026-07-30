# DESIGN.md

Design system for the baseline marketing and documentation site at `site-src/`. This file is the contract that `design-ui` and `impeccable` load on every UI invocation. Tokens, type scale, spacing rhythm, and the reserved-accent posture come from here. Edit this file to evolve the system; do not redefine these tokens at the component level.

> **Revision note (2026-07-28).** This file replaces the `Quiet authority / editorial calm` extraction of 2026-05-11 (Inter Tight, cool off-white `#fcfcfa`, wobble-filter SVG frames, live-typing dev console). That world has been retired. The replacement world is **pinned by reference**, not chosen: `docs/references/Baseline Landing.dc.html` and `docs/references/Baseline Docs - Org Setup.dc.html` are binding comps recorded in `PRODUCT.md → Brand Commitments`. Where this file and those comps disagree, the comps govern and this file is corrected.
>
> The old world's `site-src/` tree is preserved locally at `site-src.backup/` (gitignored) during the rebuild.

---

## Direction contract

**THESIS.** The product's proof is an agent being stopped, so the page shows a real refusal in the first viewport instead of describing one. It refuses the category default of a centered hero over a soft gradient with three equal feature cards below.

**OWN-WORLD.** Warm paper ground, near-black ink, one burnt orange. Structure is drawn with 1px hairlines and 1px grid gutters, never with cards, radii, or shadows — every corner in the system is square. Terminal plates are solid ink blocks. Type is IBM Plex Sans and IBM Plex Mono throughout.

**STORY.** A tool-chain-literate engineer sees Claude blocked at the tool boundary, understands the enforcement is structural rather than instructional, and copies the install command.

**FIRST VIEWPORT.** Dark utility bar with inline install button. Peach band beneath it: 76px headline left, refusal terminal right, overhanging the band's bottom edge by 40px so the plate breaks the band.

**FORM.** Pinned by the user to `docs/references/Baseline Landing.dc.html`. No seed roll was run: a brief-pinned direction beats the roll.

---

## Register

**Warm technical press.** Paper and ink, set like a printed specification rather than a product page. Density is medium: generous vertical rhythm between sections, tight and rule-bound inside them. The page reads as evidence laid out for inspection.

Two devices carry the identity and appear on every surface:

1. **Hairline bento grids.** Related cells sit in a CSS grid with `gap: 1px` over a `--rule` background and a `--rule` border. The gap *is* the rule; no cell owns a border. This is how the system draws structure.
2. **Ink terminal plates.** Solid `--ink` blocks with a title bar (`--rule-dark` underline, mono filename or context on the left, a copy affordance or status dot on the right) and a mono body. They carry the product's own vocabulary: refused tool calls, install commands, JSON status.

Single theme, light only. No `[data-theme="dark"]` block, no theme toggle. The ink surfaces are a material in the light theme, not a dark mode.

**Square corners are load-bearing.** `border-radius` is `0` everywhere: buttons, chips, plates, grids, inputs. A rounded corner anywhere in this system is a defect, not a variation.

---

## Color tokens

```css
:root {
  /* Ground */
  --paper:       #fbf9f5;  /* page ground, grid cell fill */
  --sand:        #f0ece4;  /* alternating section band, chips */
  --sand-light:  #f7f4ee;  /* nested panel inside a band */
  --stratum-3:   #efeae0;  /* third step of the strata ramp */
  --peach:       #f4ddcd;  /* hero band, closing CTA band, hover fill */

  /* Ink */
  --ink:         #15130f;  /* text, terminal plates, dark bands */
  --ink-deep:    #0f0e0b;  /* footer only, one step below --ink */
  --ink-soft:    #241f18;  /* ink button hover */

  /* Text */
  --text:        #15130f;  /* headings, primary body */
  --text-body:   #3d382f;  /* dense body inside grid cells */
  --text-lead:   #4a463e;  /* section lead paragraphs */
  --text-muted:  #5f5a51;  /* cell descriptions, chips, FAQ answers */
  --text-dim:    #6e685e;  /* captions, annotations, diagram labels */
  --text-peach:  #5b4335;  /* body on --peach */
  --text-peach-2:#6b4c37;  /* secondary body on --peach */

  /* Text on ink */
  --on-ink:      #f4ede2;  /* headings and emphasis on ink */
  --on-ink-body: #c8c0b3;  /* body and terminal output on ink */
  --on-ink-muted:#a9a196;  /* secondary body on ink */
  --on-ink-dim:  #8b8377;  /* labels on ink */
  --on-ink-faint:#8a837a;  /* comments, metadata on ink */

  /* Accent */
  --accent:      #c2440c;  /* the reserved orange */
  --accent-deep: #a33a09;  /* accent text on --peach (contrast) */
  --accent-dark: #8f3208;  /* link hover on paper */
  --accent-hover:#a5380a;  /* accent button hover */
  --accent-light:#e0873f;  /* accent on ink surfaces (contrast) */

  /* Rules */
  --rule:        rgba(0,0,0,.12);  /* grid gutters, section rules */
  --rule-soft:   rgba(0,0,0,.09);  /* list dividers, sidebar edge */
  --rule-dark:   rgba(255,255,255,.09); /* divisions on ink */
  --rule-dark-2: rgba(255,255,255,.16); /* outlined control on ink */

  /* Terminal semantics */
  --term-blocked:#d9614f;  /* refused tool call */
  --term-ok:     #9aa87a;  /* string literals, success */
}
```

**Six tokens were lightened or darkened against the comps to reach AA.** The pinned references carry presentation, not an accessibility contract, and their raw values produced 42 sub-4.5:1 text pairs when built. Corrected: `--text-muted` (`#736d62` → `#5f5a51`), `--text-dim` (`#8a8377` → `#6e685e`), `--on-ink-faint` (`#6f675c` → `#8a837a`), `--term-blocked` (`#d1503f` → `#d9614f`), plus `--on-ink-muted` and `--stratum-3` promoted from literals. `--text-faint` (`#a29886`, 2.7:1) was deleted rather than corrected — it duplicated `--text-dim` once compliant. Hue and role are unchanged in every case; this is the pinned world at a legible lightness, not a different world.

**Reserved accent contract.** Orange is a state and structure device, never decoration. It is permitted on: section markers (`§ I`), cell eyebrows, stat numerals, step ordinals, the active nav rail, focus rings, link hover, terminal prompt glyphs and the `$` sigil, and the gate markers and gate rules in the workflow diagram. It is not permitted on body text, headings, or as a fill for anything that is not an action or a marker.

**No control carries an accent fill** (revised 2026-07-28, when the utility bar's `npx` button became a repo link). The install command is ink-filled and the repo button paper-filled; accent survives on those two as the `$` sigil and the focus ring. This is deliberate — an accent fill on a control competes with the accent's job of marking gates and section structure, which is what the page is actually about.

**Contrast switching is mandatory.** `--accent` clears 4.84:1 on `--paper` but only 4.32:1 on `--sand`; on `--sand` and on `--peach`, small accent text switches to `--accent-deep`. On `--ink` and `--ink-deep` it switches to `--accent-light`. Paper-ground text tokens (`--text-muted`, `--text-dim`) are never used on `--peach`; that ground has its own pair, `--text-peach` and `--text-peach-2`. These substitutions are not optional refinements.

---

## Type

```css
--sans: "IBM Plex Sans", system-ui, -apple-system, Segoe UI, sans-serif;
--mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

IBM Plex is **pinned by the reference comps**, not selected. It is not free to be re-picked on taste; changing it is a change to a binding brand commitment.

Type is a **role scale**, not a set of values. Roles are named for the job they do (`--t-body`, `--t-dense`, `--t-lead`) and declared in `rem`, so a reader who raises their browser's default font size gets a larger page. Prose runs on **four** roles; the seven arbitrary sizes that preceded them (13 / 14 / 14.5 / 15 / 15.5 / 16.5px) could not carry four different jobs, let alone seven.

| Role | Token | Size | Weight | Line-height | Job |
|---|---|---|---|---|---|
| Display | `--t-display` | `clamp(2.875rem, 5.4vw, 4.75rem)` | 600 | 0.98 | Hero H1, one per page |
| Title | `--t-title` | `clamp(2.375rem, 4vw, 3.375rem)` | 600 | 1.02 | Docs H1 |
| Section | `--t-section` | `clamp(1.875rem, 3vw, 2.5rem)` | 600 | 1.10 | H2 |
| Band | `--t-band` | `2.125rem` | 600 | 1.12 | Secondary-offer and closing-band H2 — deliberately a tier below Section, and never adjacent to one |
| Sub | `--t-sub` | `1.3125rem` | 600 | 1.25 | H3 |
| Cell | `--t-cell` | `1.0625rem` | 600 | 1.30 | Grid-cell and stat headings |
| Lead | `--t-lead` | `1.25rem` | 400 | 1.55 | Page-level intro |
| Lead (section) | `--t-lead-sm` | `1.125rem` | 400 | 1.60 | Section-level intro |
| Body | `--t-body` | `1rem` | 400 | 1.65 | All prose |
| Dense | `--t-dense` | `0.875rem` | 400 | 1.55 | Footer, panel notes, lane cells, docfoot |
| Nav | `--t-nav` | `0.84375rem` | 400/600 | 1.30 | Sidebar and TOC rows |
| Nav (sub) | `--t-nav-sub` | `0.78125rem` | 400 | 1.40 | Nested TOC rows |
| Label | `--t-label` | `0.6875rem` | 500/600 | 1.00 | Mono caps eyebrows and kickers |
| Meta | `--t-meta` | `0.78125rem` | 400 | 1.60 | Mono data and qualifiers |
| Code | `--t-code` | `0.78125rem` | 400 | 1.80–1.85 | Terminal plates, diagram labels |

The prose ramp steps at a consistent ~1.125 ratio (20 → 18 → 16 → 14 at a 16px root). Adjacent roles never share a context, so the step does not have to shout.

**Measure is capped, not left to the container.** `--measure-ch: 62ch` on prose containers. Before it, one role rendered at 43ch in one column and 86ch in another. Leading is tuned *inversely* to measure — wider lines get more leading — which is why `--lh-body` (1.65) exceeds `--lh-dense` (1.55) rather than the other way round.

**Light-on-dark type is compensated on three axes.** The same size and weight reads thinner and tighter on ink than on paper, so prose on `--ink` takes one weight step (400 → 500), `0.006em` tracking, and `+0.05` leading. Declared once, below every component rule — a `font:` shorthand resets `font-weight`, so an earlier compensation block would be silently wiped by a later shorthand.

**Only used weights are loaded.** 400/500/600 for both families. Weight 700 was requested from Google Fonts for months and used by nothing.

**Every SVG viewBox is trimmed to its drawing.** A box taller than its content shows up as dead panel padding — the boundary figure ran 24 units past its last mark, which read as a bottom-heavy panel. Measure `getBBox()` and set the box to it.

**Font-swap reflow is measured, not assumed.** IBM Plex Sans sets 1.3% narrower than the `system-ui` fallback at the same size, so the swap-in shift is negligible and no `size-adjust` metric-override fallback is warranted. Re-measure before adding one.

Load via Google Fonts with `preconnect` on both hosts:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

Body measure caps at `--measure: 640px` for leads and `70ch` for long prose. Headlines carry `text-wrap: balance`; paragraphs carry `text-wrap: pretty`.

---

## Layout and spacing

- **Full-bleed bands, capped content.** Every section owns the full viewport width and paints its own ground edge to edge. Content is capped and centred by a single `.wrap` (`max-width: var(--content); margin: 0 auto`) placed immediately inside the section. A band SHALL NOT carry a horizontal padding or a max-width of its own; that is `.wrap`'s job, and duplicating it double-indents the content.
- **`--content` is 1200px on marketing, 1440px on docs** (`body.is-docs`). A three-column docs shell needs the room; the single-column marketing page read as spread out at 1440, with sections trailing several hundred pixels of empty band. The override sits on `body` so the utility bar, content, and footer widen together and keep one left edge *within* a page — the width differing *between* surfaces is intended.
- **Figures sit on the text's left edge, not centred in the band.** A capped figure centred inside a 1344px content width reads as adrift while every heading beside it starts at the left rule. `.figure` and `.dg-wide` therefore take `margin: 0`.
  - **Why the frame is not constrained.** Capping the outer frame instead makes the peach, sand, ink, and footer bands stop short of the screen edge on a wide display, and the page reads as a floating card rather than a page.
- **Horizontal gutter.** `--gutter`, 48px, dropping to 32px below 1180px and 20px below 760px. It lives on `.wrap`, nowhere else.
- **Section rhythm.** 96px between sections on paper ground. A banded section (`--sand`, `--ink`, `--peach`) uses 72px internal padding and provides its own separation, so the 96px is absorbed by the band rather than added to it.
- **Grid gutters.** Always exactly 1px, filled by `--rule` on the container.
- **Vertical rhythm inside a cell.** Kicker 9px above the heading, heading 6px above body. More space above a heading than below it, everywhere.
- **The overhang.** The hero terminal plate carries `margin-bottom: -40px` so it breaks the peach band's bottom edge. This is the page's one deliberate escape from the grid; do not repeat it elsewhere.

Breakpoints: `1180px` (gutter drops to 32px), `1000px` (hero, strata, flow, swarm, install, and FAQ grids collapse to one column), `760px` (gutter drops to 20px, remaining multi-column grids collapse, the utility bar unsticks and wraps, the install button shows its short label). Hero H1 floors at 46px via `clamp`.

Grid and flex children carry `min-width: 0`. Without it a wide descendant — a terminal plate, a long install command — sets its track's min-content width and pushes the page into horizontal scroll; wide content is meant to scroll inside its own `overflow-x` container instead.

### Adaptation rules

Three of these key off capability or viewport height rather than width, because width is the wrong question for them.

- **Touch targets key off `(pointer: coarse)`, not width.** A touch laptop and a phone both need the 44×44px minimum; a narrow desktop window does not. Stacked link lists (utility nav, footer columns) get real padding and lose their gaps. Isolated inline links (`.link-quiet`, `.link-accent`, the ink band's links) keep their exact underline position and grow an invisible `::after` hit area behind them instead, so no type moves.
- **Every `:hover` rule lives inside `@media (hover: hover)`.** On touch, `:hover` latches after a tap and leaves a row or link stuck in its hover colour. The sheet has no hover declaration outside that guard; adding one is a defect.
- **The utility bar unsticks below `560px` of viewport height.** A landscape phone is ~390px tall and a 60px sticky bar takes 15% of it permanently. This is a height query, not a width query.
- **Safe areas.** The viewport meta carries `viewport-fit=cover`, and `.wrap` takes `max(var(--gutter), env(safe-area-inset-left/right))` so full-bleed bands do not run content under a notch or a rounded corner in landscape. The footer's bottom padding does the same against the home indicator.
- **Reading copy reaches 16px below 760px**; body text, FAQ answers, cell copy, and step copy all step up. Mono inside terminal plates and diagrams deliberately does not — it is code in a horizontal scroll container, and enlarging it only narrows how much of a line is visible.
- **Diagrams are two authored SVG layouts, not one that scales.** A single fluid SVG scales its text with the drawing, so a 740-unit figure on a 350px phone would set 12px labels at 5px. Each diagram therefore ships a wide layout and a stacked layout, swapped by CSS at 760px; only one is ever in the accessibility tree, because the other is `display: none`. Neither upscales past its authored size, so the wide variant's 12px mono matches the page's own mono rather than ballooning on a large display. The stacked variant restates its labels a unit larger, since it is drawn in a narrower coordinate space.
- **The diagrams are inline, and that is load-bearing.** Inline SVG consumes the token table through `.dg-*` classes and renders in IBM Plex like the rest of the page. An `<img>`-referenced SVG is sandboxed from page CSS and from external webfonts, so it could do neither — and its text is not crawlable, so it is worse for SEO than the inline `<text>` nodes, not better. `srcset` requires `<img>`; that is the reason this system does not use it.
- **Axis-aligned SVG geometry carries `shape-rendering: crispEdges`.** A 1px stroke on an integer coordinate straddles the pixel boundary and renders as two half-intensity rows, which reads as a broken hairline in a system where hairlines are the structure. Arrowheads stay anti-aliased, being diagonal fills.
- **The primary nav collapses to a toggle below 760px.** The version meta, the nav links, and the bar's install action travel into the panel together. Above the breakpoint the wrapper is `display: contents`, so the three children sit in the bar's flex row exactly as if it were not there — one markup tree, no duplicated nav. The toggle is a 44px `button` carrying `aria-expanded` and `aria-controls`; Escape closes it and returns focus, an outside click closes it, and a same-page anchor closes it (the page does not reload, so the panel would otherwise sit over the section it just scrolled to).
- **The hero and closing CTA go full-width below 760px**, squaring up with the terminal plate beneath them — same left edge, same width. Their contents stay left-aligned with the copy state pushed right. Centring the command would make it the only centred element on a page whose headline, lead, and plate all key off one left edge.

**Known deviation.** The sheet is authored desktop-first (`max-width` queries) rather than mobile-first. The rendered result is correct at every width verified, but a mobile-first rewrite would let phones skip the desktop declarations entirely. Left as-is deliberately: the rewrite is mechanical, touches every rule, and carries regression risk disproportionate to the payload it saves.

---

## Components

| Component | Selector | Notes |
|---|---|---|
| Content container | `.wrap` | The only width-capping element in the system. One per band, immediately inside it. Carries the gutter. |
| Utility bar | `.util-bar` | `--ink` strip, 11px mono, brand + version meta + nav + accent install button. Sticky at top; unsticks below 760px. |
| Repo button | `.btn-repo` | The utility bar's single action. `--paper` fill, `--ink` text, GitHub mark, mono 11px/600, square. Hover fills `--peach`. |
| Install button (ink) | `.btn-cmd` | `--ink` fill, `--on-ink` text, accent `$` glyph, right-side click-to-copy label behind a 1px divider. Hover `--ink-soft`. |
| Hero band | `.band-hero` | `--peach`, 80px top padding, 0 bottom (the plate overhangs into the next section). |
| Terminal plate | `.plate` | `--ink` block, `.plate-bar` title row over `--rule-dark`, `.plate-body` mono pre. Square, no radius. |
| Hairline grid | `.grid-rule` | `display: grid; gap: 1px; background: --rule; border: 1px solid --rule`. Children fill `--paper` or `--sand-light`. |
| Stat cell | `.stat` | 48px numeral in `--accent`, 17px claim, 13px mono qualifier. |
| Section head | `.sec-head` | `§ N` mono marker + H2 on one baseline, 16px gap. |
| Strata list | `.strata` | Four stacked rows, each a lighter-to-darker step ending on `--ink`. |
| Figure panel | `.figure` | Hosts a diagram. `--paper` on a 1px rule, capped at 812px, left-aligned with the text column. `.figure-flow` is the `--sand-light` variant that stretches inside a grid cell. |
| Diagram | `.dg`, `.dg-wide`, `.dg-stack` | Inline SVG, two authored layouts swapped at 760px. Geometry in `.dg-box` / `.dg-gate-box` / `.dg-arrow` / `.dg-spine` / `.dg-dash`; type in `.dg-lane` / `.dg-t` / `.dg-node` / `.dg-gate` / `.dg-note` / `.dg-edge`. Every colour is a token. |
| Nav toggle | `.nav-toggle`, `.util-collapse` | 44px hamburger below 760px; `display: contents` above it. |
| Docs shell | `.docs-grid` | `240px / 1fr / 220px` inside the shared `.wrap`, so docs and the utility bar share one left edge. Content column is hairline-ruled on both sides, reading measure ~746px. |
| Docs sidebar | `.docs-side` | A `<details>` — sticky rail on desktop, native disclosure below 860px. Renders from `_data/docsnav.json`. Active row carries a 4px accent rail plus a weight change. |
| Docs TOC | `.docs-toc`, `.toc-link` | Sticky 188px right rail with a 3px accent rail on the active row. Drops below 1100px. |
| Page state | `.page-state` | `--sand-light` panel on a rule: status, release, license, flag. |
| Fact strip | `.fact-strip` | Rule-bordered row of label/value pairs under the docs H1; stacks to divided rows below 700px. |
| Callout | `.callout` | `--peach` inside a 1px accent hairline, with an accent `!` mark. A ruled note box — **not** a side stripe: a coloured `border-left`/`border-right` above 1px is banned outright by `PRODUCT.md`'s anti-references, with no exception anywhere in this system. |
| Numbered run | `.steps`, `.step-num` | Ordered list on a left rule, each step's accent ordinal sitting on it. |
| Recap | `.recap` | `--sand` panel closing a tutorial section. |
| Pager | `.pager` | Two-cell hairline grid, previous left / next right. |
| Chip | `.chip` | `--sand` fill, mono 11px, 5×8 padding. Track names, tags. |
| FAQ row | `.faq-item` | Full-width button, question left, `+`/`–` sign right in accent, answer below. Divided by `--rule-soft`. |
| Ink band | `.band-ink` | `--ink` full-bleed section for secondary offers. Accent switches to `--accent-light`. |
| Closing band | `.band-cta` | `--peach`, headline left, install button right. |
| Footer | `.site-footer` | `--ink-deep`, brand blurb left, two link columns right. |

**Cards are not a component.** If a layout wants "cards", it gets a hairline grid. No `box-shadow` exists in the system except the hero plate's `0 24px 48px rgba(60,30,10,.18)`, which reads as the plate's physical lift off the peach band.

---

## Motion

One authored moment, not scattered effects: the **copy affordance**. Clicking an install command swaps its label to `copied` for 1600ms. Everything else is a 120ms `ease-out` color or background transition on hover and focus.

No scroll-bound reveals, no entrance animations, no parallax. Under `prefers-reduced-motion: reduce`, transitions floor to `0.01ms`; the copy label still changes, because it is feedback, not decoration.

---

## Accessibility floor

- **WCAG 2.1 AA, verified in the browser, not asserted.** `--text` on `--paper` clears 16.4:1, `--text-muted` 6.5:1, `--text-dim` 5.3:1. Against the tightest light ground in the system (`--stratum-3`) those become 5.7:1 and 4.6:1. On ink, `--on-ink-body` clears 10.3:1, `--on-ink-muted` 7.3:1, `--on-ink-dim` 5.0:1, `--on-ink-faint` 5.0:1, `--term-blocked` 5.1:1, `--term-ok` 7.3:1.
- **The floor is a build check.** Every text node on a built page is swept for its computed foreground against its nearest opaque ancestor background, at the AA threshold for its own size and weight. The landing page currently reports zero failures. A new component that lands a failure is a defect, not a tradeoff.
- **Accent contrast.** `--accent` on `--paper` clears 4.84:1. On `--sand` (4.32:1) and `--peach` use `--accent-deep`; on `--ink` use `--accent-light` (6.8:1).
- **Focus rings.** 2px solid `--accent` at `outline-offset: 2px`, square. On ink surfaces the ring switches to `--accent-light` at `outline-offset: 3px`.
- **Skip link** to `#main`, hidden until focused, then an ink-on-paper chip at top-left.
- **Copy affordances are real `<button>` elements** with an `aria-live` label that announces the copy result. Never a styled `div`.
- **FAQ rows are `<button aria-expanded>` controlling a labelled region.** Disclosure state is carried by the `+`/`–` glyph and the `aria-expanded` attribute, not by color.
- **No color-only signaling.** Terminal blocked lines carry the `✗` glyph and the guard name; success lines carry `↳`. The active nav item carries a weight change and an ink rail in addition to its color.
- **Diagrams are `<pre>` with an accessible description.** ASCII structure gets `role="img"` and an `aria-label` that states the relationship in prose, since the character art itself is noise to a screen reader.

---

## Content rules that bind the design

- **Counts come from data, never from literals.** Every structural count on a page renders from `site-src/_data/baseline.cjs`, which derives from disk via `.claude/skills/audit-baseline/derive-counts.mjs`. Writing `53 skills` as a literal in a template is a defect: the deriver exists so numbers cannot go stale. The pinned comp's own `52` is an example of the drift this rule prevents.
- **Headlines assert, they do not name topics** (`PRODUCT.md` → outcome-led argument). The comp's `What it is` / `Why hooks` / `How it flows` are placeholders inherited from the old page; the built page replaces them with claims.
- **Every claim names its mechanism.** A section that asserts without naming the hook, file, or guard behind it is unfinished.

---

## Provenance

- **Captured**: 2026-07-28 from `docs/references/Baseline Landing.dc.html` and `docs/references/Baseline Docs - Org Setup.dc.html`, pinned as binding by the project owner.
- **Replaces**: the `Quiet authority / editorial calm` extraction of 2026-05-11.
- **Method**: direct read of both comps' inline styles; every token above is quoted from them verbatim. Contrast substitutions (`--accent-deep`, `--accent-light`) and the accessibility floor are derived, since the comps carry presentation but no stated a11y contract.
- **Re-extraction**: re-read this file against `site-src/assets/site.css` whenever the built site gains a component the catalog above cannot describe.
