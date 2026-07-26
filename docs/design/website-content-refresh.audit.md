# Design audit: website-content-refresh

Recipe `delight -> audit`, register **brand**. Snapshot of the audit step; overwritten by the latest audit.

## Result

**P0: 0 · P1: 0.** No blocking or high findings.

| Check | Result |
|---|---|
| Every new symbol carries `role="img"`, `aria-labelledby`, and a `<title>` | 4 of 4 |
| Em dashes on the new surfaces (XI.1 ban) | 0 |
| Gradient text / `background-clip` introduced | 0 (the 2 stylesheet hits are a pre-existing solid-color plus-icon at 14x1.5px, untouched) |
| Side-stripe borders over 1px | 0 |
| Hardcoded colors in new symbols | 0, all `var(--token)` |
| `prefers-reduced-motion` guards | 14, intact |
| Site build | clean |
| `audit-baseline` | PASS, fails=0 |

## What the delight pass did

The four new pages were the only pages on the site without a hero symbol, which is what made them read as a different site rather than a quieter one. Each now has a bespoke inline SVG in the established convention: 360x360 viewBox, `hero-symbol-svg <name>-svg`, design tokens only, a mono caption line, and a leading comment naming the visual vocabulary.

Each symbol argues the page's central claim rather than decorating it:

- **governance** draws the precedence chain with two deliberately different arrows. Downward ink between the lower layers, where a conflict resolves automatically. Upward accent ending in a halt bar between genesis and constitution, where it does not.
- **velocity** shows two dashed, struck-through cleanup phases flanking a filled security review, fenced in accent brackets labelled "not in the skip set". The measure bar beneath shows test lines excluded from the count.
- **epics** shows one filled discovery block feeding three thin outline children, with the accent approval token beside it, since that token is what the read side actually checks.
- **mcp** puts three dashed servers with inbound arrows outside a solid accent install boundary, and the one bundled server filled and inside it, with no inbound arrow at all.

No CSS was added. The convention is inline-token styling (`org.njk` states this explicitly), so the laziness ladder stopped at reuse.

## Findings not acted on

Two observations that are real but outside this pass's scope, recorded rather than silently fixed.

**PRODUCT.md is stale.** It states "twenty-two write-boundary and lifecycle hooks, forty skills" against a disk reality of 26 and 52, and cites `CLAUDE.md Art. X.1` for the copy-register scope, which is now XI.1. It is a governance-adjacent document and was not in this workflow's diff.

**PRODUCT.md and the meta-strip decision disagree.** PRODUCT.md explicitly permits and encourages "a meta-strip of structural counts naming load-bearing components ... those are the spec, not the brag". The strip was changed this cycle from six count tiles to three claim-led tiles at the user's direction. The result is arguably a hybrid rather than a reversal, since each tile still carries a verifiable count as its label, but the tension is worth recording rather than assuming resolved.

**impeccable's own bans flag two site-wide conventions.** The skill bans "tiny uppercase tracked eyebrow above every section" and "numbered section markers as default scaffolding". This site uses an `.eyebrow` on every docs page and hand-typed `§ I / § II` numerals on every section of all 19 pages. These read as a deliberate, consistently applied brand system rather than reflex scaffolding, and changing them would be a full-site redesign well outside a delight pass. Flagged for a human call, not acted on.

---

## Animate pass

One addition, deliberately. The `governance` symbol is the only one of the four whose order carries meaning, so it gets the narrative stagger already used by the landing's strata figure: genesis, then constitution, then annex, then implementation. The other three keep the shared `docs-hero-symbol` entrance.

Applying the same bespoke stagger to all four would have been the reflex tell that impeccable's motion guidance names, rather than motion that fits what it reveals.

Correctly nested: inside `@supports (animation-timeline: view())` so browsers without support render the final state, and inside `@media (prefers-reduced-motion: no-preference)`. The global reduced-motion override at the end of the stylesheet still wins regardless.

## Optimize pass

The honest result is that there was very little to fix.

| Checked | Finding |
|---|---|
| Render path | Already good: preconnect to both font hosts, one stylesheet, `site.js` deferred |
| Layout-property animations | 0 |
| `will-change` overuse | 2 declarations, appropriate |
| Images | 1 on the entire site, already `loading="lazy"` and `decoding="async"` |
| Dead CSS from this workflow's removals | fully cleaned: `is-feed`, `increments-svg`, `recent-teaser` all at 0 references |
| Page weight | new pages 17 to 20 KB; landing 51 KB, driven by its two large inline SVGs |

**The one real cost is the font request:** three families across eight weights from Google Fonts, which is the site's only render-blocking third-party dependency. Reducing it is an aesthetic decision about the type system rather than a performance fix, so it is flagged rather than changed.

**Dead CSS was NOT removed, deliberately.** Eight rules appear unreferenced, but the mechanical check that produced that list returned a provable false negative (it reported `.track-chip-soon` as dead while two pages use it and it renders in the built HTML). Acting on a list that is known to be wrong in at least one row risks deleting a live rule to save a few hundred bytes. Dead-rule removal is a `simplify` concern with a proper diff to review, not an optimize-pass drive-by.
