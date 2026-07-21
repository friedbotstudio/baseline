---
key: bundle-mcp-servers-stage-1-7
category: landmarks
scope: [scout, implement]
verified-at: 6ddda04
last-touched: 2026-07-21
---

- Path: `scripts/bundle-mcp-servers.mjs` (Foundation helper) + `scripts/build-template.sh` **Stage 1.7** (between prune Stage 1.5 and manifest Stage 3, runs UNCONDITIONALLY so `--manifest-only` still hashes a fresh bundle).
- What: esbuild-bundles the first-party MCP servers (`sprint-channel`, `sprint-pool`) into self-contained `obj/template/.claude/mcp/<server>/server.mjs`, inlining `@modelcontextprotocol/sdk` + `zod` so a consumer install runs the server with production deps only (baseline stays zero-runtime-dep). Supersedes the retired S2 own-package/npx plan (backlog `sprint-channel-own-package-sdk-delivery-ac005-slice-c`). See [[esbuild-0-28-1]].
- Contract: `bundleServers(templateDir)` bundles only servers whose directory is present (skips absent ones — fixture/consumer builds); a present dir with a missing entry throws (corruption). esbuild is imported LAZILY so a depless clone degrades to shipping raw sources with a loud warning rather than crashing — see [[build-helpers-must-degrade-without-node-modules]]. The bundle overwrites the shipped `server.mjs` in place (same path → no `.mcp.json`/manifest special-casing); the dev-tree `.claude/mcp/*/server.mjs` stays readable/unbundled.
- Note: does NOT register the servers in `.mcp.json` — that (and the 3→5 MCP-server count cascade) is S4 (`sprint-mode-dogfood-config-mcp-register-and-flag-flip`), deliberately out of scope. Design archived at `docs/archive/2026-07-21/bundle-mcp-servers-esbuild/`.
