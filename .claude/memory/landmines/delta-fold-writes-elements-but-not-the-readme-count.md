---
key: delta-fold-writes-elements-but-not-the-readme-count
category: landmines
scope: [archive, integrate]
governs: .claude/skills/workspace/delta.mjs,.claude/skills/workspace/readme-gate.mjs,docs/system/README.md,tests/system-spec-relocation.test.mjs
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- **The trap.** `/archive` Step 3 calls `verifyAndApplyDelta`, which writes the element record and its shard for every confirmed `add` row — and never touches the Count column in `docs/system/README.md`. `readme-gate.checkReadmeCounts` enforces that column. So the corpus moves to N+1 while the README still claims N, and the suite goes red at the END of a workflow that was green a minute earlier.
- **It fires on every `add` row, not occasionally.** Any workflow whose spec declares one confirmed `add` hits it. Measured 2026-08-08 on `skill-helper-cli-dispatchers`: one `add` row took the corpus to 115 elements / 115 diagrams against a README claiming 114 / 114, failing three tests.
- **Which three.** `workspace-readme-gate → test_when_live_readme_checked_then_counts_match_the_live_corpus`, plus `system-spec-relocation → test_when_corpus_relocated_then_docs_system_holds_every_record` and `→ test_when_readers_repointed_then_readall_resolves_at_new_path`.
- **The second copy is the worse half.** `tests/system-spec-relocation.test.mjs` hardcodes the census in THREE places (`assert.equal(elements, 115, ...)` and friends). That duplicates `readme-gate`'s job without its sync mechanism, so it breaks on every legitimate corpus growth and has to be hand-bumped each time. Its real invariant — the corpus lives at `docs/system/` and every element keeps exactly one shard — is already carried by its own `assert.equal(elements, diagrams)` line. Replace the absolute literals with the relational assertion and the recurring bump disappears.
- **The correct fix.** Have `verifyAndApplyDelta` update the Count column as part of applying a row; it is the same write, and the gate exists precisely to keep the number true. Until then, `/archive` must bump the README by hand after a confirmed `add`, which is Step 3 completing its own write rather than a Step 5.5 repair.
- **Do not "fix" this by relaxing readme-gate.** The gate is what makes the count a fact instead of a claim. Same reasoning as [[path-leg-baseline-drifted-at-b164ae7]]: a quiet census is worse than a loud one.
