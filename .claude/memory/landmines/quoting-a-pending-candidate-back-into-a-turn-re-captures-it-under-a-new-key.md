---
key: quoting-a-pending-candidate-back-into-a-turn-re-captures-it-under-a-new-key
category: landmines
scope: []
governs: .claude/hooks/memory_stop.mjs, .claude/skills/memory-sync/ledger.mjs
load_bearing: true
source: incident
verified-at: c9b4bc6
last-touched: 2026-08-17
---

- **Trap: pasting a `## CANDIDATE:` block into a skill's ARGUMENTS re-feeds it to the extractor, which re-captures it under a DIFFERENT key — and a different key is a key the discard ledger cannot suppress.**
- **Observed twice in one session, 2026-08-17.** `/memory-sync` discarded `backlog → so-the-fix-is-not-to-delete-them-a4c5` and recorded that row in `_discard-ledger.md` (line 185). The very next turn, `_pending.md` carried `backlog → intent-so-the-fix-is-not-to-delete-d93d`: same sentence, new hash, new `intent-` prefix. The captured body read `- Intent: "So the fix is not to delete them."` — the **doubled `- Intent:` prefix** is the proof, because that is the literal `_pending.md` line quoted into the arguments, not the original prose.
- **Why the ledger does not save you.** `memory_stop` folds `decidedKeys()` into its dedup set by **exact string match** on the full `<key> → <target>` header. A re-extraction derives a fresh slug and a fresh 4-char hash from the quoted text, so the recorded row and the new candidate are different strings. The suppression mechanism is intact and simply does not apply.
- **The role flips too, which is worse than a duplicate.** The original was `role: assistant` / `source: assistant-deferral`. The re-capture is `role: user` / `source: user-instruction` — because skill ARGUMENTS render into a user-role turn. A curator reading the second candidate sees what looks like a direct user instruction, when the sentence was Claude's own. `user-instruction` also demands a `verbatim:` blockquote on promotion, so the shape invites promoting a fabricated user quote.
- **This is not the `ARGUMENTS:`-marker bug, and do not "fix" it there.** Content below the `ARGUMENTS:` marker is captured **on purpose** — that is the channel a genuine user deferral arrives through (`tests/memory-stop-capture-precision.test.mjs` pins `test_when_deferral_sits_below_arguments_marker_then_candidate_staged`). The defect is narrower: quoting *store content* into that channel launders it into fresh input.
- **Mitigation, and it is behavioural.** When a skill brief needs to talk about a pending candidate, **describe it — never paste the block**. Name the key and paraphrase the intent. If the literal text matters, say "the candidate whose intent line begins 'So the fix…'" rather than reproducing the `- Intent:` line.
- Related: [[a-wide-governs-glob-ripples-into-unrelated-literals]] (the other way a memory write reaches further than intended).
