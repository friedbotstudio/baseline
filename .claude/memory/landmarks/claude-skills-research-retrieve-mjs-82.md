---
key: .claude/skills/research/retrieve.mjs:82
category: landmarks
scope: [scout]
---

- Role: Foundation — deterministic, stdlib-only prior-art retriever backing `/research` Step 0 (retrieve-before-derive). `retrieve({root, slug, terms})` scans the local decision corpus — archived `research.md` + `spec.md` under `docs/archive/**`, plus `.claude/memory/decisions.md` and `libraries.md` — and returns ranked `hits` (`path`, `score`, `matchedTerms`, `excerpt`) so research reuses what was already reasoned instead of re-deriving it. Ranking is a pure function of (corpus, terms); every hit is inspectable via `matchedTerms`. No third-party dependency (U6).
- Companion: `.claude/skills/research/SKILL.md:31` (Step 0 invokes the CLI; `## Prior art (retrieved)` section at :50 is where hits get cited). Shipped as `.mjs` per the shipped-helper rule (no new Python under `.claude/skills/`).
- Verified-at: b6fba83
- Last-touched: 2026-07-12
- Caveat: fail-open by construction — every filesystem read is try/caught to null, an unreadable/missing corpus path is skipped, and `main()` swallows any throw and prints an empty `{terms, corpusScanned, hits}`. So an empty result means "no hits OR the corpus was unreachable"; it never distinguishes the two and never fails the research phase. Matching is naive substring containment on lowercased content (not stemmed, not tokenized), so terms shorter than ~4 chars over-match.
