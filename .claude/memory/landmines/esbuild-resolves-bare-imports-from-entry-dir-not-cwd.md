---
key: esbuild-resolves-bare-imports-from-entry-dir-not-cwd
category: landmines
scope: [implement, tdd]
verified-at: 6ddda04
last-touched: 2026-07-21
---

- Path: `scripts/bundle-mcp-servers.mjs:56-68` (the `build({...})` call).
- Trap: esbuild resolves **bare** import specifiers (`@modelcontextprotocol/sdk`, `zod`) by walking up `node_modules` from the **entry file's directory**, NOT from `cwd` or `absWorkingDir`. When the entry is a copy inside a template/temp tree outside the repo (as Stage 1.7 bundles `obj/template/.claude/mcp/<server>/server.mjs`, or a test's `mkdtemp` fixture), the walk finds no `node_modules` → `Could not resolve "@modelcontextprotocol/sdk/..."` and the build fails. Setting `absWorkingDir` alone does NOT fix it (it changes cwd/relative-path base, not the package search root).
- Mitigation: pass `nodePaths: [join(REPO_ROOT, 'node_modules')]` — esbuild's NODE_PATH equivalent adds an explicit package resolution root, and since 0.16.8 it honors the `exports` field (needed for the SDK's `/server/mcp.js` subpath). Derive `REPO_ROOT` from the script's own location (`dirname(dirname(fileURLToPath(import.meta.url)))`). See [[esbuild-0-28-1]], [[bundle-mcp-servers-stage-1-7]].

---
