# Design brief — workflow-extension-via-workflows-json

Three additive composition elements for `site-src/index.njk`, under one binding constraint quoted from the user:

> "current design is beautiful, do not mess it up"

Every choice below is justified in terms of an existing rule, token, or class. Anything that cannot be is rejected.

---

## Part A — Preservation baseline

What makes the existing index.njk beautiful, read off `site.css` and `index.njk`:

### Type

The page uses three families, each with one job. No additional families enter.

- `--display` — Inter Tight, hero headings + h3 (`--display` token at `:root`).
- `--body` — Inter, body copy.
- `--mono` — JetBrains Mono, eyebrows, ords, modifiers, code, syntax.

Scale, by use:
- Hero h1 — 64-ish via `.lead` and `.hero h1`.
- Section h2 — `.lede h2`.
- Concept h3 — 17px (rule at `.concept h3`).
- Meta-strip numeral — 32px display/600/tabular-nums (rule at `.hero .meta-strip .stat .num`).
- Meta-strip label — 10.5px mono/500 caps with `.10em` letterspacing (rule at `.hero .meta-strip .stat .label`).
- Cell eyebrow — 10px mono/600 caps with `.10em` letterspacing, `fill: var(--accent)` (rule at `.arch-bento .cell-eyebrow`).
- Cell ord — 12px mono/600 with `.04em` letterspacing, `fill: var(--muted)` (rule at `.arch-bento .cell-ord`).
- Cell modifier — **8.5px mono/600 caps with `.10em` letterspacing, `fill: var(--faint)`** (rule at `.arch-bento .cell-modifier`). Already used by "OPTIONAL" on the security cell. **This is the SELECTOR slot.**
- Chain-chip label — 11.5px mono/500, `fill: var(--ink)`, `-0.005em` letterspacing (rule at `.arch-bento .chain-label`). **This is the chip vocabulary.**

### Color

OKLCH tokens at `:root` lines 13-27. The full set the page draws from:
- `--ink` 15% 0 0 — primary text + heading.
- `--text` 15% 0 0 — body.
- `--muted` 45% 0.026 257 — secondary text, cell ord, meta-strip label, cell-sub.
- `--faint` 72% 0.012 257 — tertiary text, cell modifier, end-of-cell hints.
- `--rule` 89% 0.013 257 — hairlines, borders, chain-chip stroke, meta-strip dividers.
- `--rule-soft` 94% 0 0 — softer dividers.
- `--cream` 94% 0 0 — chain-chip fill (the only chip-like surface tint).
- `--paper` 99% 0 0 — concept card background, figure background.
- `--bg` 96.5% 0 0 — page background.
- `--accent` 55.8% 0.187 41.5 — orange-700, sparingly: cell-eyebrow, install pill, link hover, accent gates, `.accent` punctuation period.
- `--accent-light`, `--accent-soft`, `--accent-faint` — supporting accent variants for hover, selection, halos.

The accent is used on a single-digit count of surfaces per page. That restraint is load-bearing. No addition introduces new uses of the accent.

### Spacing

Rhythm values in active use across `.hero`, `.meta-strip`, `.concept`, `.arch-bento`:
- 8, 10, 12, 16, 22, 26, 28, 32, 56, 80 (px).

Specifically:
- `.hero .meta-strip` — `padding: 26px 0`, `margin-top: 56px`, `max-width: 660px`, `border-block: 1px solid var(--rule)`.
- `.hero .meta-strip .stat` — `gap: 10px`, `padding-inline: 22px`, `border-inline-start: 1px solid var(--rule)`.
- `.concept` — `padding: 32px`, `background: var(--paper)`.
- `.concept .num` — `margin-bottom: 12px`.
- `.concept h3` — `margin-bottom: 10px`.
- `.concept p` — `margin: 0`, `line-height: 1.6`.

### Composition density

- Meta-strip is **one row of 5 evenly-spaced labelled numerals**, capped at 660px, anchored under the hero text.
- Bento has **deliberate asymmetry**: left dominant `spec` hero (580×230), right tall `tdd` arm (330×475). Bottom rows are compact 60h cells. The asymmetry is the form.
- Concept block is **a horizontal triplet of equal-weight cards**, each with `.num · h3 · p`. No icons, no decoration, no card chrome beyond the `--paper` background.

### Structural restraint — what the page DOESN'T do

Naming the absences:
- No gradients.
- No drop shadows.
- No glassmorphism, no backdrop-blur.
- No rounded-pill chrome (chips are subtly rounded, `rx=4` only).
- No icons or emojis decorating numerals.
- No decorative borders beyond 1px hairlines.
- No motion except the wobble-frame tilt on the dev-console hero.
- No card grid identical-repetition (cards exist but are 3 of equal width, no 6-grid).

Every addition stays inside that envelope.

---

## Part B — Three additions

### B.1 — Meta-strip 6th tile

**Markup, in index.njk lines 23-29 region.** Add one `<div class="stat">` with the same structure as the existing five:

```html
<div class="stat"><span class="num">{{ baseline.tracks.canonical }}</span><span class="label">Tracks</span></div>
```

`baseline.tracks.canonical` resolves to `4` (already added to `site-src/_data/baseline.json` in the prior pass).

**CSS, in site.css line 619-625.** The current rule:
```css
.hero .meta-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-top: 56px;
  padding: 26px 0;
  border-block: 1px solid var(--rule);
  max-width: 660px;
}
```

Two coordinated changes that preserve per-tile width and gap exactly:
- `grid-template-columns: repeat(5, 1fr)` → `repeat(6, 1fr)`
- `max-width: 660px` → `max-width: 792px` (= 660 × 6 / 5)

Per-tile width: was 660/5 = 132px, becomes 792/6 = 132px. **Unchanged.** Padding-inline 22px unchanged. Border-inline-start 1px unchanged. The strip just extends 132px to the right (still well within the hero-content column).

**Mobile.** The existing responsive rule at `.hero .meta-strip` line 2781 already declares `repeat(3, 1fr)`. With 6 items this becomes a clean 3+3 layout. The existing `:nth-child(3n + 1)` border-clearing rule already handles items 1 and 4 — exactly the start of each row. **No mobile-rule change needed.**

**Type / color / spacing.** Zero new tokens. Reuses `.num` (32px display/600) + `.label` (10.5px mono caps). Inherits gap and padding.

**Risk to preservation.** Negligible. Per-tile width preserved to the pixel. Mobile layout improves (3+2 becomes 3+3). The desktop strip is now 132px wider but remains under the hero-content column width.

### B.2 — Bento TDD-cell SELECTOR annotation

**Markup, in index.njk inside the `cell-tall` group at lines 210-247.** Add ONE new `<text>` element inside the existing TDD cell `<g class="bento-cell cell-tall">`:

```svg
<text class="cell-modifier" x="952" y="78" text-anchor="end">SELECTOR</text>
```

Position rationale: the existing `cell-ord` "06" sits at `x="952" y="58" text-anchor="end"` (line 213). The new SELECTOR text sits 20px below it at the same x, same alignment. That places it in the top-right zone with the "06" ord, visually pairing them. The cell-title-xl "tdd" sits at y=118 (line 214); there is 30px of clearance between SELECTOR (y=78) and the title (y=118). No collision.

**The chain-chip zone starts at y=210.** SELECTOR at y=78 is 132px above. No crowding.

**Class.** Reuses `.cell-modifier` verbatim (the rule already declared at site.css line 1215). `fill: var(--faint)`, 8.5px mono/600 caps, `.10em` letterspacing. Identical visual treatment to the "OPTIONAL" tag on the security cell.

**Text.** "SELECTOR" alone, no suffix. The cell-eyebrow above ("EXECUTION ARM") already establishes the conceptual frame; SELECTOR is the variant-specific note. Adding "· ALTERNATES" would crowd the right column and break the brevity of "OPTIONAL" as the visual precedent.

**Type / color / spacing.** Zero new tokens. Reuses `.cell-modifier`.

**Risk to preservation.** Negligible. Pure replication of an existing in-cell tag pattern, placed in unused vertical space.

### B.3 — Concept 03 chip strip

**Markup, in index.njk inside the Concept 03 `.concept` block (lines 103-107).** After the closing `</p>` and before the closing `</div>`:

```html
<div class="track-chips">
  <span class="track-chip">intake-full</span>
  <span class="track-chip">spec-entry</span>
  <span class="track-chip">tdd-quickfix</span>
  <span class="track-chip">chore</span>
</div>
```

**CSS, in site.css.** The existing `.arch-bento .chain-chip` rule is scoped to SVG `<rect>` + `<text>` pairs. For HTML reuse, declare two new rules that **transcribe** the same vocabulary into HTML primitives. Every value below derives from an existing token or an existing rule's declared property:

```css
/* Concept-03 track chips — HTML transcription of the bento .chain-chip + .chain-label pair.
   Visual properties mirror .arch-bento .chain-chip (rect: var(--cream) fill, var(--rule) stroke,
   rx=4) and .arch-bento .chain-label (mono 11.5/500, var(--ink), -0.005em). No novel tokens. */
.track-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
.track-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--cream);
  border: 1px solid var(--rule);
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink);
  letter-spacing: -0.005em;
}
```

**Transcription audit:**
- `background: var(--cream)` ← from `.chain-chip { fill: var(--cream) }`.
- `border: 1px solid var(--rule)` ← from `.chain-chip { stroke: var(--rule); stroke-width: 1 }`.
- `border-radius: 4px` ← from the SVG `rx="4"` on every `<rect class="chain-chip">` in the bento.
- `font-family: var(--mono)` ← from `.chain-label { font-family: var(--mono) }`.
- `font-size: 11.5px` ← from `.chain-label { font-size: 11.5px }`.
- `font-weight: 500` ← from `.chain-label { font-weight: 500 }`.
- `color: var(--ink)` ← from `.chain-label { fill: var(--ink) }`.
- `letter-spacing: -0.005em` ← from `.chain-label { letter-spacing: -0.005em }`.
- `padding: 8px 12px` — both on the existing 8/12/16/22 spacing scale.
- `gap: 8px` — on the spacing scale.
- `margin-top: 20px` — derived from the existing `.concept h3 { margin-bottom: 10px }` + `.concept p { line-height: 1.6 }` rhythm; 20px is one beat below the paragraph. (Edge case: 20px is NOT on the documented scale of 8/10/12/16/22. Closest legal values are 16 and 22. **Use 16px instead.**)

**Revised:** `margin-top: 16px` (on scale).

**Layout.** Four chips on one line at desktop width. The Concept block is 32px-padded, holds a 17px h3 + ~14.5px body. The four track names (`intake-full`, `spec-entry`, `tdd-quickfix`, `chore`) total ~37 characters; at 11.5px mono with 8/12 padding and 8px gap, that fits comfortably under most viewport widths. Wraps cleanly via `flex-wrap: wrap` if it ever overflows.

**Type / color / spacing.** Zero new tokens. One new HTML class (`.track-chip`) and one new layout class (`.track-chips`). Both are pure transcriptions of the existing chain-chip + spacing scale.

**Risk to preservation.** Low-medium. The chip is the only addition that introduces new CSS rules. Each property in those rules has a 1-to-1 source citation in the audit above. The chip mirrors the bento's chain-chip visual exactly — same fill, same stroke, same radius, same type, same color — so the page reads as carrying the same chip vocabulary through to the Concept block.

---

## Part C — Constraints summary

Honesty check before craft runs. All six must hold:

- **Zero new colors.** Confirmed. Every color in the additions cites an existing `--*` token at `:root`.
- **Zero new type weights.** Confirmed. Reuses 500/600 already in active use.
- **Zero new spacing scale steps.** Confirmed after revision (margin-top from 20px → 16px). All values: 8, 12, 16, 22 — already in use.
- **Zero new motion vocabulary.** Confirmed. No transitions, no animations on the new elements.
- **The single new HTML class (`.track-chip` + `.track-chips`) is a transcription of the existing bento `.chain-chip` + `.chain-label` rules.** Confirmed via the property-by-property audit in B.3.
- **The bento SVG geometry is byte-identical except for the one new `<text>` element with `.cell-modifier` class.** Confirmed. No `<rect>` moves, no path edits, no viewBox change.

---

## Part D — Approval gate

If the craft step proposes a CSS rule that introduces a new variable, color, weight, or spacing step not enumerated in Part A, **craft must surface and block** before writing. The brief is the contract. Any deviation surfaces back to design-ui.

The brief assumes `baseline.tracks.canonical = 4` is already present in `site-src/_data/baseline.json` (it is, set during the prior copy/data pass).

---

## Files craft will write

1. `site-src/index.njk` — three edits (meta-strip 6th tile, bento `<text>` annotation, concept-03 chip strip markup).
2. `site-src/assets/site.css` — two coordinated edits (5→6 columns + max-width 660→792 on the meta-strip rule) and one append (the `.track-chips` + `.track-chip` rules).

Nothing else.
