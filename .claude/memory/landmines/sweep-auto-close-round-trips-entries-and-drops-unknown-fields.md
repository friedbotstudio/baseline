---
key: sweep-auto-close-round-trips-entries-and-drops-unknown-fields
category: landmines
load_bearing: true
scope: [memory-sync, archive, commit]
governs: .claude/skills/memory-sync/sweep.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/memory-sync/sweep.mjs --mode auto-close`, the Step 0a actuator every `/memory-sync` runs unconditionally.
- Landmine: **auto-close does not only delete closed entries. A run that closes anything also parses and rewrites unrelated entries, and the round-trip is lossy.** Observed 2026-08-07 on a run that reported `{"closed": 2, "malformed": [], "invariant_violation": []}` — an honest-looking receipt for an operation that also modified 13 unrelated files and created 2 spurious shards. The report names only the closures, so the damage is invisible in the output.
- **Trigger condition, measured 2026-08-07 (workflow `readme-count-gate`) — narrower than first recorded.** The original wording said the rewrite hits "every entry it walks", which reads as *every run is dangerous*. It is not. Re-verified by copying the live store to a scratch dir and running `--mode auto-close` against the copy: `{"closed": 0}`, `diff -rq` against the original **empty**, all 28 `load_bearing:` still in frontmatter, 302 files in and 302 out. With zero entries carrying `superseded-at:` there are no closure candidates, and the lossy path never fires. **The rewrite is coupled to actually closing an entry.** A no-closure run is inert, which is why the two runs disagree and why the first reading overstated the blast radius.

**Measured blast radius, one run.** 2 correct deletions, 13 files rewritten, 2 files created. The correlation is exact:

- 13 landmine shards carried `load_bearing:` in frontmatter. All 13 were rewritten, and in every one `load_bearing: true` was moved OUT of frontmatter and appended as a trailing body bullet (`- load_bearing: true`). The codec does not know the field, so it round-trips it as prose.
- 2 of those 13 also carried a `## ` heading inside the BODY. Both were split: the heading became a new shard whose `key:` is the heading text — `key: 2026-08-05 — a second, worse cause: a real control byte`, containing spaces, an em dash and a colon, which `assertSafeFactKey` would reject outright. The parent then LOST `scope:`, `governs:`, `load_bearing:`, `verified-at:` and `last-touched:` from its own frontmatter, keeping only `key:` and `category:`.

**Why it matters more than it looks.** `annotationPlacementAllowed` (`placement.mjs:43`) reads `load_bearing` from the entry's FIELDS. Relocated into the body it is no longer a field, so every one of those 13 entries silently stops authorizing annotation placement. Worse, an entry stripped of `scope:` is unreachable at every trigger — this skill's own Step 4.6 says so ("A fact carrying no `scope:`, or `scope: []`, surfaces at no trigger and is unreachable regardless of how good it is"). The best-curated entry in the store becomes inert without a single error.

**Why it hides.** Same family as [[a-check-that-measured-nothing-reports-success]] but inverted: there a check measured nothing and reported success; here a writer did far more than asked and reported only the part it was asked to do. `{"closed": 2}` is true. It is also not the whole truth, and nothing in the report hints at 15 other files.

- **Do not reach for `git checkout --` or `git restore <path>` to undo it.** Both are hard-blocked by Art. VII (worktree path-discard, any spelling). What worked, and what [[materialize-appends-blank-lines-every-run]] already records for the same class of problem: read each touched file's committed bytes with `git show HEAD:<path>` (a read, not a discard) and write them back with an ordinary file write, then delete the spurious new shards by name. Keep the intended deletions deleted.
- Mitigation until fixed, in order of cost. **Cheapest first: check whether the run can fire at all** — `grep -rl '^superseded-at:' .claude/memory/ | wc -l`, plus `resolved-at:` on `pending-questions`. Zero closure candidates means auto-close is inert and needs no further guarding. **When there ARE candidates**, copy the store to a scratch dir, run `--mode auto-close --memory-dir <copy>` against the copy, and `diff -rq` it before letting the real run proceed. **After any real run**, `git status --porcelain .claude/memory/` and confirm the changed set is exactly the entries you expected to close. A modification where you expected a deletion is this bug.
- Real fix: make the codec preserve unknown frontmatter fields verbatim on round-trip, and stop treating a body `## ` heading as an entry boundary in the sharded shape — a shard is one entry by construction, so the split has no legitimate case there.
- Sibling: [[materialize-appends-blank-lines-every-run]] is the same defect class in the corpus writer — a round-trip that does not preserve its input. That one only added whitespace; this one drops load-bearing fields.
