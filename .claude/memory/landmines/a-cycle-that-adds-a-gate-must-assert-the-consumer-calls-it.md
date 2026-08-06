---
key: a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it
category: landmines
scope: [tdd, integrate, document]
governs: .claude/skills/**,tests/**
load_bearing: true
verified-at: 571b6a3
last-touched: 2026-08-06
---

- **The trap.** A gate, flag, or module can be fully built, fully tested, and called by nothing. Its unit tests pass because they exercise the thing directly. `drift_check` reports CLEAN because the AC tokens appear in the diff. Nothing in the machine review notices that no consumer invokes it.
- **Four instances in one session (2026-08-04), same shape every time:**
  1. `document-gate.mjs` shipped with only the reading half — no `receipts.mjs` producer, so the gate could only ever BLOCK.
  2. `reconcile.mjs` and `placement.mjs` shipped with no caller — `scout/SKILL.md` and `code-structure/SKILL.md` never invoked them.
  3. `flags.mjs` shipped with no consumer — `workspaceEnabled`/`annotationsEnabled` were read by nothing, so AC-003/AC-004 were unsatisfied while their reader tests were green.
  4. `seed-elements.mjs` exported `SEED_OPS` that were applied only to test temp dirs — the LIVE corpus was never written, so the feature stayed dormant for a second consecutive cycle.
- Instance 4 is the sharpest: the data existed, the machinery existed, 15 tests passed, and `.claude/memory/workspace/` did not exist. The rollout step that applies the seed had simply never been executed, and every oracle said CLEAN.
- **Instance 4 DISCHARGED 2026-08-06** (`workspace-corpus-backfill`). The live corpus is now written — 112 elements, 15 concepts, 112 shards, 0 dangling — and `seed-elements.mjs` was deleted as dead code, superseded by the authored map in `seed-map.mjs`. The same cycle found instance 5 of the identical pattern one layer down: `reconcile.mjs`'s `stale` branch guarded on `element.anchor_digest &&`, and nothing in production ever wrote that field, so the branch was unreachable for all 14 elements while `tests/workspace-staleness.test.mjs` passed 8/8 by hand-writing the digest into its fixtures. **A test that supplies the missing input itself proves the branch computes, never that anything reaches it.** The lesson stands unchanged; only this instance is closed.
- **Practical rule.** When a cycle adds a gate, a flag, or a store, write a test that asserts the CONSUMER reaches for it — grep the consumer for the call, and assert ordering when order matters (the flag check must precede the call it gates). Then prove the test has teeth by mutating the producer and confirming it goes red. A test that only proves the gate computes the right answer proves nothing about whether the gate runs.
- **For a rollout step, assert the end state on the live tree, not in a temp dir.** `applyContribution` against `mkdtemp` proves the function works; it says nothing about whether the repository was actually seeded. The check is `readAll('.claude/memory').elements.length > 0`, run against the real store.
- Companion oracles that will NOT catch this: [[drift-check-resolves-acs-by-literal-mention-not-implementation]], [[reader-level-grades-rendered-html-so-markdown-passes-vacuously]], and `document-gate`'s git-diff derivation (blind to untracked files, and page-granular so a behaviour change with no page change reads CLEAN).
