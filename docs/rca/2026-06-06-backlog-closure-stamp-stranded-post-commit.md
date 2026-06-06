# RCA: Backlog closure stamp stranded uncommitted after `/commit`

<!--
Root Cause Analysis. Produced by the `rca` skill.
Blameless by convention: describe systems and processes, not individuals.
-->

## Summary

When the `mutation-testing-oracle` workflow committed its feature (`6c85282`, 2026-06-06), `/commit` Step 6 stamped the source backlog entry `mutation-testing-oracle-for-tdd-checker-f029` to `status: picked-up` + `superseded-at: 2026-06-05` — but it did so **after** the commit landed and never committed the result, so the closure stamp (plus a hand-added `SHIPPED … (commit 6c85282)` note) has sat uncommitted in the working tree across a `/clear` and into the next session. As of writing it is unresolved: the stamp is still dangling in `.claude/memory/backlog.md`.

## Timeline

Wall-clock in IST (+0530), the committer's timezone. UTC noted where the date differs.

- `2026-06-06 ~02:5x IST` — `mutation-testing-oracle` workflow runs `/memory-flush` (Phase 10.6). Its byproduct edits land in `backlog.md`: the `rebalance-claude-md-vs-constitution-annex-budget-b4d1` entry is replaced by the newly-filed `bump-eleventy-fix-liquidjs-critical-rce-vuln-8caf` entry. At this point `-f029` still reads `status: open`. Evidence: `git show 6c85282 -- .claude/memory/backlog.md` (8 insertions / 8 deletions, all in the `-b4d1`→`-8caf` block).
- `2026-06-06 04:36:59 IST` (2026-06-05 23:06 UTC) — `/commit` Step 5 runs `git commit`; `6c85282` lands. Commit message body asserts "Closes backlog mutation-testing-oracle-for-tdd-checker-f029," but the committed `backlog.md` still shows `-f029` as `status: open`. Evidence: `git show 6c85282:.claude/memory/backlog.md` line for `-f029`.
- `2026-06-06 ~04:37 IST` (post-commit) — `/commit` Step 6 invokes `node .claude/skills/memory-flush/sweep.mjs --mode stamp-closure --backlog-keys mutation-testing-oracle-for-tdd-checker-f029`. `modeStampClosure` (`sweep.mjs:296`) writes `status: picked-up` + `superseded-at: 2026-06-05` (UTC `todayIso()`) into the **working tree** and returns `{stamped: 1}`. No git staging or commit occurs — `writeFileSync` at `sweep.mjs:320` is the only side effect.
- `2026-06-06 ~04:37 IST` (post-commit) — a `SHIPPED 2026-06-05 (commit 6c85282, scripts/mutation-oracle.mjs).` suffix is appended to the `-f029` `caveat:` field by hand. `sweep.mjs` does not write caveat text and could not know the SHA, so this was a direct manual edit to canonical memory. It is also uncommitted. Evidence: `git diff .claude/memory/backlog.md`; `git log -S "SHIPPED 2026-06-05 (commit 6c85282" -- .claude/memory/backlog.md` returns empty (never in history).
- `2026-06-05T23:08–23:09Z` — thread shelved; session ends; subsequent `/clear`. The post-commit working-tree edits are never carried into any commit.
- `2026-06-06 (next session)` — `git status` shows the lone residue `M .claude/memory/backlog.md`. The dangling stamp is rediscovered while answering "what is next?".

## Impact

- **Users affected**: 1 — the baseline maintainer (single-repo dogfood). No consumer-facing impact (`backlog.md` is project memory, never shipped in the npm payload).
- **Duration**: stamp written ~2026-06-06 04:37 IST; still uncommitted at RCA time → ~24h and ongoing.
- **SLA impact**: none — no service, no SLA.
- **Business impact**: none measurable. The risk is to memory integrity, not production.
- **Data impact**: no loss. Two correct, intended edits to `backlog.md` exist only in the working tree. The live failure mode is **latent loss**: `superseded-at: 2026-06-05` marks the entry for auto-deletion by the next `/memory-flush` Step 0a sweep. If that flush runs before the stamp is committed, the closure record is deleted having never entered history — the entry would vanish from git as `status: open`, contradicting `6c85282`'s "Closes …" claim.

## Detection

Not detected by any hook, test, or guard — surfaced manually by the user recalling "some commit time bug we noted last session," then confirmed via `git diff`. There is no automated check that flags a `backlog.md` left dirty after `/commit`, nor one that reconciles a commit message's "Closes <key>" against the committed state of that key. Detection was therefore human memory + luck (the residue happened to be the only dirty file). Faster detection would come from `/commit` itself reporting the post-stamp dirty path, or a session-start check for an orphaned post-commit memory edit.

## Root cause

`/commit` Step 6 stamps backlog closure **after** the commit (by necessity — the `superseded-at` semantics and the SHA-bearing note reference the commit that just landed) but the SOP defines no step to stage and commit the resulting `backlog.md` edit, so the stamp is structurally orphaned in the working tree and relies on an unspecified *future* commit to carry it.

## Contributing factors

- **Post-commit ordering is intrinsic, not incidental.** A closure note that cites its own commit SHA cannot exist before that commit. So "just stamp before committing" does not fix it; the stamp is genuinely a post-commit artifact that needs its own carry mechanism.
- **The "rely on the next workflow" assumption is unsound at session boundaries.** Step 6's own text accepts deferral to "the next workflow's `/memory-flush`" only on *filesystem failure*. It silently extends to the *success* path too: nothing commits the stamp, so even a successful stamp banks on a future commit. When the workflow is the last activity before `/clear` (the common case — a workflow ends, the user stops), there is no next commit and it strands.
- **Single-writer rule has an unwritable case.** `commit/SKILL.md` Step 6 says "`sweep.mjs` is the only writer to `backlog.md`," yet `sweep.mjs` writes only `status` + `superseded-at`. The SHA-bearing `SHIPPED (commit …)` provenance note is information only the post-commit context holds, so closing the loop fully *required* a hand-edit that the rule forbids — the rule and the desired artifact are in tension.
- **No reconciliation between commit prose and committed state.** `6c85282`'s body claims "Closes …-f029" while the committed `backlog.md` still reads `open`. Nothing checks that a "Closes <backlog-key>" claim matches the committed entry, so the discrepancy was invisible.
- **Smuggling risk in the assumed remedy.** Had a later unrelated workflow's commit swept up the orphaned stamp, it would fold a memory edit belonging to `mutation-testing-oracle` into an unrelated commit — a provenance smell that the "next commit carries it" design quietly accepts.

## Resolution

Not yet resolved — this RCA precedes the fix (per skill discipline, the fix design belongs in a separate `/spec`). Immediate options for the dangling residue:

1. Commit the existing working-tree stamp as a small `chore` (needs `/grant-commit`; `main` is protected). Lowest-risk; clears the residue now.
2. Defer until the next workflow and let its commit carry it — re-exposes the exact stranding/smuggling this RCA documents; not recommended.

The durable fix (separate spec) should make `/commit` commit the closure stamp as part of the workflow's own commit cycle. Candidate shapes for that spec to weigh — do **not** decide here:
- A follow-up amend is forbidden by Art. VII (`--amend` is hard-blocked), so the stamp likely needs either (a) a dedicated immediately-following closure commit (`chore(memory): close backlog -f029 [skip ci]`) emitted by Step 6, or (b) moving the SHA-free part of the stamp (`status: picked-up`, `superseded-at`) into the pre-commit `/memory-flush` byproduct so it rides the feature commit, leaving only an optional post-hoc provenance note.
- Whichever shape wins must keep `sweep.mjs` the sole writer (extend it to emit the provenance note from a passed-in SHA) and must reconcile the commit message's "Closes <key>" claim with committed state.

## What went well

- **The mechanism itself worked.** `/triage` correctly populated `source_backlog_keys`, and `sweep.mjs --mode stamp-closure` correctly stamped exactly the right entry — the failure is in *carrying* the result, not computing it.
- **The residue was self-describing.** `superseded-at:` + the SHA-bearing note made the orphaned edit trivially traceable to its origin commit once inspected.
- **`git log -S` gave a clean negative.** The "never committed" conclusion was verifiable in one command, not inferred.
- **No consumer blast radius.** The dev-only boundary held — nothing leaked to the shipped payload.

## What could be improved

- `/commit` should never leave the tree dirty without saying so. At minimum Step 6 should report the post-stamp `git status` so the operator sees the residue before the session ends.
- The "Closes <backlog-key>" convention in commit bodies should be backed by a check (or dropped), so a commit cannot claim a closure its committed state contradicts.
- Session-start (`memory_session_start`) could flag a lone uncommitted `backlog.md` whose only diff is a `superseded-at:`/`status: picked-up` stamp — the signature of a stranded closure.

## Action items

- [ ] **AI-01** — Clear the current residue: commit the dangling `-f029` closure stamp in `.claude/memory/backlog.md` (via `/grant-commit` + a `chore` commit). Owner: Tushar Srivastava. Due: 2026-06-07. Status: open.
- [ ] **AI-02** — `/triage` → `/spec` a durable fix so `/commit` carries the closure stamp into version control within its own commit cycle (see Resolution for candidate shapes; decide in the spec, not here). Reconcile with the `--amend` hard-block and the `sweep.mjs` single-writer rule. Owner: Tushar Srivastava. Due: 2026-06-13 (tentative). Status: open.
- [ ] **AI-03** — Add a `/commit` Step 6 post-stamp `git status` report (cheap, independent of AI-02) so a stranded stamp is visible before session end. Owner: Tushar Srivastava. Due: 2026-06-10 (tentative). Status: open.
- [ ] **AI-04** — Decide whether the "Closes <backlog-key>" commit-body convention gets an enforcement check or is dropped; record the decision in `conventions.md`. Owner: Tushar Srivastava. Due: 2026-06-13 (tentative). Status: open.

## Links

- Feature commit: `6c85282` — `feat(testing): add dev-only mutation-testing oracle (Stryker, advisory)`
- Stamp logic: `.claude/skills/memory-flush/sweep.mjs:296` (`modeStampClosure`)
- Stamp SOP: `.claude/skills/commit/SKILL.md` Step 6
- Source workflow state: `docs/archive/2026-06-05/mutation-testing-oracle/workflow.json` (`source_backlog_keys`)
- Affected entry: `.claude/memory/backlog.md` → `mutation-testing-oracle-for-tdd-checker-f029`
- Related backlog (loop-closing design origin): `docs/archive/2026-05-17/workflow-loop-closing-hygiene/` (`backlog-status-not-auto-flipped-after-pickup-ac5d`)
