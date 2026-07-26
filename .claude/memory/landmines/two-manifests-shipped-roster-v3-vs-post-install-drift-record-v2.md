---
key: two-manifests-shipped-roster-v3-vs-post-install-drift-record-v2
category: landmines
scope: [scout, spec, document, integrate]
source: inferred-from-code
verified-at: e98b712
last-touched: 2026-07-26
---

- **Two different manifests exist and conflating them produces a wrong "fix".** `obj/template/.claude/manifest.json` is the **shipped roster**: `manifest_version: 3`, ~406 file entries with per-file sha256, plus `owners.skills`. `<target>/.claude/.baseline-manifest.json` is the **post-install drift record**, written by the CLI at `src/cli/manifest.js:5` (`MANIFEST_VERSION = 2`), hash-only, consumed by `doctor` and `upgrade`.
- **How it bit.** During the website refresh I read `install.njk` saying "manifest v2" and `cli.njk` saying `"manifest_version": 1`, saw the shipped manifest at 3, and concluded both pages were stale. Wrong. `install.njk` describes the CLI's install output, so **v2 is correct there**; only `cli.njk`'s two `version 1` samples were stale, and they become **2, not 3**. Had I "fixed" the count to 3 everywhere I would have turned one correct page into a wrong one.
- **The tell.** Ask which manifest a surface is describing before touching a version number. Shipped roster with `owners.skills` → 3. Anything reached by `doctor`/`upgrade` against an installed target → 2.
- Genesis already warns about this at `docs/init/seed.md` §17 ("do not conflate the two"); the warning is easy to read past because both files are called a manifest.
