---
key: delta-touched-splits-on-commas-not-json-9c22
category: landmines
scope: [archive]
source: assistant-deferral
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 3c08c8a
last-touched: 2026-08-26
governs: .claude/skills/archive/SKILL.md, .claude/skills/workspace/queries.mjs, .claude/skills/workspace/delta.mjs
---

> Re-running comma-separated confirmed both rows. Following the SOP's own prose produced a false drift report on a clean landing.

- **The trap.** `/archive` Step 3 says *"Pass the paths as one quoted JSON array, never as bare space-separated words."* The receiver disagrees: `queries.mjs → touchedPaths` does `String(raw).split(',')`. A JSON array leaves `[` and `"` glued to the first and last tokens, so no path matches any anchor.
- **What it looks like.** Every declared `## System delta` row comes back under `drift`, with `specMissing: false` and `inputEmpty: false` — the two fields that exist to tell you the table *was* read and the input *was* non-empty. It reads exactly like a landing that failed to do what its spec promised.
- **Why it is dangerous rather than merely wrong.** The verdict is silent and plausible. `drift` on a clean landing invites you to "fix" a spec row that was correct, or to shrug and archive anyway — and archiving anyway leaves `docs/system/` un-updated, which is the drift the step exists to prevent.
- **The correct form** is one quoted **comma-separated** string: `--touched "a/b.mjs,c/d.mjs"`. That is equally immune to the zsh word-splitting the prose was written to defeat, so the prose can be corrected without losing its point.
- **Filter deletions out of the path list.** `git status --porcelain | awk '{print $NF}'` yields deleted paths too; they are not part of the landing's touched surface and pollute `unclaimed`. Use `grep -vE '^ ?D'` first.
- **The usage line is right and the prose is wrong** — `--touched <comma,separated,paths>` in the same SKILL.md. When the two disagree, believe `queries.mjs`.
