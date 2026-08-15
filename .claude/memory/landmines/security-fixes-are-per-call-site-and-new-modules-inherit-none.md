---
key: security-fixes-are-per-call-site-and-new-modules-inherit-none
category: landmines
load_bearing: true
scope: [security, integrate, tdd]
governs: .claude/skills/memory-index/**,.claude/skills/workspace/**,.claude/skills/memory-sync/**,.claude/skills/roadmap-sync/**
verified-at: 18204a1
last-touched: 2026-08-15
---

- **The trap.** Every frontmatter/fact writer in this repo validates its own inputs at its own call site. There is no shared guarded writer. So a module written next week starts from zero and reproduces whichever hole its author did not happen to remember.
- **Four instances across two cycles, same class.** F-3 (ledger row injection via unescaped key) and F-5 (unbounded key interpolating into frontmatter) were fixed 2026-08-04 in `ledger.mjs` and `constraints.mjs`. Days later the SAME cycle's new modules shipped F-1 (`placement.mjs` interpolating an unvalidated key into a path — arbitrary out-of-directory write) and F-2 (`store.mjs` interpolating unvalidated field values — forged `load_bearing: true`). Probing then found F-2 **also live in the already-fixed `writeConstraint`**, via `state_verified_at` and `governs`.
- The tell is that `writeElement` got it right (`assertSafeFactKey` before `join`) while `stampMarker` beside it simply omitted the same call. Nothing structural made the second one wrong; nothing structural made the first one right either.
- **Practical rule.** When you add ANY module that writes a fact file, shard, or frontmatter, grep for `assertSafeFactKey` and `assertSafeFieldValue` and apply both before you write the first line — key before path construction, values and field NAMES before rendering. Do not assume the helper you are copying from is already hardened; `writeConstraint` was the hardened one and was still holed.
- **Fifth instance, 2026-08-15, a NEW output grammar rather than frontmatter.** `roadmap-sync/append.mjs → renderEpicSection` interpolated an epic title and every slice title straight into the roadmap's `## Epic N — Title  <emoji>  (tag)` line. A title carrying `✅` forged a shipped status (`statusFromHeadingEmoji` takes the EARLIEST emoji, so the title beats the real marker), and a title carrying a newline forged a whole extra heading and degraded the adjacent real one to `status=unknown, tag=null`. Fixed by `assertInert` (append.mjs:21, called at :59, :60, :65) rejecting both classes. Same lesson, one axis over: the class is not "frontmatter writers", it is **any writer emitting a grammar a parser later trusts**. A roadmap line is as forgeable as a YAML key.
- **Do not "fix" this by normalizing.** `canonicalSlug` in `common.mjs` is a NORMALIZER, not a validator; using it here MASKS a traversal by silently writing to a different path. REJECT, never repair.
- The shared writer that would end this class is real but non-trivial: the seven writers span three different operations (render new shard / patch existing frontmatter / write flat canonical file), so one API either grows modes or covers a subset and creates false confidence. It needs its own spec. Backlog.
