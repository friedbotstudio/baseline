---
key: build-helpers-must-degrade-without-node-modules
category: landmines
scope: [implement, tdd, integrate]
verified-at: 6ddda04
last-touched: 2026-07-21
---

- Path: `tests/helpers/clone-and-build.mjs` (rsync `--exclude=node_modules`) vs any `scripts/*.mjs` invoked by `build-template.sh` that imports a third-party dep.
- Trap: the shared `cloneAndBuild` test helper rsyncs the repo into a tmp `PKG_ROOT` **excluding `node_modules`**, then runs `bash <tmp>/scripts/build-template.sh`. Many tests use it (`manifest.test.mjs`, etc.). A build-stage helper that does a **top-level** `import` of a third-party package (e.g. `import { build } from 'esbuild'`) therefore fails to load with `ERR_MODULE_NOT_FOUND` in every such clone — breaking unrelated structural tests, not just the new feature's. `build-template.test.mjs`'s own `makeFixture` masks this (it has no `.claude/mcp` so the stage no-ops) — the breakage surfaces only in the depless *clone* fixtures.
- Mitigation: import the third-party build dep **lazily** (dynamic `import()` inside the function, after a present-check on what it would operate on), and on `ERR_MODULE_NOT_FOUND` emit a loud stderr warning and skip (ship raw / no-op) rather than throwing. Every real publish (`npm ci` / local devDeps → `prepack`) has the dep, so shipped artifacts are still produced; the tarball smoke test guards the consumer boundary. Pattern lives in `scripts/bundle-mcp-servers.mjs → bundleServers`. See [[bundle-mcp-servers-stage-1-7]].

---
