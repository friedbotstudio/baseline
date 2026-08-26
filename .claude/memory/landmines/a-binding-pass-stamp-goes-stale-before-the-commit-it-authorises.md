---
key: a-binding-pass-stamp-goes-stale-before-the-commit-it-authorises
category: landmines
scope: [integrate, tdd]
governs: .claude/state/last_test_result, .claude/skills/integrate/SKILL.md, .claude/skills/memory-sync/SKILL.md, tests/control-bytes.test.mjs
load_bearing: true
source: incident
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- **Trap: `PASS` in `.claude/state/last_test_result` is evidence about the tree at stamp time, not about the commit it authorises.** Two phases run after `/integrate` stamps, and both can change what the suite would say. The gap is structural, not a slip, so no amount of care at integrate closes it.
- **CONFIRMED WITH A CASUALTY, 2026-08-17.** `309d70e` landed with two red unit tests under a `PASS` stamp, and the suite stayed red for two commits until the next workflow's `/verify` found it. It is the second such casualty; the first was `79e41cb` (2026-08-13, see [[baseline-self-dev-verify-audit-not-unit-suite]]) — but that one is *not* the same mechanism, and reading it as a recurrence of the audit-only-`test.cmd` bug sends you to a trap that has since been fixed.

**Door 1 — a `git ls-files` gate cannot see an untracked file.**

`tests/control-bytes.test.mjs` enumerates via `git ls-files`, so it only inspects **tracked** files. `tests/epic-heading-grammar.test.mjs` was **created** in `309d70e` (`git log --diff-filter=A` confirms), so at every verify during that workflow the file did not exist to the gate. It carried 13 raw NUL bytes the whole time. The gate went from blind to red at the instant `git add` made the file tracked — after the last stamp, during the commit it was supposed to guard. Any `git ls-files`-driven check has this shape: **its write and its detection are one commit apart at minimum** for a new file.

**Door 2 — `/memory-sync` (Phase 10.7) writes after `/integrate` (Phase 9) stamps.**

The DAG is `integrate → document → archive → roadmap-sync → memory-sync → grant-commit → commit`, so canonical memory entries land *after* the binding verdict. `309d70e` filed `a-global-regex-with-test-fails-open-on-alternate-calls` with a `.claude/hooks/**` glob, which moved two `PATH_LEG_BASELINE` census literals in `tests/memory-scope-store-invariants.test.mjs` by one each. `surfaceGovernedMemory` reads the filesystem, not the index, so the census moved the moment the shard hit disk — after the verdict, before the commit.

- **Detection is asymmetric and that is why it persists.** Only the NEXT workflow sees it. Both casualties were found by a later cycle running verify, in a workflow with nothing to do with the write. The producing workflow ends fully green on every surface it can observe.
- **Do not trust a green history when routing new work.** `/standup` reads tags and refs and never runs the suite; `/triage` reads neither. A recommendation to push or to open a batch can therefore rest on a tree that has been red since the last commit — on `release_trigger: on-push` with `release_cycle: continuous` that publishes a release from a red tree. Run the binding command before believing a green-looking history.
- **Mitigation until the ordering is fixed:** re-run the binding command at gate C, after `/memory-sync` has written and with the intended paths staged, and treat the pre-`memory-sync` stamp as provisional. For a workflow that ADDS a file to a `git ls-files`-driven gate's scope, stage it first and re-run.
- **Shape of the real fix (not applied here — retro proposes, the user amends):** make `/commit` refuse a `last_test_result` whose mtime predates the newest write in the staged set, which closes both doors with one predicate.
- Related: [[a-raw-control-byte-separator-makes-a-source-file-binary-to-git]] (door 1's casualty), [[a-wide-governs-glob-ripples-into-unrelated-literals]] (door 2's mechanism), [[baseline-self-dev-verify-audit-not-unit-suite]] (the earlier, now-fixed door).
