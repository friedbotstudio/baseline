---
key: esbuild@0.28.1
category: libraries
scope: [research, implement]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Library: `esbuild` — build-time JS bundler, exact-pinned devDependency. Used by `scripts/bundle-mcp-servers.mjs` (build-template.sh Stage 1.7) to inline the first-party MCP servers into self-contained single-file artifacts. See [[bundle-mcp-servers-stage-1-7]].
- Role: dev-only / build-time. NEVER a runtime dependency; never ships to consumers (runtime `dependencies` stays `{@clack/prompts}`). The bundled OUTPUT ships; esbuild itself does not.
- Key API (context7 `/evanw/esbuild`, verified 2026-07-21): `build({entryPoints, outfile, bundle:true, platform:'node', format:'esm', allowOverwrite:true, absWorkingDir, nodePaths})`. Under `platform:'node'`, `node:`-prefixed builtins are auto-externalized. **Do NOT pass `packages:'external'`** — that would exclude ALL npm packages (the opposite of inlining); omit it so `@modelcontextprotocol/sdk` + `zod` get bundled in. `nodePaths:[<abs node_modules>]` resolves bare imports from a chosen node_modules even when the entry lives outside the repo (honors the SDK's subpath `exports` since 0.16.8). See landmine [[esbuild-resolves-bare-imports-from-entry-dir-not-cwd]].
- Caveat: `npm audit` clean at pin time (0 vulnerabilities). Exact-pin required (`0.28.1`, no caret) per `check-files-diff DEVDEP_RANGE_FORBIDDEN` — see [[devdeps-exact-pinned-and-tests-not-strictly-co-named]].
