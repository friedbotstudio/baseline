---
key: src/cli/conflict.js:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: `SENTINEL_PATHS` (frozen array of 5 install-marker paths: `.claude`, `.claude/.baseline-manifest.json`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`) + `scanSentinels(target)` async helper. Returns the subset of sentinels found in the target tree; `bin/cli.js` uses the non-empty result to short-circuit fresh-install mode with a "prior baseline detected" message and the `--force` / `--merge` / `--dry-run` mode hint.
- Caveat: `.claude/.baseline-manifest.json` is the strongest "previously installed by create-baseline" signal because its presence implies a successful install; the file header comment in conflict.js explains why the older `README.md` sentinel was dropped (the allowlist build ships no README.md, so users keep their own). Update both `SENTINEL_PATHS` and `bin/cli.js`'s conflict-handling branch in lockstep if the install layout changes.
