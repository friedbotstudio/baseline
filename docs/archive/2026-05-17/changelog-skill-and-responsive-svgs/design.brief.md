# Design brief — architecture-svg-bento-grid-responsive

**Surface.** Inline architecture SVG at `site-src/index.njk:180-259` (§III "How it flows").
**Files in write_set.** `site-src/index.njk`, `site-src/assets/site.css`.
**Register.** Brand (PRODUCT.md `register: brand`). Surface inherits the docs-site technical-aesthetic vocabulary: filled squares, open frames, dashed accent rules, ink + cream surfaces, mono caps labels. Matches `.strata-svg`, `.diagram-svg`, and per-page hero symbols. Not marketing-glossy.
**Source authority.** Spec `docs/specs/changelog-skill-and-responsive-svgs.md` § Design calls (user-pinned 2026-05-18); DESIGN.md "Quiet authority · editorial calm"; reserved-accent contract.

## 1. Feature summary

Replace the current 940×200 linear-axis workflow diagram with an asymmetric bento composition that conveys workflow shape (planning anchor, execution arm, paired endings, runtime gate) instead of pure temporal sequence. Desktop renders a five-zone bento; mobile (≤768px) collapses to a single-column stack of the same eleven phases plus three gates. The runtime gate (`/grant-push`) sits outside the grid in both regimes.

## 2. Primary user action

A reader scanning the §III section in 5 seconds picks up: (a) `spec` is the planning hero, (b) `tdd` is the execution arm, (c) phases pair at the tail (archive↔memory-flush; changelog↔commit), (d) consent gates are inline annotations, (e) `/grant-push` is not in the pipeline.

## 3. Design direction

- **Color strategy.** Restrained. Tinted neutrals from DESIGN.md (`--ink`, `--paper`, `--cream`, `--rule`, `--muted`) for cells, hairlines, and labels. `--accent` reserved per the contract: hook lines (dashed 4-4), gate nodes (filled), gate annotations (caps + rules), and one accent-bordered "audit pill" equivalent for the user-pinned ship pair seam.
- **Theme scene sentence.** A senior engineer at a 27-inch monitor reads §III for the first time in afternoon office light, deciding within five seconds whether to keep scrolling — surface stays light-mode `--bg` to match the rest of the landing.
- **Anchor references.** The existing `.strata-svg` vertical 4-form composition for cell vocabulary; the existing workflow `.diagram-svg` for accent/hook/gate conventions; the new bento adds asymmetric cell sizing as its only register move beyond those.

## 4. Scope

- **Fidelity.** Production-ready (shipped diagram, AA contrast, reduced-motion safe).
- **Breadth.** One SVG + matching CSS rules.
- **Interactivity.** Static. Optional `prefers-reduced-motion`-aware micro-pulse on the ship pair seam mirrors the brand-dot pulse — single subtle moment, easily skippable.
- **Time intent.** Polish until it ships.

## 5. Layout strategy

### Desktop bento (≥769px)

Single `<svg>` with `viewBox="0 0 1000 540"` and `width="100%"`. Twelve-column conceptual grid; cells are absolutely positioned rectangles with mono-caps labels and (where useful) numeric ordinals. The composition divides into five zones:

| Zone | Cells | Visual weight |
|---|---|---|
| Preamble strip (top-left) | intake · scout · research | Three equal small cells |
| Hero | **spec** | Largest cell; carries §III's anchor weight |
| Gate A inline | `/approve-spec` | Filled accent square + dashed bracket between research and spec |
| Mid strip | simplify · security · integrate · document | Four equal small cells |
| Tail pairs | archive ↔ memory-flush · changelog ↔ commit | Two pairs with hairline gutters; ship pair carries an accent seam |
| Gate C inline | `/grant-commit` | Filled accent square + dashed bracket after commit |
| Execution arm (right column) | **tdd** | Tall cell spanning full grid height; open-frame stroke (open = "where work happens"); mono-caps "EXECUTION" eyebrow |
| Runtime gate (below grid) | `/grant-push` | Outside the main bento; dashed accent horizontal rule + mono caps "RUNTIME GATE" + Art. VII footnote — distinct from phase gates |

### Coordinate map (desktop, viewBox 0 0 1000 540)

```
─────────────────────────────────────────────────────────────────────
       cols 1-4 (preamble)        cols 5-9 (hero + mid + tail)        cols 10-12 (tdd)
─────────────────────────────────────────────────────────────────────
y=0   ┌──────┬──────┬──────────┐ ┌────────────────────────────────┐ ┌──────────────────┐
      │intake│scout │research  │ │                                │ │                  │
y=110 │ 110w │ 110w │  110w    │ │             SPEC               │ │      TDD         │
      └──────┴──────┴──────────┘ │           (hero cell)          │ │   (tall cell,    │
y=130 [gate A annotation strip:  │           520×220              │ │    240×440)      │
       dashed bracket            │                                │ │                  │
       /approve-spec @ x=370 ]   └────────────────────────────────┘ │                  │
y=250 ┌──────┬──────┬──────┬───┐                                    │                  │
      │simpl │secur │integ │doc│                                    │                  │
y=340 │      │      │      │   │                                    │                  │
      └──────┴──────┴──────┴───┘                                    │                  │
y=360 ┌─────────────┬─────────┐ ┌─────────────┬─────────┐           │                  │
      │  archive    │ memory- │ │ changelog   │ commit  │           │                  │
y=470 │             │ flush   │ │             │         │ [gate C]  │                  │
      │  (paired)   │         │ │ (ship pair) │         │           │                  │
      └─────────────┴─────────┘ └─────────────┴─────────┘           └──────────────────┘
y=490 ─ ─ ─ ─ ─ /grant-push runtime gate (dashed accent rule, full width below) ─ ─ ─ ─
y=540 (Art. VII footnote in mono 9px)
─────────────────────────────────────────────────────────────────────
```

**Cell coordinates (desktop):**

| Cell | x | y | w | h | Stroke | Notes |
|---|---:|---:|---:|---:|---|---|
| intake | 40 | 40 | 110 | 70 | 1px `--rule` | Open frame, mono 11 label |
| scout | 160 | 40 | 110 | 70 | 1px `--rule` | Open frame |
| research | 280 | 40 | 110 | 70 | 1px `--rule` | Open frame |
| gate A | 410 | 60 | 30 | 30 | `--accent` fill | Filled square + check glyph + caps label |
| spec | 460 | 30 | 280 | 220 | 1.5px `--ink` | **Hero**: filled `--paper` cell + ordinal 04 + mono caps eyebrow "PLAN" + title 18px |
| tdd | 760 | 30 | 200 | 480 | 1.5px `--ink` (dashed 6-3) | **Tall**: open-frame stroke (dashed = open-ended); ordinal 06; mono caps eyebrow "EXECUTION" |
| simplify | 40 | 290 | 110 | 70 | 1px `--rule` | |
| security | 160 | 290 | 110 | 70 | 1px `--rule` | Optional indicator (mono 9 "OPTIONAL" beneath label) |
| integrate | 280 | 290 | 110 | 70 | 1px `--rule` | |
| document | 400 | 290 | 110 | 70 | 1px `--rule` | |
| archive | 40 | 400 | 145 | 70 | 1px `--rule` | Paired left half |
| memory-flush | 195 | 400 | 145 | 70 | 1px `--rule` | Paired right half; hairline gutter only (no double border) |
| changelog | 360 | 400 | 145 | 70 | 1.5px `--ink` | **Ship pair** left; accent seam between this and `commit` |
| commit | 515 | 400 | 145 | 70 | 1.5px `--ink` | **Ship pair** right |
| gate C | 680 | 420 | 30 | 30 | `--accent` fill | Filled square + caps label `/grant-commit` |
| /grant-push | 40 | 500 | 700 | 1 | dashed 6-5 `--accent` | Horizontal rule beneath grid; mono caps "RUNTIME GATE" above + `/grant-push` + footnote |

Gutter discipline: 10px between cells, 10px between pairs, 30px between zone bands (preamble→mid, mid→tail, tail→runtime).

### Mobile stack (≤768px)

Same `<svg>` element. Inside it, the `.bento-desktop` group hides via `display: none` and the `.bento-mobile` group shows. The mobile viewBox is conceptually `0 0 360 1100` — fourteen rows top-to-bottom in temporal order:

```
intake (full width) ─ y=0
scout              ─ y=70
research           ─ y=140
[gate A bracket]   ─ y=210  (filled accent square, inline caps "USER-TYPED · /approve-spec")
spec  (1.4× height — hero treatment preserved) ─ y=270
tdd   (1.4× height — execution emphasis preserved) ─ y=430
simplify ─ y=590
security ─ y=660 (with OPTIONAL mono 9 below label)
integrate ─ y=730
document  ─ y=800
archive ─┐ paired bracket on right side: dashed accent rule ─ y=870
memory-flush ─┘                                                  y=940
[gate C bracket] ─ y=1010
changelog ─┐ ship-pair seam (accent 1.5 left rail) ─ y=1010
commit    ─┘                                                  y=1050
─ ─ /grant-push runtime ─ ─                                   y=1080
```

The "tall TDD" invariant transfers to mobile as "TDD gets the **largest** stacked cell" (1.4× standard cell height plus open-frame dashed stroke). Pairs preserve their pairing by sharing a right-side bracket. The ship pair preserves the accent seam as a vertical left rail spanning both cells. `/grant-push` retains its separated runtime treatment beneath the stack.

## 6. Key states

- **Default.** As drawn above; static.
- **Reduced motion.** No motion present; nothing to override.
- **No JS.** The diagram is pure SVG + CSS. Server-rendered at build time.
- **Print.** Hide-on-print not required (SVG renders cleanly).

## 7. Interaction model

None. Static informational diagram. The figcaption remains the only text-side interaction (links to `/hooks/`, `/workflow/` retained from current implementation).

## 8. Content requirements

- `<title id="workflow-diag-title">` updated to name the bento composition (planning anchor, execution arm, paired endings, runtime gate). Verbatim sentence specified in craft step.
- `<desc>` block listing each phase + gate for assistive technology (verbatim spec in craft step).
- `<figcaption>` retained, lightly revised to name the bento zones in plain text. Strict no-em-dash per Article X.1 (user-facing copy).
- Cell labels: phase name (Inter Tight 13/600, `--ink`); optional ordinal (JetBrains Mono 11/600 `--muted`); optional mono caps eyebrow for hero/tall cells.
- Gate labels: caps "USER-TYPED" + command name (`/approve-spec`, `/grant-commit`, `/grant-push`).

## 9. Recommended impeccable references during craft

- `spatial-design.md` — for the bento cell sizing math.
- `responsive-design.md` — for the desktop→mobile regime switch.
- `accessibility.md` — for `<title>`, `<desc>`, focus order, contrast.
- DESIGN.md "Diagram SVG conventions" and "Reserved-accent contract" sections — these constrain palette + stroke + label choices.

## 10. Open questions (for craft)

None of these block; craft can resolve.

1. **TDD cell stroke**: dashed 6-3 (open-frame = "where work happens"; matches the existing comptree dashed conditional-edge vocabulary) or solid 1.5? Brief commits to dashed 6-3 for the "execution-is-open-ended" signal but craft may downgrade to solid if dashed reads as "secondary".
2. **Ship-pair seam**: a 1.5px `--accent` vertical rule between `changelog` and `commit`, or a unified hairline outer border at 1.5px `--accent`? Brief commits to the vertical rule (less visual weight; matches the "pair" semantic without enclosing).
3. **Runtime gate position**: directly beneath the grid (committed) or floating-right with a curved connector to commit? Brief commits to beneath the grid for the "outside the pipeline" semantic — connector would read as "after commit", which is wrong.

## Verbatim user invariants (binding)

1. spec is the visual hero.
2. tdd is a tall right-side cell.
3. archive + memory-flush visually paired.
4. changelog + commit visually paired (the ship pair).
5. gates A and C are small inline cells.
6. /grant-push is outside the phase pipeline (runtime gate; distinct visual treatment).
7. same SVG element used at 320px and 1920px.

Brief honors all seven. Craft step writes the implementation.
