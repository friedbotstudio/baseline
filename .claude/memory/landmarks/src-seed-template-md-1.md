---
key: src/seed.template.md:1
category: landmarks
scope: [scout]
---

- Role: pristine ship-time template for the project's genesis prompt (`docs/init/seed.md`). `npx @friedbotstudio/create-baseline` overlays this onto a fresh target tree; `scripts/build-template.sh` regenerates `obj/template/` from it. Per Article I.4 precedence, this template is the source of truth for the baseline's shape — any drift between `docs/init/seed.md` and this file means the genesis is out of step with what ships.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: byte-equal mirroring obligations apply only to specific sections, not the whole file. §17 (manifest provenance) must carry the same manifest paths in both files — `obj/template/.claude/manifest.json` for the shipped manifest and `<target>/.claude/manifest.json` for the consumer install location. The §16 (project-specific configuration) section MUST stay pristine in the template (no `Generated:` stamp, no detected-stack table); the audit emits `seed.template.md: §16 has been populated` if it drifts from the placeholder. Touch the template and `docs/init/seed.md` in the same commit but never bulk-cp from live seed.md to template — the live seed.md has §16 populated and would contaminate the template. Edit §17 by hand in both files.
