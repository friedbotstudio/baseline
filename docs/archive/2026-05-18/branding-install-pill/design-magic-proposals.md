# Magic proposals — Homepage hero

Five candidate moves to distinguish the homepage hero without breaking the restrained register. Each is information-carrying or delight-carrying, motion-budget-conscious, and Article-X.1-clean. Output is proposals; user picks; main-context implements.

Surface stack (post-iteration):

```
eyebrow      "Claude Code · constitutional baseline"
H1           "A discipline layer for Claude." (accent on the period)
.lead        long descriptive paragraph (~3 sentences)
.hero-install  the dark compact install pill (with copy → check)
.hero-readmore  "or read the docs →" (mono, muted)
.meta-strip  five stats: Hooks 22 / Skills 37 / Subagent 1 / Phases 11 / Gates 4
```

The right column is the wobble-framed dev-console streaming a Claude session. That's the dynamic showpiece; we don't touch it.

---

## Proposal A — Pill blinking caret *(P1 — ship-one verdict)*

**Essence**: a slowly-blinking caret immediately after the install command inside the pill, mirroring the `.cli-strip` caret pattern at `site.css:1592-1599`. Signals "this is a live shell, ready to receive."

**Visual**:

```
┌──────────────────────────────────────────────────┐
│ $  npx @friedbotstudio/create-baseline@latest . ▎ ⧉ │
└──────────────────────────────────────────────────┘
                                                 ^   ^
                                            new caret  existing copy icon
                                            (blinks slowly)
```

**Why the audience benefits**: terminal authenticity is the brand's strongest currency with tool-chain-literate engineers. A static command is "a string"; a blinking caret says "this is a shell, this is what you're about to run." Tiny semantic upgrade.

**Trade-off / cost**: ~12 lines CSS + 1 new `<span class="ip-caret" aria-hidden="true"></span>` in `install-pill.njk`. Reuses the existing `dc-blink` keyframes (`site.css:1598`); reduced-motion path zeros the animation. The pill's `.is-copied` rule needs one extra line to hide the caret during the success-state icon swap (so the check doesn't compete with the caret).

**Touches**: `site-src/_includes/install-pill.njk` (1 line), `site-src/assets/site.css` (~12 lines under the `.install-pill` block).

**Risk**: low. Pattern is borrowed verbatim from `.cli-strip`; consistency strengthens.

**Information value**: zero. **Delight value**: medium. Ties the two terminal-styled components together visually with negligible cost.

---

## Proposal B — Version + license suffix under the pill *(P2)*

**Essence**: a single muted line directly below the pill stating the package version and license. Answers the evaluator question "what version am I about to install, and what license is it?"

**Visual**:

```
┌─────────────────────────────────────────────┐
│ $  npx @friedbotstudio/create-baseline@latest . ⧉ │
└─────────────────────────────────────────────┘
v0.3 · Apache 2.0 · open source
```

Mono, 11-12px, muted. Same family as the `.brand .sub` crumb in the header.

**Why the audience benefits**: closes the "is this real, what am I getting" loop in the 30-second scan. Today the pill says `@latest` — the visitor has to trust that's a fresh number. Surfacing the version makes it concrete. License hint reassures (Apache 2.0 means they can fork and use commercially without thinking about it).

**Trade-off / cost**: ~10 lines. Needs `site-src/_data/site.cjs` to grow a `license: 'Apache 2.0'` field; the line composes `v{{ site.versionMinor }} · {{ site.license }} · open source`. Adjacent to the pill, not inside it.

**Touches**: `site-src/_data/site.cjs` (1 line), `site-src/index.njk` (3 lines for the new element near the pill), `site-src/install.njk` (3 lines if we want the same line on the install page — recommended for consistency), `site-src/assets/site.css` (~6 lines).

**Risk**: low. Verify license is actually Apache 2.0 by checking `LICENSE` at repo root before the copy lands. If license is different, swap the string.

**Information value**: HIGH. **Delight value**: low. Pure information move.

---

## Proposal C — Lead clause emphasis *(P2)*

**Essence**: italicize the three load-bearing constitutional claims inside the lead paragraph so the evaluator's eye catches them on first scan.

**Visual** (italics shown with `*…*`):

> Constitutional governance, structural enforcement, and a workflow that runs from intake to commit. The baseline ships 22 hooks, 37 skills, and one subagent. *Every phase produces one artifact*, *every gate is user-typed*, and *Claude cannot self-approve*.

**Why the audience benefits**: the lead is the longest text in the hero (3 sentences, ~50 words). Without rhythm, an evaluator reads the first half and skims the rest. Italicizing the three claims that ARE the product's value proposition surfaces them on the first eye-pass — even when the visitor doesn't read prose linearly.

**Trade-off / cost**: 3 `<em>` tags in `index.njk:15`. One CSS rule `.lead em { font-style: italic; color: var(--ink); font-weight: 500; }` to keep weight clean (italic at default weight reads thin). ~6 lines total.

**Touches**: `site-src/index.njk` (1 line edit), `site-src/assets/site.css` (~3 lines).

**Risk**: low. Semantic emphasis tags are a11y-correct (screen readers can announce emphasis).

**Information value**: medium (existing info, faster to find). **Delight value**: low-medium (typographic confidence).

---

## Proposal D — Trust strip below the meta-strip *(P3)*

**Essence**: a small horizontal strip below `.meta-strip` showing license, last-published date, and a repo link with a tiny GitHub glyph. Closes the "is this active and credible" question for evaluators who don't scroll up to the header.

**Visual**:

```
[Hooks 22] [Skills 37] [Subagent 1] [Phases 11] [Gates 4]
─────────────────────────────────────────────────────────
Apache 2.0  ·  updated 2 days ago  ·  github.com/friedbotstudio/baseline  ↗
```

Same mono micro-type as the existing meta-strip labels. Below the rule that closes the meta-strip.

**Why the audience benefits**: the meta-strip says "what's in it"; the trust strip says "is it real". Together they answer the two questions an evaluator has before clicking the pill.

**Trade-off / cost**: ~25 lines. Needs a build-time computation for "last-updated" date (probably from package.json publish date or last commit date), a small element in `index.njk`, CSS. Some redundancy with the existing GitHub link in the header — but the header link is small and easy to miss; a dedicated strip is more deliberate.

**Touches**: `site-src/_data/site.cjs` or a new build-data file (5 lines), `site-src/index.njk` (5 lines), `site-src/assets/site.css` (~15 lines).

**Risk**: medium. Easy to drift into "OSS badge soup" if not careful — capping at three pieces of info (license, freshness, repo) keeps it from becoming a vanity gallery. Test it against the AI-slop reflex check before shipping.

**Information value**: HIGH. **Delight value**: low. Information move with credibility payoff.

---

## Proposal E — Animated meta-strip number entrance *(P3)*

**Essence**: when the meta-strip enters the viewport, the five numbers count up from 0 to their final value over ~500ms with ease-out-quart. After settling, they stay static. One-shot animation per page load.

**Visual**: imagine 0 → 22 over 500ms, eased; same for 37, 1, 11, 4. They land at their values and stop.

**Why the audience benefits**: marginal. The numbers are static facts; the animation just signals "this is alive". For tool-chain-literate engineers this risks reading as marketing-theatre; for the same audience, well-tuned motion can read as "they cared about the details."

**Trade-off / cost**: ~35-45 lines JS. IntersectionObserver, requestAnimationFrame, prefers-reduced-motion bypass that just sets final values immediately. Also need to handle the `Subagent: 1` case (counting 0 → 1 is almost no animation; should still trigger).

**Touches**: `site-src/assets/site.js` (new function), no markup changes if we read existing `.num` text contents.

**Risk**: medium-to-high in this register. Easy to overcook. The dev-console on the right is ALREADY the dynamic showpiece — adding another animation could compete or feel theatrical.

**Information value**: zero. **Delight value**: depends entirely on execution.

---

## Ranking

| # | Proposal | P | Cost | Info | Delight | Recommend |
|---|---|---|---|---|---|---|
| A | Pill blinking caret | P1 | ~12 LOC | — | medium | **Ship.** |
| B | Version + license suffix | P2 | ~10 LOC | HIGH | low | Ship if user wants the info move. |
| C | Lead clause emphasis | P2 | ~6 LOC | medium | low-medium | Ship — cheapest typographic upgrade. |
| D | Trust strip below meta | P3 | ~25 LOC | HIGH | low | Only if user has appetite for build-time data integration. |
| E | Meta-strip count-up | P3 | ~40 LOC | — | execution-dependent | Skip in this register; the dev-console is enough. |

## If you can ship only ONE: **A (pill blinking caret)**

The brand asset on the hero is the pill, and the pill is currently a static code block dressed up. A blinking caret says "this is a live shell." Cost is trivial, risk is near-zero (the `.cli-strip` already does it elsewhere on the page), the delight is exactly the kind PRODUCT.md asks for — visible without loud. It also restores some of the energy lost when we removed the primary CTA: the hero now reads as "here's the live command, copy it" instead of "here's some text in a box."

If you ship two, add **C (lead emphasis)** — same cost, different lane, no overlap.

If you ship three, add **B (version + license suffix)** — first information-carrying move.

Past that, you're polishing diminishing returns; let the section breathe.
