---
key: memory-stop-extractor-recursive-noise-loop-on-the-fix-is-prose
category: landmines
scope: [memory-sync]
verified-at: 3160e0c
last-touched: 2026-07-12
---

- Path: `.claude/hooks/memory_stop.mjs` (the auto-extractor) → `.claude/memory/_pending.md` → `/memory-sync` Step 2.
- Trap: the extractor fires on the **literal phrase** "the fix is…" (and similar report-shaped prose) anywhere in a turn, with no check for whether the text is a real deferral. Two compounding failure modes: (1) it quotes **CLAUDE.md's own integrate decision tree** ("The fix is mechanical (implementation mismatch, edge case missed, off-by-one)") back as a user-sourced backlog candidate; (2) worse, it extracts **`/memory-sync`'s own report output** — so a flush that says "discarded 7 candidates that were memory_stop firing on 'the fix is…'" becomes next session's candidates. The system generates debt by describing the debt it generated.
- Evidence (2026-07-12, `unified-execution-roadmap` flush): of **16** carried-over candidates, **zero** were promotable. Eight were verbatim quotations of prior flush reports (`six-were-the-extractor-firing-on-the-literal-2f31`, `discarded-5-all-memory-stop-firing-on-the-0d9f`, `seven-are-the-same-the-fix-is-extractor-05a1`, `of-the-10-pending-one-is-a-duplicate-1ca0`, `discarded-9-…-94d5`, `but-two-of-those-are-real-and-i-445e`, and two more). The remainder were duplicates of entries already canonical (`-9f4f`, `-8b21`, `checker-fanout.mjs`, `actions/checkout@v6.0.3`).
- Mitigation (until the extractor is fixed): at Step 2, discard on sight any candidate whose `Intent:` is (a) a quotation of a prior `/memory-sync` report, (b) a quotation of CLAUDE.md / a SKILL.md contract, or (c) already a canonical entry's stable key. Do not re-promote; check `backlog.md` for the key first.
- The real fix (not yet done): the extractor needs a provenance filter — never extract from Claude's own report output, and never treat instructional text pasted into a user turn (skill bodies arrive that way) as `source: user-instruction`. This is direct, live evidence for [[memory-system-redesign-landmines-captured-but-not-honoured-at-decision-point-7f3a]] — the memory system's *capture* half is as broken as its *honour* half.

---
