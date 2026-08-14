---
key: src/CLAUDE.template.md:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: pristine ship-time template for the in-session constitution (`CLAUDE.md`). Per Article XI, this file SHALL remain byte-equal to `CLAUDE.md` for the Article XI block; `audit-baseline` enforces `CLAUDE.md missing Article XI citation` on drift. Article XI carries the manifest-path contract: shipped manifest at `obj/template/.claude/manifest.json`, consumer install at `<target>/.claude/manifest.json`, runtime hash table separately at `<target>/.claude/.baseline-manifest.json`.
- Caveat: touch this and `CLAUDE.md` in the same commit. The byte-mirror test (`tests/template-drift.test.mjs`) flips to failure when CLAUDE.md and src/CLAUDE.template.md diverge. The audit hashes every file under tracked skill paths against `manifest.files`, but the constitution mirror is verified via citation-presence checks, not hash equality — that's why the byte-equal obligation lives in this caveat rather than in a hash entry. Pre-existing drift between the two files (e.g., Phase 11.5 changelog row missing from one side) is OUT of scope for the splash workflow but breaks the `tests/template-drift.test.mjs` invariant; fix in its own chore.
