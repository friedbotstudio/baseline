# Audit — site-react-ssg-seo (vs phantomflow)

**Date**: 2026-04-29
**Method**: playwright walk of `http://127.0.0.1:4322/` and `https://friedbotstudio.com/products/phantomflow` at 1440×900 + 390×844; computed-style scrape at the same selectors on both surfaces. Screenshots stashed at `site/_visual/audit-*.png` and `site/_visual/phantomflow/`.
**Posture**: critical, not polite. Earlier passes claimed "shippable." That claim was wrong.

---

## Anti-pattern verdict

**Fail.** The current state reads as AI-assembled-from-checklist, not as the bold-modern-utility-product register DESIGN.md prescribes. Specific tells:

- Section eyebrows bleed to viewport `x=0` while their H2s sit centered at `x=240` — visual breakage that no human designer would ship
- Numeral and label run together as "01Foundation" / "02Workflow" with no separator (CSS `gap` not applying to anonymous text node siblings)
- Hero is single-column centered chunk against vast empty whitespace — phantomflow is a two-column hero with a code-window plate on the right that carries the "developer product" signal
- H1 wraps to 3 lines ("A Claude" / "Code baseline" / "for software engineering.") — phantomflow rule is **two** lines (one ink phrase + one accent phrase)
- Topnav has an orange diamond sigil with **no wordmark text** and **no primary CTA pill** — phantomflow has "FRIEDBOT" + sigil + "STUDIO" + "Book a Call" pill
- Paper-grain barely visible — `radial-gradient` at 0.3 alpha + 12×12 grid is too subtle vs phantomflow's `bg.webp` density

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---|:---:|---|
| 1 | Accessibility | 3 | Skip-link + focus rings + landmark roles in place; eyebrow `<p>` semantically wrong (it's a label, should be in a heading-adjacent role) |
| 2 | Performance | 3 | Build-clean, deterministic, islands-isolated; no perf bugs surfaced |
| 3 | Theming | 4 | All tokens via DESIGN.md, drift checker green, no shadows |
| 4 | Responsive Design | 2 | Desktop hero is broken (right-shifted single column with empty 50%); mobile H1 wraps to 5 lines |
| 5 | Anti-Patterns | 1 | Eyebrow misalignment, "01Foundation" run-together text, single-column hero against phantomflow's two-column, no Topnav CTA, no Topnav wordmark — adds up to 5+ tells |
| **Total** | | **13/20** | **Acceptable (significant work needed)** |

The score is generous. The visual drift between the live site and DESIGN.md's stated register is substantial enough that a designer would call this an MVP, not a finished site.

---

## Computed-style drift table (live vs DESIGN.md vs phantomflow)

| Property | DESIGN.md / phantomflow | Live site | Match? |
|---|---|---|:---:|
| H1 font | Plus Jakarta Sans 800 / 96px / -4.8px | Plus Jakarta Sans 800 / 96px / -4.8px | ✓ |
| H1 line-height | 1.0 (96px) | 96px | ✓ |
| H1 line count | **2** lines (ink + accent) | **3** lines on desktop, **5** on mobile | ✗ |
| H2 font | Plus Jakarta Sans 800 / 48px / -1.2px / 1.0 | 48 / 800 / -1.2 / 48 | ✓ |
| Eyebrow | 14 / 700 / uppercase / 1.4px / accent-dark | 14 / 700 / uppercase / 1.4px / accent-dark | ✓ tokens |
| Eyebrow x-position | aligned with H2 below | **x=0 on desktop, x=24 on mobile** — not aligned with H2 (x=240) | ✗ |
| Eyebrow num-label separator | gap or `·` separator | runs together "01Foundation" | ✗ |
| Lead p | Inter / 20 / 1.625 / ash / 60ch (≈576px) | Inter / 20 / 1.625 / ash / **680px** | ≈ |
| Body p color | ash for muted, ink for primary | charcoal (`oklch(0.28 0 0)`) — between ash and ink | ≈ |
| Pill CTA primary | accent-dark / paper / 9999px / 16×48 / 18×700 | accent-dark / paper / 9999px / 16×48 / 18×700 | ✓ |
| Pill CTA secondary | ink / paper / 9999px / 16×48 / 18×700 | ink / paper / 9999px / 16×48 / 18×700 | ✓ |
| Body bg | `oklch(96.5% 0 0)` + dot grain | `oklch(96.5% 0 0)` + radial-gradient | ≈ (grain barely visible) |
| Topnav height | 64–104px sticky | 64px sticky | ≈ |
| Topnav brand | wordmark text + sigil + sub-label + primary CTA pill | sigil only, no text, no CTA | ✗ |
| Hero layout | 2-column: text+CTAs left, code-window plate right | 1-column centered | ✗ |
| Section padding | 128/128 (160 on hero, 160 on ink-band) | 120/120 (160/120 on hero, 160/160 on ink-band) | ≈ |
| Ink-band per page | exactly 1 | 1 (Memory) | ✓ |
| Dev-window plate | Hero (above-the-fold) | Adoption (below-the-fold) | ≈ different placement |
| Footer | full ink-band, brand + columns + fineprint | full ink-band, brand + columns + fineprint | ✓ |

---

## Detailed findings

### [P0] Hero is right-shifted; left half of viewport is empty
- **Location**: `site/src/pages/index.astro` hero section + `site/src/components/Masthead.astro` scoped styles + `site/src/styles/global.css` `main > section > *` rule
- **Category**: Layout / Anti-pattern
- **Impact**: At 1440×900, the bicolor headline + lead + CTAs cluster around `x=412..1028` (a 616px-wide content envelope) instead of using the full 1024px content column. The left ~30% of the viewport is empty whitespace. Reads as "content failed to load on the left."
- **Why**: `Masthead.astro` is `<section class="hero"><Masthead/>` which inside is a `<section class="masthead">...</section>`. Two stacked `<section>` constraints + Masthead's own scoped widths produce a doubly-clamped column that drifts right of viewport center.
- **Fix**: Either remove the inner `<section class="masthead">` wrapper, or set `.masthead { max-width: none; padding-inline: 0 }` so it stretches to its parent's constrained inner width and stops self-constraining. Test: H1 left edge should land at `x = (1440 - 1024) / 2 + 32 = 240` matching the H2s below.
- **Suggested command**: `$impeccable layout`

### [P0] Section eyebrows bleed to viewport `x=0`, misaligned with their H2
- **Location**: `site/src/styles/global.css` `main > section > *` rule + `.section-eyebrow` `display: inline-flex`
- **Category**: Layout / Anti-pattern
- **Impact**: Every section eyebrow ("FOUNDATION", "WORKFLOW", "PERSISTENCE", "INSTALL") reports `x=0` on desktop, while the H2 directly below it is at `x=240`. The label and the heading look unrelated. Reads as broken markup.
- **Why**: `main > section > * { max-width: var(--width-content); margin-inline: auto }` only centers block-level children. `.section-eyebrow` is `display: inline-flex` (inline-level), and `margin-inline: auto` doesn't center inline-level boxes. The eyebrow flows to the section's left edge, which is `x=0` because `<section>` itself is now full-bleed.
- **Fix**: change `.section-eyebrow` to `display: flex` (or wrap each section's content in a `<div class="section-inner">` block-level wrapper that gets the centering).
- **Suggested command**: `$impeccable layout`

### [P0] "01Foundation" runs together — no separator between numeral and label
- **Location**: `site/src/pages/index.astro` eyebrow markup + `site/src/styles/global.css` `.section-eyebrow .num` rule
- **Category**: Anti-pattern
- **Impact**: Reads as "01Foundation" / "02Workflow" / "03Persistence" / "04Install" — visually broken. Either a typo or a CSS bug in human eyes.
- **Why**: The eyebrow `<p>` contains `<span class="num">01</span>Foundation`. The label "Foundation" is an anonymous text node, not wrapped in a span. `display: inline-flex` + `gap: 8px` does not create gaps between an element and an adjacent text node consistently across browsers. The `.num { margin-inline-end: 8px }` should produce a margin but isn't visibly rendering — likely because Astro's MDX/HTML serialization eats the whitespace between `</span>` and `Foundation`.
- **Fix**: wrap the label in `<span>Foundation</span>`, or use a `::before` pseudo on the eyebrow with the num content, or insert a literal separator character ("01 · Foundation" as one text run). The phantomflow source uses a single text label like "THE GAP" — no numeral. Cleanest fix: drop the numeral altogether and let the eyebrow be just the taxonomy label.
- **Suggested command**: `$impeccable layout`

### [P0] H1 wraps to 3 lines on desktop, 5 on mobile
- **Location**: `site/src/pages/index.astro` hero + `site/src/components/Masthead.astro` props
- **Category**: Anti-pattern
- **Impact**: DESIGN.md is explicit: "Two-color H1 — Always two lines; never put both colors on one line." Phantomflow ships short bicolor H1s ("JSON In." / "Video Out."). Our `titleA="A Claude Code baseline" titleB="for software engineering."` is 4-words-then-3-words at 96px display weight — wraps to 3 lines on desktop (because the inner constraint clamps the H1 to <616px), 5 lines on mobile (because the H1 clamps to 48px and the words still wrap). Reads as too-long-headline, not bicolor signature.
- **Fix**: Tighten the headline to ≤2 words per line. Candidates: `titleA="Discipline."` `titleB="On rails."` or `titleA="Ship code."` `titleB="With gates."` or `titleA="The constitution."` `titleB="For Claude Code."` Pick the bicolor that names the value claim cleanly. Then verify it renders as exactly two lines at 96px on desktop and ≤4 short lines on mobile.
- **Suggested command**: `$impeccable clarify` (for the copy) followed by visual verification

### [P1] Topnav has no wordmark text, no primary CTA pill
- **Location**: `site/src/components/Topnav.astro`
- **Category**: Layout / Anti-pattern (against DESIGN.md "Topnav" component spec)
- **Impact**: DESIGN.md and phantomflow both ship a wordmark+sigil+sub-label + primary CTA pill on the right. Our Topnav has just the orange diamond sigil + 4 nav links + a GitHub icon. The brand is unidentified at first glance — visitors land and don't know "what is this." Plus no above-the-fold conversion target visible without scrolling.
- **Fix**: Add `<span class="topnav-name">create-baseline</span>` next to the sigil at 18/800 Plus Jakarta Sans. Add a `<span class="topnav-sub">v0</span>` mono-caps sub-label or skip it. Add a primary `.cta-sm` pill on the far right after the GitHub icon: `Get baseline` linking to `#adoption`. The GitHub icon stays.
- **Suggested command**: `$impeccable bolder` for the topnav

### [P1] Hero is single-column; phantomflow is two-column with code-window plate on the right
- **Location**: `site/src/pages/index.astro` hero section
- **Category**: Layout / Anti-pattern
- **Impact**: Phantomflow's hero is the editorial signature: H1+lead+CTAs left, dev-window code-plate (with traffic-light dots, slight rotation, hand-drawn outline) on the right. The plate carries the "this is a developer product" signal above the fold. Our hero is a centered text chunk on empty paper — reads as a marketing landing page that forgot the visual.
- **Fix**: Restructure hero as `display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr)`. Left column: Masthead + lead + CTAs. Right column: a dev-window plate (move our existing `<DevWindow>` from Adoption into the hero, or build a hero-specific one). Shorter install snippet (just `$ npx @friedbotstudio/create-baseline .` over 3 lines). DESIGN.md explicitly calls for this in "Components observed on phantomflow → Hero illustration plate."
- **Suggested command**: `$impeccable layout`

### [P1] Paper-grain texture is barely visible
- **Location**: `site/src/styles/global.css` `body { background-image: ... }`
- **Category**: Theming
- **Impact**: DESIGN.md adoption note: "ship a CSS-only equivalent: a 12×12 dot-pattern at oklch(82% 0 0) 0.3 alpha." At full opacity 0.3 against `oklch(96.5% 0 0)` it's nearly indistinguishable from the page bg. Phantomflow's `bg.webp` is visibly textured. Our pattern is set but doesn't read.
- **Fix**: increase chroma/contrast — try `oklch(70% 0 0 / 0.35)` (darker dot, slightly higher alpha). Or try a 14×14 grid instead of 12. Alternative: use two layered radial-gradients (one slightly offset) to create a denser perceptual texture.
- **Suggested command**: `$impeccable colorize`

### [P1] DevWindow plate has no rotation, no wobble outline
- **Location**: `site/src/components/DevWindow.astro`
- **Category**: Anti-pattern (against DESIGN.md "Hero illustration plate")
- **Impact**: DESIGN.md explicitly: "The window has a slight rotation (≤2°) and a hand-drawn-ish wobbly outline drawn in 2px ink — that imperfection is the brand's signature warmth against an otherwise tight system." Ours is a perfectly axis-aligned dark rectangle. The warmth signal is missing.
- **Fix**: add `transform: rotate(-1.2deg)` to the dev-window outer figure. Replace the rectangular border with an inline SVG `<rect>` using `stroke-dasharray` to create a hand-drawn appearance, or use `clip-path` with a slightly-jittered polygon.
- **Suggested command**: `$impeccable delight`

### [P1] Lead paragraph max-width too wide (680px vs phantomflow 576px)
- **Location**: `site/src/styles/global.css` `p.lead { max-width: 576px }` (this is actually correct now — but the body `p` rule has `max-width: 680px` and that's what the lead inherits if the rule order is wrong)
- **Category**: Typography
- **Impact**: Computed `lead.maxWidth` is `680px`, not `576px`. Lead paragraph reads as too long per line. Phantomflow targets ~60ch.
- **Why**: `p { max-width: var(--width-prose) }` (680) is defined AFTER `p.lead { max-width: 576px }` in the CSS file? Or specificity issue. Let me check: actually both rules at same specificity, source order wins. Need to verify.
- **Fix**: ensure `p.lead { max-width: 576px }` comes after the generic `p { max-width: 680px }` rule, or use higher specificity (`main p.lead`).
- **Suggested command**: `$impeccable typeset`

### [P1] Body paragraph color is charcoal (28% L) instead of ash (45% L)
- **Location**: `site/src/styles/global.css` `p:not(.lead):not(.section-eyebrow):not(.eyebrow)` rule
- **Category**: Theming
- **Impact**: Body p computed color is `oklch(0.28 0 0)` (charcoal) which is close to ink. DESIGN.md reserves charcoal for "secondary text" (not body) and prescribes ash (`oklch(45% .026 257)`) for muted body / captions. Body prose reads heavier than phantomflow's slate-600.
- **Fix**: `main p { color: var(--color-ash) }` for non-primary prose. Reserve charcoal for callout / highlighted text. Note: this conflicts with WCAG body-text contrast — ash on cream is 4.7:1 (AA pass for body); ink remains the option for AAA prose.
- **Suggested command**: `$impeccable typeset`

### [P2] Section H3 ("Hook boundary", "Skill catalog") has the same display weight as H2
- **Location**: `site/src/styles/global.css` h3 rule + actual rendering
- **Category**: Typography
- **Impact**: H3 is set at `24px / 700`, H2 at `48px / 800`. Visually H3 reads as a small body-headline rather than a clear sub-section pivot. Phantomflow's H3 is rare; sections rely on H2 + plate composition.
- **Fix**: Either drop the H3 in favor of an inline label inside the plate component, OR shrink H3 to `18px / 700 / accent-dark / uppercase` so it reads as a structured sub-eyebrow rather than a competing display tier.
- **Suggested command**: `$impeccable typeset`

### [P2] No editorial moment between Memory ink-band and Adoption
- **Location**: `site/src/pages/index.astro` section transitions
- **Category**: Layout / Editorial-moments rule
- **Impact**: Going from ink-band Memory directly to paper Adoption is abrupt — both surfaces reset their typography rules at the band boundary, but nothing eases the eye. Phantomflow uses a paper section with a wide max-width gap before the next ink moment.
- **Fix**: Add `padding-block-start: var(--spacing-3xl)` on the section after `.band-ink`. Or let the Memory ink-band have a deliberate ash-on-ink lead paragraph that ends with a final mono caps eyebrow ("NEXT") so the transition reads as a deliberate cliff.
- **Suggested command**: `$impeccable layout`

### [P2] Topnav backdrop is `oklch(99% 0 0)` solid; phantomflow uses a translucent backdrop with backdrop-filter
- **Location**: `site/src/components/Topnav.astro` scoped styles
- **Category**: Theming
- **Impact**: Solid paper Topnav reads as a flat ribbon. Phantomflow's translucent + backdrop-filter creates a subtle depth signal as the page scrolls under it. Minor but cumulative.
- **Fix**: `background: color-mix(in oklch, var(--color-paper) 80%, transparent); backdrop-filter: blur(12px);` Test contrast still passes.
- **Suggested command**: `$impeccable polish`

### [P2] Mobile H1 wraps to 5 lines
- **Location**: `site/src/components/Masthead.astro` clamp + index.astro headline copy
- **Category**: Responsive
- **Impact**: At 390×844 the H1 reads "A Claude" / "Code" / "baseline" / "for software" / "engineering." — five short lines stacked. Loses bicolor punch entirely.
- **Fix**: Same fix as P0 H1 wrapping (tighten copy). Plus consider a smaller mobile clamp lower bound (clamp 36–48 instead of 48–96).
- **Suggested command**: `$impeccable adapt`

### [P3] Footer column labels mono caps in ash; should they be in mist for stronger contrast against ink?
- **Location**: `site/src/components/Footer.astro` scoped styles
- **Category**: Theming / minor
- **Impact**: `oklch(0.45 0.026 257)` (ash) on ink-band has contrast 5.8:1 — passes AA but reads slightly muddy. Phantomflow uses a slightly lighter ash on its dark footer.
- **Fix**: Bump to mist `oklch(0.89 0.013 257)` for footer column labels and fineprint, OR keep ash but apply only to the labels (not the link list).
- **Suggested command**: `$impeccable polish`

### [P3] PRODUCT.md is missing
- **Location**: project root
- **Category**: Process
- **Impact**: `impeccable` skill flagged on context-load: "PRODUCT.md missing." Future design passes will produce generic register without it. Not blocking this audit, but worth recording.
- **Fix**: run `$impeccable teach` to set up PRODUCT.md (users, brand, tone, anti-references, strategic principles).
- **Suggested command**: `$impeccable teach`

---

## Patterns / systemic issues

1. **Inline-flex/inline-block elements escape the inner-constraint pattern.** The new `main > section > *` rule centers block-level children. Inline-level children (eyebrows, the inline pill row when not wrapped in `.cta-row`, raw inline links) flow to the section's left edge (x=0) because the section is full-bleed. This will keep biting until the constraint pattern is migrated to a `.section-inner` block-level wrapper (DESIGN.md describes this pattern but the implementation only half-adopted it).

2. **Two compositional contracts double-clamping content.** Components like Masthead have their own `max-width` in their scoped CSS. Wrapped inside the page-level `main > section > *` constraint, they double-clamp and the result drifts off-center. Components SHOULD trust their parent's constraint and not self-clamp width.

3. **Section padding rhythm is close-but-off.** Phantomflow uses 128/128 (and 160 on hero+ink-band). We use 120/120 (and 160/120 on hero, 160/160 on ink-band). The differences are small but they compound — six sections at 120 read shorter than six at 128 by 48px total, and the rhythm shifts.

4. **Editorial moments rule (one bicolor H1, one ink-band, one dev-window) is structurally honored but visually under-deployed.** The H1 doesn't read as bicolor (3 lines), the ink-band lacks a memorable headline ("Memory that doesn't rot." is good; the section content is too dense for the ink contrast), the DevWindow is below-the-fold instead of the hero plate.

---

## Positive findings

- **Tokens are correct.** All color tokens, type tokens, spacing tokens match DESIGN.md exactly. `check-tokens.mjs` enforces this and is clean.
- **Build pipeline works.** Astro build is deterministic (per AC-007 / `check-determinism.sh`), pages emit, sitemap + robots emit, no console errors, no JS on no-island pages (per AC-013 / `check-islands.mjs`).
- **Pill CTAs are pixel-correct.** Bg accent-dark, color paper, 9999 radius, 16/48 padding, 18/700 display font. Match phantomflow exactly.
- **Footer is structurally right.** Ink band, brand wordmark + sigil, 3 columns, fineprint row. The geometry is correct; only the column-label color is too muddy (P3).
- **Section eyebrow tokens are right** (14/700/uppercase/1.4px/accent-dark). Just the layout positioning is wrong.
- **A11y floor mostly met.** Skip-link works (clip-path inset, focus-reveal), focus rings on interactive elements, landmark roles correct, keyboard navigation works.
- **Plate components retain their intended internal styling.** PipelineSubway, MemoryFlowPlate, HookBoundaryGrid, SkillCatalog, DevWindow each have their own component-scoped CSS that is structurally sound (just the dev-window lacks rotation+wobble per P1).

---

## Recommended actions (priority order)

1. **[P0] `$impeccable layout`** — Fix the hero right-shift, the section-eyebrow `x=0` bleed, and the "01Foundation" run-together. These are visible-on-first-glance bugs that brand the site as broken. Single layout pass should cover all three: introduce a `.section-inner` block-level wrapper, change `.section-eyebrow` to `display: flex` (block-level), wrap the eyebrow label text in a `<span>` so flex-gap applies.
2. **[P0] `$impeccable clarify`** — Tighten the H1 to two short lines (≤3 words each) so it reads as the bicolor signature DESIGN.md prescribes. The current "A Claude Code baseline / for software engineering." wraps to 3 lines on desktop and 5 on mobile.
3. **[P1] `$impeccable bolder` (Topnav)** — Add wordmark text + sub-label + primary CTA pill on the right.
4. **[P1] `$impeccable layout` (Hero v2)** — Restructure to two-column with a dev-window plate on the right; move/duplicate the existing `<DevWindow>` into the hero or build a hero-specific one.
5. **[P1] `$impeccable colorize`** — Strengthen the paper-grain texture so it actually reads.
6. **[P1] `$impeccable delight`** — Add the dev-window rotation (-1.2°) + wobble outline so the brand's signature warmth signal lands.
7. **[P1] `$impeccable typeset`** — Fix lead `max-width` precedence (576 vs 680), shift body p color from charcoal to ash for muted prose.
8. **[P2] `$impeccable layout`** — Smooth the Memory ink-band → Adoption transition.
9. **[P2] `$impeccable adapt`** — Mobile H1 wrap (depends on P0 H1 copy fix).
10. **[P2] `$impeccable polish`** — Topnav translucent backdrop, footer column-label color.
11. **[P3] `$impeccable teach`** — Set up PRODUCT.md so future design passes have register grounding.
12. **[final] `$impeccable polish`** — Re-audit after fixes land.

---

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see the score improve.
