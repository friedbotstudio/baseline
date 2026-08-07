---
key: materialize-appends-blank-lines-every-run
category: landmines
scope: [archive, memory-flush, simplify]
governs: .claude/skills/workspace/materialize.mjs,.claude/skills/workspace/record-codec.mjs,.claude/skills/workspace/store.mjs
verified-at: 17f1fa0
last-touched: 2026-08-07
---

- Path: `.claude/skills/workspace/materialize.mjs` → `writeElement` → `record-codec.renderRecord`, against `parseEntry` on the read side.
- Landmine: `materialize({specDir: 'docs/system', ...})` does **not** round-trip. Every run appends **two blank lines** to every element file it rewrites, whether or not that element changed. Observed 2026-08-07: one run over the live corpus produced `126 files changed, 239 insertions(+)` — of which **224 insertions were trailing blank lines across 112 untouched elements**. The real change was one new element and fourteen one-line concept member reorderings.
- Why it hides: the growth is invisible in a rendered diff view (whitespace-only hunks collapse), it never breaks a test, and it is *monotonic* — ten materialize runs leave twenty trailing blank lines per file. Each individual run looks like harmless formatting noise.
- The reordering half is fine and should not be "fixed": `materialize` sorts `members:` alphabetically, which is a stable normalization — the first run after hand-authoring shows a diff, subsequent runs show none.
- **Do not reach for `git checkout --`/`git restore` to undo the churn.** Both are hard-blocked by Art. VII (worktree path-discard, any spelling) and blowing away a mixed diff is exactly what that block exists to prevent. What worked: read each churned file's HEAD bytes with `git show HEAD:<path>` (a read, not a discard), compare `trimEnd()`, and write HEAD's bytes back with an ordinary file write only where the sole difference is trailing whitespace. That keeps real changes and drops only the noise.
- Mitigation until fixed: after any `materialize` against the live corpus, run the whitespace-only restore above before staging, and check `git diff --stat docs/system/` — a one-element addition should touch roughly one element file plus the concepts that declare it, never all 112.
- Real fix (small, out of the slice that found it): make `renderRecord` emit a fixed trailing form and `parseEntry` normalize it on read, so `render(parse(x)) === x`. Add a round-trip test asserting a second `materialize` over an unchanged corpus produces a byte-identical tree — the property that would have caught this.
- Sibling: [[syncback-applied-overstates-what-it-stamped-8e21]] is a receipt that overstates what it wrote; this is a writer that writes more than it was asked to. Both make a corpus diff untrustworthy as evidence of what a landing changed.
