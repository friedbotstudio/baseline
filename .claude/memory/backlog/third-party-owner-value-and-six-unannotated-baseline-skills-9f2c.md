---
key: third-party-owner-value-and-six-unannotated-baseline-skills-9f2c
category: backlog
scope: [spec, tdd, document]
status: open
raised-on: 2026-08-06
raised-in-context: workspace-corpus-backfill (surfaced while scoping the architecture map's governed surface)
source: user-instruction
estimated-effort: medium (genesis amendment first, then a count cascade across 5 doc surfaces + manifest rebuild)
verified-at: 571b6a3
last-touched: 2026-08-06
caveat: do NOT reclassify vendored skills out of `owners.skills` without deciding what replaces their hash-drift protection. Today `audit-baseline` re-derives sha256 for every baseline-owned skill path; moving impeccable to a third class silently drops that check on exactly the code nobody reads closely.
---

> "impeccable is 3rd party.. and so are few others, can we add a `third-party` owner to them so that we can fix this issue.. else we will be managing data-structures that do not belong to our system.."

- Intent: `owner:` currently conflates two questions — *does the baseline ship this* and *did we author it*. `impeccable`, `copywriting`, `humanizer`, `documentation` and `technical-tutorials` all declare `owner: baseline` while carrying vendored LICENSE files, because seed.md §4.3 Step 5 deliberately counts them among the 56 as "shared globals" that "ship unchanged with their licenses intact". A third value would separate distribution from authorship.
- **The inverse bug is the more urgent half.** Six genuinely-baseline skills carry no `owner:` line at all: `workspace`, `memory-index`, `spec-shippability-review`, `cli-copy-review`, `lib`, `faithful-capture`. `workspace` is the architecture-map engine itself, so an ownership-based filter excludes the corpus from its own map — measured 2026-08-06 while trying exactly that.
- Why it is not a quick edit: `derive-counts.mjs:80` derives the baseline skill count FROM `owner: baseline` frontmatter. Annotating the six moves the derived total 56 → 62 and turns five currently-passing audit checks red (`skills byCategory sum vs derived total`, the `CLAUDE.md` / `README.md` / `docs/init/seed.md` count claims, and `docsite: skills/index.html lists every skill`). seed.md does not mention four of the six at all, so Article I.4 requires amending the genesis §4.3 enumeration and Step 5 breakdown FIRST, then CLAUDE.md ×3 plus its byte-equal template mirror, README ×2, CONSTITUTION Appendix B, the docs site and `_data/baseline.cjs`, then a manifest rebuild.
- Prior decision to respect: `docs/vision/living-system-model.md` Part 4 records that `faithful-capture` is deliberately user-owned and that "promotion to `owner: baseline` is a separate decision". At least one of the six is not a bug.
- Workaround shipped in the meantime: the architecture map defines its governed surface by explicit glob roots plus an `excludedTrees` list (`seed-map.mjs → GOVERNED_SURFACE`), not by ownership. That keeps third-party code out of the corpus without touching the constitution — 90 vendored files excluded, corpus 115 → 112 elements.
- Relates to [[workspace-corpus-coverage-is-total-over-an-explicitly-declared-surface-4b18]].
