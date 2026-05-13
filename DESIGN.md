# DESIGN.md

Design system for the baseline docs site at `site-src/`. This file is the contract that the `design-ui` skill and the `impeccable` skill load on every UI invocation. Tokens, type scale, spacing rhythm, motion vocabulary, and the reserved-accent posture all come from here. Edit this file to evolve the system; do not redefine these tokens at the component level.

> **Revision note (2026-05-11).** This file replaces the prior `phantomflow`-derived extraction. That extraction described a "bold modern utility-product" register (Plus Jakarta Sans 800 at 96px, full pill buttons, paper-grain texture, mandatory two-color H1, full-bleed ink bands) that **never landed in the implementation**. The shipping site is a different register entirely — **Quiet authority / editorial calm** — and this revision documents what `site-src/` actually does. The CSS file's own header (`site-src/assets/site.css:1-9`) is the source of truth for the register name.

---

## Register

**Quiet authority · editorial calm.** Inter Tight 600 for display, Inter 400/500 for body, JetBrains Mono for code and small caps. Cool off-white page; ink near-black surfaces; a single muted orange accent reserved for state, hover, focus, and small typographic moments. Density: low. Generous whitespace. Content-first.

The page does not shout. Its loudest moments are the **live-typing dev console** in the hero (dark code window with a hand-drawn ink wobble outline) and the **per-page hero symbols** on reference pages (boundary, comptree, fanmerge, memring, strata — each a precise SVG ideogram in ink + 1 accent dot). Headlines stay modest; the structural diagrams carry the visual weight.

The system is **single-theme light only**. No `[data-theme="dark"]` block in `site-src/assets/site.css`, no theme toggle in the topnav. If a dark mode is added later, derive a sibling `[data-theme="dark"]` table from this file rather than inverting tokens at runtime.

---

## Type families

```css
--display: "Inter Tight", system-ui, -apple-system, Segoe UI, sans-serif;
--body:    "Inter",       system-ui, -apple-system, Segoe UI, sans-serif;
--mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

- **Display** — Inter Tight, weights 500/600/700. The 600 weight is the system's workhorse for H1–H4 and primary navigation. Never set display type below 500. Tracking always tightens (`-.015` to `-.035em`) at display sizes.
- **Body** — Inter, weights 400/500/600. 17px / 1.7 for prose, 21px / 1.55 for the lead paragraph, 14–15px for compact UI rows (concept descriptions, footer columns, sidebar nav).
- **Mono** — JetBrains Mono is the preferred face; falls back through `ui-monospace`. Used for code, command tokens, section numbers and labels, footer meta-rows, small-caps eyebrows and chips, dev-console body, and all "structural-counts" numerals where they need to read as data.

Load from Google Fonts (already wired in `site-src/_layouts/base.njk`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## Type scale (computed at 1440px)

| Role | Selector | Family · Size · Weight | Line-height | Tracking |
|---|---|---|---|---|
| Display H1 (hero) | `.hero h1` | Inter Tight · `clamp(42px, 6vw, 68px)` · 600 | 1.00 | -0.035em |
| Display H1 (article) | `.article > h1`, `.docs-hero-text > h1` | Inter Tight · 48px · 600 | 1.10 | -0.025em |
| Section H2 (article body) | `h2` | Inter Tight · 26px · 600 | 1.25 | -0.015em |
| Subsection H3 | `h3` | Inter Tight · 18px · 600 | 1.40 | -0.01em |
| H4 | `h4` | Inter Tight · inherits · 600 | — | — |
| Lead paragraph | `.hero .lead`, `.article > .lead` | Inter · 21px · 400 | 1.55 | normal |
| Body | `body`, `p` | Inter · 17px · 400 | 1.70 | normal |
| Article list / table | `.article li`, `.article table` | Inter · 14.5–15px · 400 | 1.55 | normal |
| Concept description | `.concept p` | Inter · 14.5px · 400 | 1.60 | normal |
| Eyebrow (section label) | `.eyebrow` | Inter Tight · 12px · 600 · uppercase | 1.00 | 0.08em |
| Section number | `.section-num` | JetBrains Mono · 14px · 600 · uppercase | 1.00 | 0.14rem |
| Stat numeral (meta-strip) | `.meta-strip .num` | Inter Tight · 32px · 600 (tabular-nums) | 1.00 | -0.025em |
| Stat label (meta-strip) | `.meta-strip .label` | JetBrains Mono · 10.5px · 500 · uppercase | 1.00 | 0.10em |
| Nav link | `.brand`, `nav.primary a` | Inter Tight · 14–17px · 500/600 | 1.50 | -0.005 to -0.015em |
| Button label | `.btn` | Inter Tight · 15px · 500 | 1.50 | -0.01em |
| Code (inline) | `code` | JetBrains Mono · 0.875em · 500 (in `--accent-soft` chip) | inherits | normal |
| Code (block) | `pre`, `.dev-console .dc-body` | JetBrains Mono · 13–13.5px · 400 | 1.65–1.85 | normal |
| Diagram label | `.diagram-svg .stage-label` | Inter Tight · 13px · 600 | — | -0.01em |
| Diagram caption (mono-eyebrow) | `.fanmerge-svg .fm-caption`, `.boundary-svg .bnd-caption`, `.comptree-svg .ct-caption`, `.memring-svg .memring-key` | JetBrains Mono · 11px · 600 · uppercase | — | 0.12em |

Notes:
- **No mandatory two-color H1.** A single-color H1 is the default. Headlines may carry a `<span class="accent">` for a single short phrase — in `index.njk` the entire accent payload is the **period** at the end of "for Claude" (`for Claude<span class="accent">.</span>`). That subtle terminal accent is the brand's house gesture for landing pages; docs hero H1s use `<span class="accent">.</span>` after the title noun in the same shape.
- Article H1 (`.article > h1`) is **48px** flat (no clamp), narrower than the marketing hero. Reference pages are quieter than the landing on purpose.
- The lead paragraph color is `--text` (= `--ink`, near-black) rather than a muted ash. This is a deliberate "lead reads as primary, not as subtitle" choice.

---

## Color tokens

```css
:root {
  /* Neutral ramp — true neutrals + a slate-tinted slot for muted body */
  --ink:        oklch(15%   0     0);            /* near-black — foreground, on-dark surfaces */
  --text:       oklch(15%   0     0);            /* alias of --ink for prose */
  --charcoal:   oklch(28%   0     0);            /* secondary text */
  --muted:      oklch(45%   0.026 257);          /* slate-600 — muted body, captions, nav idle */
  --faint:      oklch(72%   0.012 257);          /* slate-400 — disabled, ::after arrow idle */
  --rule:       oklch(89%   0.013 257);          /* slate-200 — hairline rules, table dividers */
  --rule-soft:  oklch(94%   0     0);            /* softer neutral hairline (rarely used) */
  --bg:         oklch(96.5% 0     0);            /* page background */
  --paper:      oklch(99%   0     0);            /* lifted surface (plates, concept cells) */
  --cream:      oklch(94%   0     0);            /* alt. inset surface */

  /* Accent — orange, two stops (NB: naming is inverted vs the prior phantomflow draft) */
  --accent:        oklch(55.8% 0.187 41.5);      /* orange-700 — primary state, type, links, focus */
  --accent-light:  oklch(70.3% 0.187 41.5);      /* orange-500 — brand-dot, hover wash, syntax accents */
  --accent-soft:   oklch(70.3% 0.187 41.5 / .15);
  --accent-faint:  oklch(70.3% 0.187 41.5 / .08);

  /* Status */
  --warn:       oklch(58%   0.13  60);           /* callout icon — only state color in use */

  /* Code-window palette */
  --code-bg:    oklch(15%   0.015 260);          /* dev-console / install-snippet body */
  --code-fg:    oklch(92%   0.005 260);          /* dev-console default text */
}
```

### Naming convention

Token names are **bare** (no `--color-` prefix): `--ink`, `--accent`, `--rule`. Spacing/layout follow the same shape: `--content`, `--sidebar`, `--toc`, `--header`. Keep new tokens consistent with this convention.

### Accent two-stop semantics (read carefully)

The variable name `--accent` is the **darker** orange (`orange-700`). `--accent-light` is the **lighter** orange (`orange-500`). This is inverted vs. the convention where "default" would be lighter and "dark" would be the modifier. The current shape was chosen because the dark stop is the one used most often (links, focus rings, eyebrows, hover states); naming the dark one as the default keeps call sites short.

### Reserved-accent contract

Accent is both a **state device** and a **typographic device**. Allowed surfaces:

| Surface | Token | Where |
|---|---|---|
| Brand mark dot | `--accent-light` | Topnav and footer brand wordmark; carries the pulse animation |
| H1 terminal accent | `--accent` | The period (or short phrase) closing the headline; one per page |
| Section number | `--accent` | `.section-num` mono caps above each H2 in marketing |
| Section eyebrow | `--accent` | Inter Tight uppercase 12/600 above H1 / docs hero / concept titles |
| Concept ordinal | `--accent` | `.concept .num` mono ordinal inside a concept cell |
| Concept link arrow | `--accent` | `a.concept::after → "→"` on hover/focus only |
| Concept title (hover) | `--accent` | `a.concept:hover h3` recolors to accent for affordance |
| Primary button (hover) | `--accent` background | `.btn-primary` swaps from `--ink` to `--accent` on hover |
| Inline link (hover) | `--accent` | All `a:hover` (including topnav, footer columns, GitHub pill) |
| Focus ring | `--accent` outline | Every interactive element |
| Selection background | `--accent-soft` | `::selection` |
| Inline code chip | `--accent-soft` background, `--ink` text | Decorates `<code>` in prose |
| Diagram hook line | `--accent` | Dashed 4-4 strokes denoting hook attachments (`diagram-svg .hook-line`) |
| Diagram hook event label | `--accent` | Mono caps event names (`PreToolUse`, `Stop`, etc.) |
| Diagram gate node | `--accent` fill | `node-gate` in workflow diagram |
| Diagram consent annotation | `--accent` | `gate-anno .gate-rule`, `.gate-cmd` |
| Memring promote arc / arrow | `--accent` | Promotion path on the memory ring |
| Comptree must-edge | `--accent` solid 1.75 | Mandatory composition arrow |
| Comptree conditional-edge | `--accent` dashed 4-4 | Conditional composition arrow |
| Fanmerge audit node | `--accent` fill | Audit gate on the swarm fan/merge diagram |
| Boundary rule | `--accent` dashed 6-5 | Tool-boundary line in the hooks symbol |
| Audit pill in `.arch-spine` | `--accent` 1.5px border + `--accent` text | One pill per architecture diagram |
| Install-step ordinal | `--accent` | `.install-steps .n` mono digit |
| CLI strip prompt + caret | `--accent-light` | The click-to-copy strip above the footer |
| Dev-console slash / cursor | `--accent-light` | Slash commands in the live-typing stream and the blinking caret |

Forbidden surfaces:
- Body prose text, captions
- Active-state rails (sidebar, TOC) — **active rails belong to `--ink`**, not accent. See `.nav-group a.is-active::before` and `.toc a.is-active::before`.
- Plain navigation idle states (use `--muted`)
- Hairline rules (use `--rule`)
- Tabular data cells (use `--ink` and `--charcoal`); only the **hover** state of `.article table tbody tr` recolors `td.phase` to accent
- Headline body text — the H1 carries `--ink` everywhere except the optional terminal `.accent` span

If you reach for accent on a surface not in the table above, the answer is `--charcoal` or `--muted`.

---

## Spacing & layout tokens

The implementation does **not** define a `--spacing-*` scale. Section padding, gap, and margin values are written inline at the call site. Common values observed:

| Use | Value | Notes |
|---|---|---|
| Inline gap (between glyphs, button arrow) | 8px | `.brand`, `.btn`, `.callout` |
| Tight gap | 10–12px | Footer column rows, install-step rows |
| Concept card padding | 32px | `.concept` |
| Plate padding | 40px 32px 32px | `.figure` |
| Article paragraph rhythm | 20–24px bottom | `p`, `pre`, table margins |
| Section internal rhythm | 56px | `.section .lede` margin-bottom |
| Section vertical pad (landing) | 80px | `.section` |
| Section vertical pad (article) | 64px | `.article > .section` |
| Page-to-section breathing | 96–120px | Hero top, `.cli-strip` top, footer top |

If a recurring need shows up, add a token rather than another magic number. Until then, do not introduce `--spacing-md` etc. retroactively — the grep cost outweighs the gain.

```css
--content : 720px;     /* prose + figure column max (long-form sentences cap here) */
--sidebar : 260px;     /* docs sidebar (left rail) */
--toc     : 220px;     /* docs TOC (right rail) */
--header  :  60px;     /* sticky topnav height; scroll-margin-top is 84–96px */
```

Layout shells:
- **Marketing** — `.marketing { max-width: 1080px; margin: 0 auto; padding: 0 32px; }`
- **Docs shell** — `.docs-shell { grid-template-columns: 260px 1fr 220px; max-width: 1400px; padding: 0 32px; }`
- **Mobile breakpoints** — 1100px (TOC drops), 1000px (hero stacks), 900px (lede/install/concepts stack), 720px (sidebar becomes a drawer; primary nav becomes a hamburger; `.cli-hint` hides)

---

## Motion vocabulary

The implementation uses **inline** easings and durations rather than central tokens. Conventions observed:

| Use | Duration | Easing |
|---|---|---|
| Color / background tint on link/button | `.15s` | `ease` (CSS default) |
| Border-color, transform on hover | `.15s` | `cubic-bezier(.25, 1, .5, 1)` (snappy) or `cubic-bezier(.22, 1, .36, 1)` (slightly softer) |
| Mobile drawer slide-in | `.28s` | `cubic-bezier(.22, 1, .36, 1)` |
| Brand-dot pulse (infinite) | `2.6s` per cycle | `cubic-bezier(.4, 0, .2, 1)` |
| Caret blink (infinite) | `1.05s` | `steps(2, end)` |
| Hero entrance stagger | 0.6s / 0.8s | `cubic-bezier(.22, 1, .36, 1)` |
| Hero stagger delays | 60ms / 160ms / 260ms / 360ms / 200ms (figure) | — |
| Scroll-driven figure reveal | linear | `animation-timeline: view(); animation-range: entry 0% cover 22%` |

Motion rules:
- **Hero entrance is CSS-only** — one signature page-load moment, staggered by 60–360ms across eyebrow → h1 → lead → ctas → meta-strip → dev-console. No JS, no flash.
- **Scroll-driven reveals** use `@supports (animation-timeline: view())`. Browsers without scroll-driven-animation support render figures in their final state — no fallback shim, no degradation.
- **Hover transform budget** is `translateY(-1px)`. Buttons, concept cards, and the CLI strip all use the same lift. Active state returns to `translateY(0)`.
- **Wobble-frame** rotates the dev-console by `-0.45deg` at rest, untilts to `0deg` on hover. The pseudo-element border is warped by the inline `<filter id="wobble">` SVG turbulence defined in `base.njk`.
- **Reduced motion** is hard-honored. The CSS ends with a global override that floors all transition and animation durations to `0.01ms` under `prefers-reduced-motion: reduce`. Specific keyframes (`brand-dot-pulse`, `dc-cursor`, `wobble-frame::after filter`) also have explicit `animation: none` / `filter: none` resets.

Future direction: extracting these into `--ease-default`, `--duration-fast`, etc. is worthwhile if a third concrete use case appears. For now, the call sites are few enough that inline values are clearer than indirection.

---

## Components catalog

The shipped patterns. Adopt these as defaults; deviate only when content demands it.

### Shell

- **Topnav (`header.top`)** — 60px tall, sticky, `backdrop-filter: blur(8px)` on a 88%-opaque `--bg`, hairline bottom border. Brand wordmark (dot + brand name + mono subtitle) on the left, primary nav at 14px after a 48px left margin, GitHub pill on the right. On docs pages a hamburger toggle (`.nav-toggle`) appears at the mobile breakpoint and controls the sidebar drawer.
- **Brand mark (`.brand`)** — Inter Tight 600 17px at baseline, a 6px accent-light dot to the left with a 2.6s `brand-dot-pulse` keyframe (box-shadow expands and fades), and an optional mono subtitle in `--muted` 11/0.06em uppercase. The pulse is the brand's quiet "live signal" gesture.
- **GitHub pill (`.gh-link`)** — 32px tall, 8px radius, mono 12.5/500, idle `--muted`, hover wash to `--accent` on `--accent-faint` background. The repo slug hides below 640px (icon-only).
- **Mobile drawer** — at ≤720px the docs sidebar becomes a left drawer (`min(320px, 84vw)`) with `.nav-backdrop` overlay, controlled by `body.is-nav-open`. Slide-in is 0.28s cubic-bezier-(.22,1,.36,1); `body { overflow: hidden }` while open.
- **Skip-link (`.skip`)** — visible only on focus; `--paper` on `--ink` chip top-left.
- **Footer (`footer.site`)** — top hairline, 64px top pad, 1080px max width. Three-column grid: brand+tagline / Docs / Project (each list a `<h5>` mono caps eyebrow + `<ul>` of 14px Inter links). Mobile collapses to 2-col with brand spanning both. Meta row at the bottom in mono 11.5 muted.

### Marketing surfaces

- **Hero (`.hero`)** — 96px top / 80px bottom padding on landing, hairline bottom. Two-column grid (`.hero-grid`): text column (max ~920px) on the left, dev-console column on the right at a 1.25 : 1 ratio. Below 1000px the grid stacks. Includes: eyebrow → H1 → lead → CTAs → meta-strip on the left, wobble-framed dev-console on the right.
- **Meta-strip (`.meta-strip`)** — 5-cell grid laying out **structural counts** that name load-bearing baseline components (currently: `20 Hooks / 36 Skills / 1 Subagent / 11 Phases / 3 Gates`). Each cell is a 32px Inter Tight numeral with a mono 10.5/0.10em uppercase label below, separated by hairlines. This pattern is explicitly **not** the "hero-metric vanity template" PRODUCT.md anti-references — the values are verifiable from the codebase, the labels name first-class baseline parts, and the strip earns its loud-where-it-counts allocation. Mobile collapses to 3 + 2 rows.
- **Section (`.section`)** — 80px vertical pad, hairline bottom (`:last-of-type` drops the rule). Inside, `.section .lede` is a 220px-fixed-column header (number + H2) + 1fr lede paragraph, gap 80px. The H2 caps at 12ch in marketing; in docs the cap is removed because reference titles wrap longer.
- **Concept grid (`.concepts`)** — `repeat(3, 1fr)` plates separated by 1px hairlines on a `--rule` background, with a 1px hairline border and 12px radius. Variants: `.is-2col` (two-up) and `.is-row` (vertical 3-cell). Each `.concept` is a paper-faced cell with a mono accent ordinal (`.num`), an H3 title, and a 14.5/1.6 muted description. `a.concept` cells get a hover lift (`translateY(-1px)`), a `--accent` → arrow that slides in from the left, and a recolored title.
- **Install block (`.install`)** — two-column landing block: copy on the left (H2 + 460px-max prose + ordered `.install-steps` with mono accent ordinals), code window on the right (`.install-snippet` with mac traffic-light bar, filename, dark code body).
- **CLI strip (`.cli-strip`)** — persistent click-to-copy install command above the footer. Dark code-bg surface, `--accent-light` prompt and caret, mono 14, 96px top margin, 760px max width, 12px radius, 1px hairline border, soft drop shadow. Hover borders to `--accent`, lifts 1px; `is-copied` mutes the blink and turns the hint emerald via inline `oklch(70% 0.15 145)`.

### Diagrams & figures

- **Figure plate (`.figure`)** — `--paper` background, 1px `--rule` border, 14px radius, 40px-32px-32px padding. SVG inside scales to width. The unified `figcaption` baseline is mono 11.5/1.6 muted with a hairline top rule and a 12.5px display-faced strong leader. Code samples inside captions use a small mono chip with `--cream` background.
- **Strata SVG (`.strata-svg`)** — vertical 4-form composition for the §I "what it is" key visual: filled square (Genesis) / open frame (Constitution) / dotted rectangle (Implementation) / single horizontal line with one accent dot (Tool boundary). Each form carries an inscribed Roman numeral in Inter Tight 600 22px. Max width 360px. Lives inside `.figure-strata`, centered, with a `.strata-key` legend below.
- **Hero symbols** — per-page docs ideograms wired by `heroSymbol: <name>` frontmatter and rendered into `_includes/hero-symbols/<name>.njk`. Each is a 320px-max precise SVG composed from the same vocabulary (filled ink, open-stroke, dotted-fill, accent dot, accent dashed line) but tuned to its page's structural claim:
  - `hooks` → **boundary**: a Claude box / tool box pair separated by an accent dashed rule, with accent consent dots straddling the boundary.
  - `skills` → **comptree**: a composition tree showing must-edges (solid accent), conditional-edges (dashed accent), and a single anchor sub-node.
  - `swarm` → **fanmerge**: a recipe fans into worker nodes which merge through an accent-bordered audit gate to a result node.
  - `memory` → **memring**: an inner ink ring (canonical), an outer dotted band (candidates), with one accent candidate mid-promotion along an accent dashed arc toward the anchor at center.
- **Architecture diagram (`.arch`)** — two-column HTML/CSS diagram with a center "spine" between them. Each column is a label + H3 + paragraph + bulleted list (each `<li>` prefixed with `›` in accent). The spine contains an arrow SVG and a single `--accent`-bordered audit pill, both stacking on mobile.
- **Diagram SVG conventions (`.diagram-svg .*`)** — reusable class table for SVG diagrams: stage rectangles, stage labels, connectors, arrows, hook lines (dashed accent), hook events (accent caps), gate nodes (accent fill), gate annotations (dashed accent rules + accent command labels). All themed via CSS custom properties so the diagrams inherit the system without per-SVG declarations.
- **Memory-flow plate (`.plate-flow`, `.memflow-svg`)** — hand-drawn-ish hairline lifecycle diagram. Node rectangles in `--paper`/`--ink`, canonical nodes with thicker strokes, accent dashed paths for "OK" / promotion, charcoal solid for "fail".
- **Callout (`.callout`)** — paper plate with a `--warn` (orange-yellow oklch(58% 0.13 60)) circular icon glyph and a body block. Used for landmines, cautions, single-paragraph warnings.

### Buttons & inputs

- **Primary button (`.btn-primary`)** — `--ink` background, `--paper` text, 8px radius, 10×20 padding, Inter Tight 15/500 with `-.01em` tracking. Hover: background swaps to `--accent`. Carries the 1px lift transform on hover, 0.15s snappy curve. **Pills are not used** — the prior phantomflow extraction specified 9999px; the implementation chose 8px rounded rect for a quieter register.
- **Secondary button (`.btn-secondary`)** — `--paper` background, 1px `--rule` border, `--ink` text. Hover darkens the border to `--ink` (no fill swap).
- **Button arrow (`.btn .arr`)** — a `→` glyph that translates 3px right on `.btn:hover`. Quiet "go" cue.
- **Focus ring** — every interactive element gets `outline: 2px solid var(--accent)` at `outline-offset: 2px`, 3px radius. The accent ring clears AA non-text contrast on both `--bg` and `--code-bg` surfaces.

### Docs surfaces

- **Docs hero (`.docs-hero`)** — 1.4 : 1 grid (text / symbol), 56px gap, narrower than the marketing hero. Same staggered fb-rise entrance with 60/160/200ms delays.
- **Article (`main.article`)** — 64px top / 120px bottom padding, content capped at `--content` (720px). The `.article > h1` is 48/600/-.025em; the `.lead` follows at 21px in `--text`. Section anchors carry `scroll-margin-top: 84px`.
- **Sidebar (`aside.sidebar`)** — sticky 260px rail. Nav groups are mono caps eyebrow + list of muted links; the active link gets a 2px `--ink` rail to its left (per the reserved-accent contract: active rails belong to ink, not accent).
- **TOC (`aside.toc`)** — sticky 220px right rail. Same active-rail treatment as the sidebar, offset 14px left of the link. Hides at ≤1100px.
- **Tables** — full-width, 14.5px Inter, hairline rows. Header row is mono caps in `--muted` with a `--ink` bottom rule. The first column is mono 13 muted (for ordinals or keys). On hover a row tints to `oklch(98% 0 0)` and the `td.phase` cell recolors to `--accent`.
- **Docfoot (`footer.docfoot`)** — slim 80px-margin-top + 24px-pad-top mono 12 muted strip below each article. Left side is "last updated", right side is "edit on GitHub →" with a 3px arrow translate on hover.

### Code surfaces

- **Inline code (`code`)** — `--accent-soft` background chip, `--ink` text, 0.875em mono 500, 4px radius, 2×6 padding. The accent chip is one of the few places accent appears on non-state surfaces; it earns the slot because code IS the product's vocabulary.
- **Block code (`pre`)** — `--code-bg` dark surface, `--code-fg` near-white text, 13.5/1.65 JetBrains Mono, 24/28 padding, 10px radius, 24px top margin, content max width 720px. Token classes: `.tok-key` indigo-300, `.tok-str` emerald-200, `.tok-num` amber-300, `.tok-com` slate-500 italic, `.tok-kw` pink-300.
- **Dev console (`.dev-console`)** — same dark code surface plus a "title bar" (`.dc-bar`) with three traffic-light dots and a filename, plus a body (`.dc-body`) that streams Claude Code session output via JS. Token classes for the stream: `.dc-prompt` (slate-400), `.dc-cmd-buf` (near-white), `.dc-slash` (accent-light slash commands), `.dc-str` (emerald), `.dc-ok` (emerald 500), `.dc-wait` (amber), `.dc-dim` (slate-500), and `.dc-cursor` (blinking accent-light caret).
- **Install snippet (`.install-snippet`)** — same chrome as dev-console but with a static pre body.

### Brand effect: the wobble frame

The page's signature gesture beyond the dev console itself.

`<svg class="svg-defs">` in `base.njk` defines two SVG filters — `#wobble` (3.2 displacement scale) and `#wobble-fine` (1.6 displacement scale) — using `feTurbulence` + `feDisplacementMap`. The filter is applied to the `::after` pseudo-element of `.wobble-frame`, which renders as an inset 2px `--ink` border at a 16px radius. Because the pseudo contains only a border, the displacement only warps the border edges — content inside stays pixel-sharp.

The frame also carries a -0.45° rotation at rest and a 0° rotation on hover, giving the dev-console a "hand-applied sticker" feel that's deliberately at odds with the otherwise precise grid. On stacked layouts (≤1000px) the rotation drops to zero. `prefers-reduced-motion` removes the filter and the rotation.

This is the brand's signature warmth. Use sparingly — only on the dev-console, install-snippet, or other code-window plates. Do not apply to body content, figures, or callouts.

---

## Editorial moments (one-per-page budget)

Each page rations its loud moments so nothing competes:

1. **One dev-console / code-window plate** — landing carries the live-typing console; docs carries the install-snippet or a comparable code block.
2. **One hero symbol** — landing carries the dev console as its hero illustration; reference pages carry their per-page SVG (boundary, comptree, fanmerge, memring).
3. **One strata diagram** — appears only on the landing (`figure-strata` inside §I).
4. **3–5 section eyebrows** — recurring once per major section; counts as a single editorial concept (taxonomy), not as N moments.
5. **One H1 terminal accent** — the period (or short closing phrase) carrying the only chromatic flourish on the headline.
6. **One CTA bar above the fold** — primary + secondary pair, no more.
7. **One CLI strip above the footer** — the click-to-copy install command.

If a section accumulates more than its allotment, cut. The brand's authority comes from restraint, not from stacking moments.

---

## Accessibility floor

- **WCAG 2.1 AA** is the floor. Primary text in `--text` (= `--ink`) clears 14:1 on `--bg`. Muted body in `--muted` clears 4.7:1. Primary button (`--paper` on `--ink` with `--accent` hover) clears AA at body and large-text sizes. Accent on white clears 5.6:1 — fine for the brand-mark dot, eyebrows, and large-stat numerals; **never use accent for body-size text**.
- **Focus rings** — 2px `--accent` outline at `outline-offset: 2px`, 3px radius, on every interactive element. On `--code-bg` surfaces (CLI strip, dev console interactive zones) the offset moves to 3px for visual separation.
- **Skip-link** at top of `<body>` jumps to `#main`; hidden until focused, visible as a `--paper`-on-`--ink` chip top-left.
- **Reduced motion** — global CSS override floors all transition and animation durations to `0.01ms` under `prefers-reduced-motion: reduce`. Brand-dot pulse, dev-console cursor, wobble-frame filter, and hover lifts each carry an explicit override too.
- **Section nav** uses `<nav aria-label="Page sections">` on both the sidebar and the right TOC so AT users can skip the hero.
- **No color-only signaling.** Active sidebar / TOC rows carry an `is-active` weight change (+ ink rail) in addition to color. The dev-console states (slash, ok, wait) are also distinguished by position and surrounding text.
- **Keyboard parity.** Every interactive element is reachable in document order. No `tabindex > 0`. The dev-console hero animation does not trap focus; the mobile drawer traps focus only while open and releases on close.
- **Mobile nav toggle** (`.nav-toggle`) carries `aria-label="Open documentation navigation"`, `aria-expanded`, and `aria-controls="docs-sidebar"`. The state attributes are managed by `site.js`.

---

## Adoption & maintenance notes

- This file is the contract for **site-src/** specifically. The `obj/site/` build output is the rendered application of these tokens; do not edit there.
- When adding a new component, add a row to the **Components catalog** with its selector, role, and the tokens it consumes. If a component introduces a new token, add it to **Color tokens** or **Spacing & layout tokens** first.
- When changing a token, search `site-src/assets/site.css` for every occurrence before editing — the impact radius is the whole site.
- Re-extract this file when the implementation diverges materially. The signal that a re-extraction is due: more than three components in the live site cannot be described by the catalog above.

---

## Provenance

- **Captured**: 2026-05-11 from `site-src/assets/site.css` (2129 lines) and the layout / include / page templates under `site-src/`.
- **Method**: direct read of the CSS file (no DOM-time `getComputedStyle` dump) plus structural read of the Nunjucks templates that consume the classes.
- **Single theme**: confirmed by absence of `[data-theme]` rules and absence of a theme toggle in `topnav.njk`.
- **Token sources**: every variable above is declared at `:root` in `site-src/assets/site.css:10-42`. Values are quoted verbatim.
- **Fonts**: confirmed against the Google Fonts URL in `site-src/_layouts/base.njk:10`.
- **Replaces**: the prior `phantomflow`-derived extraction (DESIGN.md as of 2026-04-28), which described a register that never landed. See the revision note at top of file.
- **Re-extraction**: re-read `site-src/assets/site.css` and the layout templates whenever site-src CSS gains a new component, a new token, or a register shift.
