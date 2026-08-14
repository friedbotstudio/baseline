---
key: audit-commands-count-regex-requires-the-literal-word-commands
category: conventions
scope: [document, tdd, integrate]
source: inferred-from-code
verified-at: 8201af6
last-touched: 2026-08-14
---

- **The `CLAUDE.md` quick-orientation line must keep the literal word `commands` inside its count parenthesis.** `.claude/skills/audit-baseline/checks/derived-count-surfaces.mjs:8` matches `/\.claude\/commands\/[^(]*\((\d+)\s+commands?\)/i` against both `CLAUDE.md` and `src/CLAUDE.template.md`.
- **Why this bites specifically.** `.claude/commands/` (6 commands)` reads as redundant, so it is the first thing an author reaches for when trimming the orientation line to fit the byte ceiling. Compressing it to `(6)` saves exactly 9 bytes and fails the audit with `commands count (CLAUDE.md orientation)`.
- The same file also pins the skills byCategory sum, so the skills breakdown is not a safe trim target either.
- **Trim redundant prose elsewhere instead.** The precedent (2026-08-07, `ship-baseline-output-style`) removed `docs/init/seed.md` from Appendix A's parenthetical, which the very next line already names as `(genesis)` — 22 bytes, no information lost.
- Pairs with [[claude-md-real-headroom-is-test-enforced-below-the-40000-cap]]: that entry says you must trim; this one says where you cannot.
