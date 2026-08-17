---
key: the-epic-heading-grammar-has-one-declaration-site
category: landmarks
load_bearing: true
scope: [scout, spec, implement, simplify]
governs: .claude/skills/lib/**, .claude/skills/roadmap/**, .claude/skills/roadmap-sync/**, .claude/skills/standup/**
verified-at: 19631b7
last-touched: 2026-08-17
---

- **Landmark.** The roadmap epic-heading grammar `## Epic N — Title  <emoji>  (tag)` is declared **once**, at `.claude/skills/lib/epic-heading.mjs`. Three modules import it: `roadmap/parse.mjs`, `roadmap-sync/sync.mjs`, `roadmap-sync/append.mjs`. A grammar change is now one edit, not three.
- **Supersedes the three-declaration landmark** (2026-08-17, workflow `unify-epic-heading-grammar`). That entry described the pre-hoist state and is deleted, not amended — its central claim inverted.
- **Two entry points, on purpose.** `matchEpicHeadingLine` requires the `## ` prefix; `matchEpicHeadingText` matches heading text a caller already stripped it from (`splitSections` strips it before `parse.mjs` ever sees the line). One entry point with an *optional* prefix would let a body line reading `Epic 3 — foo` match inside `sync.mjs`, which scans every line. Do not "simplify" the two into one.
- **The format stays load-bearing for `standup/gather.mjs`**, which tallies heading emoji to answer "what shipped?". Exactly one `⬜/🟡/✅` per heading, and `statusFromHeadingEmoji` takes the **earliest** one on the line.
- **One status vocabulary.** `Status.IN_PROGRESS` is `'in-progress'` (hyphen). The `recapStatus()` translation shim in `standup/gather.mjs` is deleted — both sides share one spelling. The `roadmap` CLI no longer accepts `--status in_progress`; it fails with a named usage error listing `done | in-progress | planned`. The `in_progress:` label at `roadmap/cli.mjs:67` is a hardcoded tally prefix over a camelCase count and is unrelated.
- **`parse.mjs:35` keeps a local `STATUS_BY_EMOJI`** bound to its own exported `Status` enum, deliberately not collapsed into the lib export. See [[the-epic-heading-lib-exports-two-constants-only-tests-read]].
- Related: [[security-fixes-are-per-call-site-and-new-modules-inherit-none]] — `assertInert` moved here with the grammar, so the CWE-74 guard now sits at the canonical site.
- Related: [[a-global-regex-with-test-fails-open-on-alternate-calls]] — why the shared emoji regex is non-global.
