# Homepage SVG audit — 2026-05-29

**Slug:** homepage-svg-audit  ·  **Recipe:** `critique ∥ audit`  ·  **Mode:** auto  ·  **Final state:** `needs_human` (P0 ≥ 1 blocks auto-polish)

## Verdict

- **P0:** 3 (accessibility / legibility — block ship at WCAG floor)
- **P1:** 6 (consistency, hierarchy, stale content)
- **P2:** 6 (geometric polish, opportunity)

AI-slop verdict: **clean.** Zero gradients in SVG text, zero glow filters, zero glassmorphism, reduced-motion honored across 12 keyframes blocks.

## P0 — block ship

1. **Strata SVG (`site-src/index.njk:56`)** — `aria-labelledby="strata-cap"` points to a `<figcaption>` of single Roman numerals + one-word category names. Screen-reader narration is incoherent without the visual. Fix: embed real `<title>` inside the `<svg>` OR replace with `aria-label`.
2. **Workflow bento (`site-src/index.njk:192-471`)** — both `bento-desktop` + `bento-mobile` subtrees present in DOM at all times; SVG `display:none` semantics inconsistent across screen readers; combined with 130-word title+desc, AT narration runs ~45s × 2. Fix: `aria-hidden="true"` on inactive subtree; trim title+desc to noun phrase.
3. **Bento labels at 8.5–9px monospace** — `.cell-modifier`, `.pair-tag`, `.runtime-foot` render at ~6.1–7.5 device pixels on common viewports. Fix: raise floor to 10.5px mono.

## P1 — should fix

4. **Workflow bento has no temporal flow ductwork** — 11 cells + 2 gates + 5 chain chips, no connector line tracing the phase order. Fix: 1–1.25px hairline 01 → 02 → 03 → gate A → spec → tdd → … → gate C → ship pair.
5. **Dashed-stroke semantics drift** — `cli.njk:22` uses dashed for **active**, `skills.njk:44` uses dashed for **conditional**. Pick one (recommend conditional); update both files in lockstep.
6. **Hooks diagram connector hierarchy inverted** — `.hook-line` (stroke-width 1.75 dashed verticals) is visually heavier than `.conn` (stroke-width 1.5 solid horizontals). Hooks are the lede but read as the spine. Fix: drop `.hook-line` to 1.25.
7. **PRODUCT.md stale counts** — line 20 "thirty-six skills" → "forty"; line 40 "36 skills, 1 subagent, 11 phases, 3 gates" → "40 skills … 4 gates". Internal governance but leaks into impeccable's loaded context every session.
8. **`index.njk:97` — "Ten articles"** should be "Eleven articles" (CLAUDE.md has Articles I through XI; brainstorm + codesign are X.3 + X.4 sub-rules).
9. **`.bnd-rule` in `hooks.njk`** may render >1px at display and trip the impeccable side-stripe ban. Verify computed width.

## P2 — nice-to-have

10. arch-spine arrow SVGs (`index.njk:498, 509`) duplicate marker pattern inline; could be CSS `::after` triangle.
11. Strata mask numeral III misaligned ~2–8px (donut `cy=288` vs text `y=296`).
12. Memring promotion arrow tip off ~5–6px from geometric inner-ring point.
13. **Opportunity** — bento figcaption (line 472) silent on new Step 0.5 brainstorm + Step 1.5 codesign gates. One-line addition closes documentation gap without re-cutting the SVG.

## What's working

- Reduced-motion honored consistently across 12 keyframes blocks.
- Strata SVG is the strongest piece — typographic numerals as the only "icons" defies SaaS reflex.
- Zero gradients / glow / glassmorphism inside any SVG. Composition discipline is real.
- Hero-symbol caption convention consistent across all 7 (mono-caps single-line caption per symbol).
- All 7 hero-symbol SVGs are abstract (no embedded counts) — auto-survive count bumps.

## Next actions for the user

Triage the 3 P0s; they are all WCAG-floor accessibility issues, not aesthetic preferences. Recommended sequence:

1. Fix P0-1 (strata aria-labelledby) and P0-2 (bento double-narration + title trim) — both pure markup additions, ~20 lines total.
2. Fix P0-3 (bento label legibility) — requires layout adjustment; budget more time.
3. Re-run `Skill(design-ui)` with intent `polish site-src/index.njk` to drive the audit→polish loop on P1s (max 3 iterations per orchestration cap).
4. P2 items are deferrable.

OR, accept the P1/P2 findings as known debt and ship; the P0s are a separate decision the user makes.
