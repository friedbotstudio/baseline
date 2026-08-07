---
key: claude-md-real-headroom-is-test-enforced-38800-not-the-40000-cap
category: landmines
scope: [spec, tdd, document, integrate]
source: inferred-from-code
verified-at: f0ecb03
last-touched: 2026-08-08
---

- **The 40,000-character cap in Article I.6 is NOT the budget you actually have.** Two tests enforce tighter ceilings: `tests/gitignore-governance-cascade.test.mjs:45` asserts `CLAUDE.md` length `<= 38800` **characters**, and `tests/code-browser-primary-navigation.test.mjs:39` asserts `<= 39000` **bytes** (`CLAUDE_TARGET_MAX`, kept there to preserve >= 1000 of hard-cap headroom).
- **How it bit.** `CLAUDE.md` sat at 38,754 chars, so `audit-baseline` reported 1,246 chars of headroom against the constitutional cap. The real slack was **46 characters**. A governance sweep that added ~960 chars of corrections passed the audit and blew both tests.
- **Note the unit mismatch:** one budget is characters, the other bytes, and the file is UTF-8. An em dash costs 1 char but 3 bytes, so a change can clear the char budget and fail the byte budget. Check both.
- **The sanctioned fix is to pay for the addition, not to raise the ceiling.** The `forbidden-git-ops-spellings` amendment is the precedent recorded in `tests/code-browser-primary-navigation.test.mjs:39`: it added a binding rule and did NOT raise the budget, relocating duplicated annex content per Art. I.6 instead. The 2026-07-26 sweep did the same and ended 15 chars **smaller** than it started while carrying eleven corrections and a new phase row.
- Before editing `CLAUDE.md`, read both test budgets, not the Article I.6 number.
- **RE-BIT 2026-08-06 (`hook-decision-path-drift`), with this entry already on disk.** An Article VIII + Article V rewording landed at 39,083 bytes and failed `code-browser-primary-navigation`; the workflow's own scenario asserted only the 40,000-*char* Article number and stayed green throughout, so the trap was invisible to the test written for that landing. Two lessons: (1) read this entry BEFORE the edit, not after the red — it was never consulted; (2) a scenario that encodes the constitutional cap rather than the test cap gives false assurance. Both edits were then trimmed BELOW their originals rather than raising any ceiling, per the sanctioned fix above; final 38,943 bytes / 38,716 chars.
- **DID NOT BITE 2026-08-08 (`system-spec-delta` slice F), and the mitigation is what stopped it.** The slice added Article IX clause 10 against 84 chars / 57 bytes of slack. `/triage` read this entry first and wrote both measurements into `workflow.json → budget_constraint` as a hard input, so `/implement` relocated the clause 3 + clause 5 narration to the annex BEFORE adding anything. Even so the byte ceiling still bound first, exactly as line 12 warns: after the relocation the clause fit chars with 9 to spare and **overran bytes by 18**. That was caught by measuring both immediately after the edit rather than by a red test, and paid for with clause 4's parenthetical. Final 38,766 chars / 38,993 bytes; neither ceiling literal touched. Lesson (1) above — read the entry BEFORE the edit — is now positively confirmed, not just retro-diagnosed.
- **7 bytes of slack remain.** The next `CLAUDE.md` amendment has effectively no room and must relocate before it adds a single sentence.
- Also verified 2026-08-06: `seed.md` §679 explicitly sanctions the tighter test ceilings — "the governance test suite MAY additionally enforce a tighter advisory headroom target below the hard cap" — so these budgets are by design and are not a candidate for relaxation.
