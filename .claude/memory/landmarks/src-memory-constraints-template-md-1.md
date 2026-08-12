---
key: src/memory/constraints.template.md:1
category: landmarks
scope: [scout]
verified-at: ce8c7cd
last-touched: 2026-08-12
governs: src/memory/constraints.template.md
---

- Role: the pristine ship-time stub for `constraints`, the EIGHTH canonical memory category. Added 2026-08-12 (consumer-install-defects D9); until then `CANONICAL` named eight categories while `src/memory/` held only seven templates, so a fresh install received no `constraints.md` at all.
- Companion: `scripts/build-template.sh` Stage 2 globs `src/memory/*.template.md` and copies each to `obj/template/.claude/memory/<base>.md`, so adding the file was sufficient — no build-script change. `tests/build-template-memory-excludes.test.mjs` asserts every shipped stub is byte-identical to its template here.
- Caveat: this file is the SHIPPED stub, not the dev repo's own store. The dev repo keeps `constraints` sharded at `.claude/memory/constraints/`, which the build excludes by deriving its exclude list from `CANONICAL`. Editing this template changes what every consumer install starts with; editing the shard directory changes only this repo.
