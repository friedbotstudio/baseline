---
key: claude-md-headroom-target-28000-chars-5a04
category: decisions
scope: [chore, spec, document]
source: user-instruction
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 60c5aeb
last-touched: 2026-08-10
governs: CLAUDE.md, src/CLAUDE.template.md, docs/init/seed.md
owner: engineer
---

> Cut into binding rules to hit 28,000

- **The decision.** `CLAUDE.md` carries an advisory headroom target of **28,000 characters**, below the 40,000-char hard cap in Article I.6. The target is pinned by `tests/warm-context-diet.test.mjs` and recorded in `docs/init/seed.md` §14; the hard cap is unchanged.
- **Why a second, tighter number.** `CLAUDE.md` is loaded in full at every session start, so its size is charged against the context budget before the user types. At 38,998 chars it was 97.5% of its own cap and cost 15.4k tokens — a third of the entire warm baseline.
- **The engineer overrode the recommendation, and the verbatim is canonical.** I reported that principled relocation bottomed out at 31,580 chars, because everything left was binding rule text, and recommended amending the target to 32,000. The engineer chose to cut into the rules instead. That is the decision of record.
- **How it was executed, so a future edit does not misread it as licence.** Nothing was deleted. The 3,580 chars came from compressing rule text — dropping recoverable cross-references (helper-function names, file paths recoverable from the annex), rationale clauses attached to rules, and duplicated statements. Every `SHALL`, `SHALL NOT`, threshold, TTL and scope limit survived; an audit diffed all 28 modal clauses before and after.
- **Two things were genuinely lost**, both recoverable from the annex: helper-function names that told a reader where a rule is implemented (`validateNoveltyRecord`, `resolveSkipBrainstorm`, `canonicalSlug`), and the `(swarm worktrees exempt)` parenthetical in Article VII's topology rule.
- **Article VI ships byte-identical** and is pinned by sha256 `f0db0f6aa06360eb4b9914ef8f6f62955d2b8d02360b05222e8caff9b0b06a02` over the slice between the Article VI and VII headings. The non-negotiable engineering rules earn their warm cost because they are the rules most often violated when unseen.
