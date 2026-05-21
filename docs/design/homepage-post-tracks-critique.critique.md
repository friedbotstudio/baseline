# UX critique — homepage post-tracks

Diagnostic critique of `site-src/index.njk` at the rendered state on `http://localhost:4321/` after the workflow-extension-via-workflows-json changes. Read-only.

## Heuristic scores

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 9/10 | H1 reads first; eyebrow → H1 → lead → install pill → meta-strip is the natural reading order. Section eyebrow numerals (§I, §II...) anchor sections without competing with body. Concept-card num + h3 + body order scans cleanly. The accent period after "Code" sits as a sentence terminator with mild visual emphasis. |
| Scannability | 9/10 | A senior engineer in 30-second mode can answer: (a) what does this install — answered by the meta-strip + the inventory link "browse the 38 skills"; (b) what is the enforcement — answered by Concept 02 "22 hooks at every boundary" and §II's hook-boundary diagram; (c) how do I install it — answered by the install pill and §V. The bento in §III is dense but the eyebrow "How it flows" + figcaption pre-frame it. |
| Restraint | 9/10 | Orange accent occurs in: eyebrow text, the `.accent` H1 period, `.tok-kw` in code, focus rings, hover states, pair-tag-accent on the ship pair, the runtime-gate rule, gate annotations. Visually scanning the screenshot, accent surface ratio reads at roughly 5–8% of pixels — comfortably inside the ≤10% rule for Restrained strategy. The page chooses Restrained correctly: it's a documentation/governance surface, not a campaign. |
| Register fit | 9/10 | Brand register, but a quiet-brand variant tuned to a developer audience that distrusts marketing register. The voice is plain, factual, technical. No "transform your workflow" phrases. No "unlock," no "leverage," no "harness" (verb). PRODUCT.md's anti-references stay off the page. |
| Information density | 8/10 | Concept 01 (CONSTITUTION) is compact, Concept 03 (WORKFLOW TRACKS) is dense. The density gradient is intentional and reflects real complexity, but a fresh reader sees three cards of visibly unequal heights and could read that as "the third thing is the important one." The chip strip earns its keep by making the four canonical track names scannable, which justifies the extra height. Borderline acceptable. |
| Anti-pattern check | 9/10 | Zero em-dashes in user-facing rendered HTML (curl + grep returns 0; the one `--` hit is the `--merge` CLI flag, legitimate). No gradient text. No glassmorphism. No identical card grids (cards now content-sized after the spacing fix). No modal-first thinking. No side-stripe borders. The meta-strip APPROACHES the hero-metric template (big numbers + small labels + supporting stats below the lede), but evades it: six tiles in plain ink with no gradient accent, sitting BELOW the lead rather than substituting for it. |
| AI-slop test | 9/10 | The page does not read as AI-generated. Specific human-tells: idiosyncratic section numerals (§I, §II…) used as eyebrows; the bento's deliberate asymmetry (left-dominant `spec`, tall-right `tdd`); the "PAIRED · CLEANUP" / "SHIP PAIR" labels marking a genuine grouping that an algorithm wouldn't invent; the runtime-gate placement BELOW the bento with a separate rule. The strata figure's four numbered forms (filled / stroke / dotted / line) read as a hand-composed visual hierarchy, not stock. |

## Findings

| Severity | Surface | Issue | Evidence |
|---|---|---|---|
| P2 | Meta-strip | Visually approaches the SaaS hero-metric template (six big numbers + caps labels under the lede). | The page evades the anti-pattern by holding restraint: no gradient, no decorative chrome, no isolated-hero-stat composition. The cluster sits as a TRUST SIGNAL row anchoring the lede, not as the lede's centerpiece. The new Tracks tile doesn't make this worse; it's the sixth member of an already-disciplined row. No action required, just naming the dimension that's being walked. |
| P2 | Concept 03 vs 01 | Visible height gradient across the three cards is now intentional but reads as "the third one is the most important," not "the third one is the most complex." | The chip strip earns its presence; the longer body is the cost of explaining a new abstraction. If the gradient becomes noisy in future revisions, consider either: (a) leveling concept 01 + 02 by adding one more example sentence; or (b) accepting the gradient as a load-bearing tell that workflows.jsonl is the page's new center of gravity. The latter feels more honest. |
| P2 | Bento SELECTOR annotation | The SELECTOR tag pairs visually with the "06" ord (same x-anchor, 20 px below). A first-time reader may not immediately connect "SELECTOR" to the implementation node alternates without reading the figcaption. | The figcaption explicitly says "phase 6's selector node: swarm sub-track or solo TDD" in the desc, and "implementation (selector node: swarm sub-track or solo TDD)" in the title. Information is recoverable, just not at-a-glance. Acceptable for a documentation site where readers are expected to read the figcaption. |
| — | All other surfaces | No findings. | — |

## Specific surface notes

### Hero

H1 "A discipline layer / for Claude Code." reads naturally. The line break sits comfortably between "layer" and "for" (the natural prepositional pause). The accent period after "Code" reads as intentional emphasis on the full product name. The page title in the browser tab matches the H1 verbatim, which closes a tiny loop for a reader who arrives from search.

Eyebrow above the H1 ("Claude Code · constitutional baseline") establishes the product before the H1. Then the H1 names the discipline-layer framing. Then the lead grounds it in the structural counts. The reading order is right.

The dev-console wobble-frame on the right is a strong visual element. Its tilt feels like a deliberate brand moment, not decoration. The single command in the install pill is the lowest-friction surface on the page.

### Meta-strip

6 tiles read as a clean row at desktop width (1400 px). Per-tile width is preserved at 132 px after the rule update. "SUBAGENT" is the longest label at 8 characters mono, fitting comfortably inside the 132 px tile. "TRACKS" (6 chars) is the new addition and the shortest of the longer labels; it doesn't crowd its neighbors.

Mobile fallback (3+3 layout under 720 px) is a strict improvement over the prior 3+2 asymmetric row. The leading column now lands at items 1 and 4, symmetric.

### §I Concept cards

After the spacing fix, the three cards sit at natural heights with hairline dividers. The strata figure on the left fills the full column independently. The two columns share the section padding but otherwise don't synchronize heights — the section ends at whichever is taller (right column wins because of Concept 03). That's fine; the strata caption holds its own column.

The 32 px internal padding reads right at the new compact card-01 height. The padding is a constant; it's the available content that varies.

### §I.03 chip strip

The chip strip lands inside the concept block as an extension of the body paragraph, not as a separate figure. The 16 px margin-top is the right beat: enough to disambiguate from the closing period of the paragraph, not so much that it floats. The chip vocabulary mirrors the bento's `.chain-chip` (cream surface, hairline border, mono label, 4 px radius), creating an inter-section consistency the reader may register subconsciously.

Wrap behavior at narrow widths: `flex-wrap: wrap` handles overflow cleanly without breaking the visual register.

### §III bento + SELECTOR annotation

The SELECTOR annotation in the TDD cell pairs with the "06" ord at the same x-anchor (952, right-anchored), 20 px below. The two read together as "node 6 is a selector." The visual treatment (8.5 px mono caps, faint fill) is identical to the OPTIONAL tag on the security cell — same vocabulary, same role.

The bento title and desc (updated in this workflow) now reference "intake-full track" instead of "eleven-phase workflow," which closes the loop with the new abstraction. The figcaption mentions the three other tracks (`spec-entry`, `tdd-quickfix`, `chore`) so the reader leaves the diagram aware that the bento depicts ONE of FOUR tracks.

### §VI FAQ (new entry)

The new entry "Can I declare my own workflow track?" sits sixth in the FAQ list, after "Will my existing .claude/ customizations survive an upgrade?" and "Does the baseline ship its own Claude Code?" Position is appropriate: it's an extension-mechanism question that comes after the user has internalized what ships and how upgrades work.

The answer's information density is high (mentions tier-classification, Article IV invariants, `/init-project doctor`, schema validation) but every fact ties to a question a senior engineer would actually ask: "what if I want to add my own thing? does it survive an upgrade? what stops me from breaking it?" The density matches the target audience's tolerance.

### Install snippet

The code comment now reads "# open in Claude Code, then:" (was lowercase "claude code"). The capitalization is consistent with how the product is named elsewhere on the page. The shell prompt + npx command + comment + slash-command pattern is a single tight block that scans in one beat.

## Anti-pattern check

- **Em-dashes in user-facing copy**: 0 hits (curl + grep on rendered HTML returns 0). The `--merge` flag in FAQ #5 is a CLI flag, not an em-dash substitute.
- **Gradient text**: absent.
- **Glassmorphism**: absent.
- **Hero-metric template**: borderline present in the meta-strip but evades the anti-pattern through restraint (no gradient, six tiles not one hero metric, sits below the lede as trust signal not centerpiece).
- **Identical card grids**: absent. The three concept cards differ in height by content; the meta-strip is one row of 5+1 tiles, not a grid.
- **Side-stripe borders**: absent.
- **Modal-first**: absent.
- **AI-slop tells**: none of the high-frequency tells (vague attributions, inflated symbolism, rule-of-three cadence, "leverage / unleash / harness," superficial -ing analyses) appear in the rendered copy. The page reads as written by someone who knows the codebase.

## Summary

```
P0: 0
P1: 0
P2: 3
```

**Overall: SHIP.**

The three P2 findings are dimensional observations (where the page is walking close to a known anti-pattern, or where the content density gradient is a deliberate but readable choice). None require action. The preservation rule that bound the prior craft step held; the additive composition elements integrated into the existing voice without breaking it.

The strongest signal: zero P0, zero P1, and a clean anti-pattern table. The page survives the AI-slop test, holds register, and reads as a single hand-composed document. Ready for archive + commit.
