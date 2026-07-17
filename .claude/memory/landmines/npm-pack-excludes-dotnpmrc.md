---
key: npm-pack-excludes-dotnpmrc
category: landmines
scope: [scout, spec, tdd, security, integrate]
source: implementation incident (supply-chain-hardening workflow, 2026-05-13 implement-tick iteration 1)
---

- Path: `scripts/build-template.sh:88` (the overlay block) + `src/cli/install.js:71` (the workaround)
- Trap: npm pack mechanically excludes any file named `.npmrc` from the published tarball, even when `package.json → files` explicitly lists it (registry-credential hardening built into npm). The exclusion fires on basename, not path — `obj/template/.npmrc` is dropped just as `.npmrc` at the repo root would be. A file named `src/.npmrc.template` (different basename) IS shipped. This caught the AC-007 implementation: the first build-template.sh attempt `cp src/.npmrc.template → obj/template/.npmrc` produced bytes on disk in the dev repo, but every `npm pack` produced a tarball without `.npmrc`, and smoke-tarball's installed-tree hash verify (AC-004 mechanism) reported `HASH_MISMATCH: obj/template/.npmrc (listed in shipped manifest but absent on disk)` on every clean smoke.
- Mitigation: ship `.npmrc` bytes under a non-excluded basename in `src/` (today: `src/.npmrc.template`). At install time, the CLI reads the bytes and writes them to `<target>/.npmrc`. The `obj/template/.npmrc` overlay step in build-template.sh is intentionally NOT present; the script body documents this with a comment so a future contributor doesn't re-add it.
- Confirmation: `npm pack --dry-run --json --ignore-scripts | jq '.[0].files[].path'` lists `src/.npmrc.template` but not `obj/template/.npmrc` even when the latter exists on disk and is referenced in the shipped manifest.
- Applies to: any future config file the baseline materializes into a target whose basename is on npm's exclusion list (`.npmrc`, `.npmignore`, `package-lock.json` under conditions). When in doubt, ship under `src/<name>.template` and overlay at install time.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
