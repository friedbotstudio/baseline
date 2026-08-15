---
key: the-epic-heading-grammar-has-three-independent-declarations
category: landmarks
load_bearing: true
scope: [scout, spec, implement, simplify]
governs: .claude/skills/roadmap/**, .claude/skills/roadmap-sync/**, .claude/skills/standup/**
verified-at: 18204a1
last-touched: 2026-08-15
---

- **Landmark.** The roadmap epic-heading grammar `## Epic N — Title  <emoji>  (tag)` is declared **three times**, module-private in each, with three different shapes:

| Site | Regex | Reads |
|---|---|---|
| `.claude/skills/roadmap/parse.mjs:28` | `EPIC_HEADING_RE = /^Epic\s+(\d+)\s+—\s+(.+)$/` | heading text, already stripped of `## ` |
| `.claude/skills/roadmap-sync/sync.mjs:14` | `EPIC_HEADING = /^## Epic (\d+) —/` | number only, for the flip path |
| `.claude/skills/roadmap-sync/append.mjs:10` | `EPIC_HEADING = /^## Epic (\d+) — (.*)$/` | number + title, for the append path |

- **Why it matters when you touch any of them.** They are not interchangeable. `parse.mjs` matches without the `## ` prefix; the other two require it. A "unify these" edit that picks one shape breaks whichever caller relied on the other.
- **The format is load-bearing for `standup/gather.mjs`**, which tallies heading emoji to answer "what shipped?". Exactly one `⬜/🟡/✅` per heading, and `statusFromHeadingEmoji` takes the **earliest** one on the line.
- **Hoisting is flagged, not done.** `/simplify` recorded it as an out-of-scope refactor for a follow-up spec (2026-08-15), and the security review notes that the `assertInert` title-forgery fix belongs at whichever site becomes canonical. Until that spec lands, a grammar change means **three** edits, and the third is easy to miss because `parse.mjs` sits in a different skill.
- Related: [[security-fixes-are-per-call-site-and-new-modules-inherit-none]] — the third copy is where the CWE-74 forgery landed.
