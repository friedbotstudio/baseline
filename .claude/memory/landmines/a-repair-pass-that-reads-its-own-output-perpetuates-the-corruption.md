---
key: a repair pass that reads its own output perpetuates the corruption
category: landmines
scope: [implement, chore]
source: incident
verified-at: 8201af6
last-touched: 2026-08-14
---

> verbatim (incident, 2026-08-08):
> A bulk pass wrote a wrong `governs:` onto 19 landmarks. The repair pass then read that wrong value as its best evidence and preserved it, reporting 45 files "fixed".

- What happened: a curation script looked entries up with `entries.find(e => path.endsWith('/' + f))`, which is always true, so `.find()` returned each category's FIRST entry. Every mechanical proposal was computed against the wrong entry, and 19 landmarks got one identical, wrong `governs:` — overwriting values that in one case held three correct globs.
- Why the first repair failed: `scope-narrow.mjs → evidenceFor` ranks a declared `governs:` above a path-shaped key. The corrupted files now HAD a declared `governs:`, so the repair pass treated the corruption as authoritative and re-wrote it unchanged. The verdict said `fixed: 45` and nothing had been fixed.
- The rule: when a repair reads the same field it writes, the pre-change state is the only trustworthy input. Recover from `git show HEAD:<path>` and re-derive from fields the bad pass did not touch — never from the current file.
- Detection: a bulk write whose output has suspiciously low cardinality. 19 files sharing one `governs:` value is the tell; `grep -h '^governs:' … | sort | uniq -c | sort -rn` surfaces it in one command.
- Do NOT reach for `git checkout -- <path>` to undo this. Article VII hard-blocks worktree path-discard in every spelling. Fix forward by writing correct values over the wrong ones, sourcing them from `git show`.
