---
key: claude-md-has-six-characters-of-headroom
category: landmines
scope: [spec, chore, document, integrate]
governs: CLAUDE.md,src/CLAUDE.template.md,tests/warm-context-diet.test.mjs
verified-at: 8fb72a5
last-touched: 2026-08-15
---

- Path: `CLAUDE.md` (+ byte-equal mirror `src/CLAUDE.template.md`), pinned by `tests/warm-context-diet.test.mjs:25` (`MAX_CLAUDE_MD_CHARS = 28000`, asserted at `:222`) and `:30` (`ARTICLE_VI_SHA256`, asserted at `:252-257`).
- Trap: **measured 2026-08-15, `CLAUDE.md` is 27,994 characters. Six characters of headroom.** Any plan that says "add an Article" or "add a sentence to Article IV" is already over budget before it is written. The cap is `.length` (characters), not bytes — `wc -c` reads 28,190 because of the em dashes, so a byte measurement looks like a failure that is not one and hides the real 6-char margin. Measure with `node -e "console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"`.
- Second trap, independent of the first: the **Article VI slice is sha256-pinned byte-identical** (`f0db0f6aa06360eb4b9914ef8f6f62955d2b8d02360b05222e8caff9b0b06a02`, the slice between the `## Article VI ` and `## Article VII` headings, 3,353 chars). The test's failure message is "Article VI changed — the non-negotiable engineering rules ship byte-identical". A new `VI.N` clause breaks the hash as well as the cap, so it is two deliberate acts, not one edit.
- **Raising the target is not available by default.** [[claude-md-headroom-target-28000-chars-5a04]] carries `source: user-instruction` and the engineer's verbatim *"Cut into binding rules to hit 28,000"*, recorded after declining the recommendation to amend the target to 32,000. Under Article IX.6 the verbatim is canonical; propose it, never assume it.
- Mitigation — the three real options, in the order they should be offered: (1) put the rule in `docs/init/seed.md` only and let a skill plus a helper enforce it, which is what [[context7-outcome-not-tool-mandate]] already did once under the same pressure when it landed `read-before-overwrite` in `conventions.md`; (2) add the clause and compress an equivalent number of characters elsewhere, updating the Article VI hash deliberately; (3) ask the engineer to raise the target. Exercised 2026-08-15 on `codebugger-explanation-trace`: option (1), recorded as spec §Decisions D1.
- Consequence worth stating when option (1) is taken: a rule outside `CLAUDE.md` is **not warm in session**, so the enforcement has to be structural — a scanner, a guard, or a helper — rather than a rule Claude has loaded. Article IV also then does not name the new track, and track routing lives in `triage/SKILL.md` + `workflows.jsonl` + `seed.md` §18.
