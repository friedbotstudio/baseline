# Audit — architecture-svg-bento-grid-responsive

**Surfaces audited.** `site-src/index.njk` (SVG block at the §III figure), `site-src/assets/site.css` (lines 985–1170 `.arch-bento` section).
**Method.** Static review against impeccable `reference/audit.md` 5-dimension framework + DESIGN.md reserved-accent contract + Article X.1 em-dash ban + WCAG 2.1 AA.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---|---|---|
| 1 | Accessibility | 4 | `<title>` + `<desc>` + role="img" + aria-labelledby/describedby all wired; ink-on-paper 14:1, muted 4.7:1, accent 5.6:1 all clear AA; no interactive elements (static diagram); reduced-motion N/A (no motion present). |
| 2 | Performance | 4 | Inline static SVG, no JS, no animations, no images. Browser-native `aspect-ratio` + `preserveAspectRatio="xMinYMin slice"`. Zero runtime cost beyond initial paint. |
| 3 | Responsive | 4 | Single `<svg>` with two `<g>` subtrees; `aspect-ratio` swap at 768px + `display: none` belt-and-suspenders. Mobile stack confined to x=0..360 within viewBox; desktop bento drawn at x=0..1000 y=0..540. Both regimes verified by tracing `preserveAspectRatio="xMinYMin slice"` math. |
| 4 | Theming | 4 | All fills/strokes from CSS tokens (`--ink`, `--paper`, `--rule`, `--muted`, `--faint`, `--accent`). All font families from `--display`/`--body`/`--mono`. Zero hard-coded color or font value. Single-theme light only per DESIGN.md; no dark-mode work expected. |
| 5 | Anti-Patterns | 4 | No gradient text, no glassmorphism, no hero-metric vanity, no side-stripe > 1px on a card (the ship-pair accent vertical is a typographic seam between two cells, not a card border), no identical-card grids (composition is deliberately asymmetric), no modal-first, no em dashes in figcaption or SVG copy. Technical-aesthetic register inherits cleanly from `.diagram-svg`, `.strata-svg`, hero symbols. |
| **Total** | | **20/20** | **Excellent** |

## Anti-Patterns Verdict

**PASS.** Zero AI tells. The diagram reads as a deliberate asymmetric composition with five named zones, ink + paper surfaces, hairline rules, and accent reserved for state (gates) + paired-pair seam + dashed runtime rule + caps eyebrows. The technical-aesthetic vocabulary matches the existing docs-site diagrams exactly.

## Executive Summary

- **Audit Health Score**: 20/20 (Excellent)
- **Severity breakdown**: P0=0, P1=0, P2=3 (minor polish items), P3=2 (taste).
- **Top issues**: none critical. The polish items below are optional.

## P0 / P1 issues

None.

## P2 issues (polish-loop candidates)

**P2-1. Cell eyebrow size.** `.arch-bento .cell-eyebrow` is 10px; DESIGN.md sets the standard eyebrow at 12px (`.eyebrow` and `.section-num`). Inside the diagram the 10px reads as a sub-eyebrow — defensible because the diagram itself is a sub-element of §III, but bumping to 11px would harmonize with the existing `.diagram-svg .hook-event` (11px caps mono).

**P2-2. TDD cell vertical density.** The TDD tall cell carries five stacked sub-labels (scenario / implement / verify / design-ui / drift-check) with arrow separators between, at 11.5px and 20px line spacing inside a 440h cell. Spacing budget: top eyebrow (78) + 5 lines × 20 + 4 arrows × 20 + foot (450) ≈ 388, within 30..470 = 440. Tight but legible. Could be loosened by dropping one separator or by collapsing the chain to two lines ("scenario → implement" / "verify → design-ui → drift-check"). Acceptable as-is.

**P2-3. Mobile viewBox height.** Mobile stack uses viewBox y=0..1200. At a 360w viewport this renders at 1200px tall. That is a long scroll (one full screen plus). Tightening cell gaps (10→6) and standard cell height (60→55) would reduce to ~1080. Acceptable as-is — the diagram is the §III figure, not a hero, and long scroll is appropriate for a fourteen-row stack.

## P3 issues (taste)

**P3-1. Ship-seam length.** The accent seam between `changelog` and `commit` runs y=412..468 (56 units inside cells of height 70). Could extend to y=405..475 to span the full cell heights. Currently it reads as "inset" — both feel fine.

**P3-2. Runtime-gate rule weight.** The dashed accent rule beneath the grid uses stroke-width 1 with opacity 0.75. Could go to 1.25 opacity 0.85 for slightly stronger presence. Defensible either way.

## User-pinned invariants (binding) — verification

| # | Invariant | Verified |
|---|---|---|
| 1 | spec is the visual hero | Yes — 290×230 cell with eyebrow "PLAN ANCHOR" + ordinal + title + sub + foot. Largest non-tall cell in the bento. |
| 2 | tdd is a tall right-side cell | Yes — x=830..970, y=30..470, 140×440 cell, open-frame dashed stroke. Spans the entire right column. |
| 3 | archive + memory-flush visually paired | Yes — `.bento-pair` group with hairline rule + caps tag "PAIRED · CLEANUP" above the two cells. |
| 4 | changelog + commit visually paired (ship pair) | Yes — `.bento-pair.pair-ship` with accent rule + accent caps "SHIP PAIR" above + 1.5px accent vertical seam between cells. |
| 5 | gates A and C are small inline cells | Yes — 30×30 filled accent squares, caps "USER-TYPED" tag, command name mono accent. Same pattern as the existing `.gate-anno`. |
| 6 | /grant-push outside the phase pipeline (runtime gate; distinct visual treatment) | Yes — separated by 30px gap from the grid, dashed accent horizontal rule, caps tag "RUNTIME GATE · ART. VII", footnote describing the trigger. Distinct from phase gates (no filled square, no check glyph). |
| 7 | same SVG element used at 320px and 1920px | Yes — one `<svg>` element with two `<g>` subtrees; CSS @media swaps `aspect-ratio` + `display`. viewBox fixed at `0 0 1000 1200` for both regimes. |

All seven invariants honored.

## Verdict

PASS. No P0/P1 issues. P2 items are optional polish. Recipe can proceed to a single polish iteration (cap 3 per design-ui Stage 3 Gate 2) addressing P2-1 and P2-2 if the orchestrator chooses, OR terminate at `final_state: "complete"` since P1=0.

**Recommendation**: terminate at complete; the P2 items don't justify a polish iteration. The cell eyebrow size and the TDD cell density are aesthetic preferences within the brand register, not violations.
