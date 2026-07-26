---
key: claude-md-real-headroom-is-test-enforced-38800-not-the-40000-cap
category: landmines
scope: [spec, tdd, document, integrate]
source: inferred-from-code
verified-at: e98b712
last-touched: 2026-07-26
---

- **The 40,000-character cap in Article I.6 is NOT the budget you actually have.** Two tests enforce tighter ceilings: `tests/gitignore-governance-cascade.test.mjs:45` asserts `CLAUDE.md` length `<= 38800` **characters**, and `tests/code-browser-primary-navigation.test.mjs:39` asserts `<= 39000` **bytes** (`CLAUDE_TARGET_MAX`, kept there to preserve >= 1000 of hard-cap headroom).
- **How it bit.** `CLAUDE.md` sat at 38,754 chars, so `audit-baseline` reported 1,246 chars of headroom against the constitutional cap. The real slack was **46 characters**. A governance sweep that added ~960 chars of corrections passed the audit and blew both tests.
- **Note the unit mismatch:** one budget is characters, the other bytes, and the file is UTF-8. An em dash costs 1 char but 3 bytes, so a change can clear the char budget and fail the byte budget. Check both.
- **The sanctioned fix is to pay for the addition, not to raise the ceiling.** The `forbidden-git-ops-spellings` amendment is the precedent recorded in `tests/code-browser-primary-navigation.test.mjs:39`: it added a binding rule and did NOT raise the budget, relocating duplicated annex content per Art. I.6 instead. The 2026-07-26 sweep did the same and ended 15 chars **smaller** than it started while carrying eleven corrections and a new phase row.
- Before editing `CLAUDE.md`, read both test budgets, not the Article I.6 number.
