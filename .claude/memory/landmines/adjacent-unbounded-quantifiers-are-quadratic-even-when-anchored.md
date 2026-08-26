---
key: adjacent-unbounded-quantifiers-are-quadratic-even-when-anchored
category: landmines
scope: [implement, tdd, security]
governs: .claude/skills/**, .claude/hooks/**, src/**
verified-at: 7d7039c
last-touched: 2026-08-26
---

- Trap: two unbounded quantifiers over the same character class, separated only by an **optional** token, are `O(n²)`. `\s*[-*]?\s*` is the shape. When the optional token is absent (the common case), the two stars are mutually ambiguous: for each of the `n` split points the first star can take, the second star retries every remaining length. The engine does `sum(n-i)` work before failing.
- **The `^`-anchor mitigation does NOT cover this.** [[global-word-run-with-required-suffix-regex-is-quadratic-redos]] prescribes "line-scope + `^`-anchor" because that trap is quadratic by *restarting at the next position*. This one is quadratic at a **single** start position, so it survives the anchor untouched. The regex that shipped was already `^`-anchored with `/m` and still took 29.8 seconds. Two different mechanisms produce the same complexity; check for both.
- Measured 2026-08-13 in `.claude/skills/standup/gather.mjs` `labelledField`, same input, same engine: 2k spaces 8.6 ms, 8k 143 ms, 32k 2,563 ms, 100k **29,800 ms**. Ten times the input, a hundred times the work. The pattern it replaced had a single `\s*` and was flat at ~0.1-0.3 ms across the whole range, so the regression was introduced by widening the matcher, not inherited.
- Why it mattered more than a slow CLI: `collectPendingQuestions` runs inside `gatherSync`, which `.claude/hooks/lib/memory_session_start.mjs:272` calls on **every session start**. One malformed memory shard would have hung session start. Reachability is what turns a complexity defect into a denial of service; trace the callers before rating one.
- Fix: make the separator **mandatory** so the two runs can never both consume the same characters. `^\s*(?:[-*]\s*)?LABEL` binds the bullet and its trailing space into one optional unit, with `[-*]` compulsory inside it. Flat at every size, and it still accepts `- **Question.** x`, `- Question: x`, `Question: x`, `  - Question: x` and `* Question. x`.
- Reflex: when a regex has two quantifiers with anything optional between them, feed it 100k characters of the quantified class **with the terminator absent** before landing. The failing input is the one that never reaches the literal, not the one that matches.
- Guarded by `tests/standup-recap-single-pass.test.mjs` → `test_when_a_shard_line_is_mostly_whitespace_then_parsing_stays_linear`, which asserts a 2,000 ms ceiling on a 40,000-space shard and first asserts the shard still parses, so the bound is never measured against an empty result.
