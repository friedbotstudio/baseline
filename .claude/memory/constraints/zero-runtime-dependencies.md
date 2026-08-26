---
key: zero-runtime-dependencies
category: constraints
state_verified_at: f7da5a7
scope: []
state: true
governs: .claude/hooks/**, .claude/skills/**, scripts/**
verified-at: 5f52ba2
last-touched: 2026-08-27
---

- Constraint: baseline runtime code takes no third-party runtime dependency. `package.json → dependencies` is `["@clack/prompts"]` (CLI-only); every hook, skill helper, and build script is zero-dep `.mjs` on Node builtins, `engines: {"node": ">=18.17.0"}`. `state: true` means the constraint HOLDS.
- Why it is load-bearing, not stylistic: the baseline installs into other people's repositories. A runtime dependency becomes their dependency, their supply-chain surface, and their version conflict. Article XII ships hashed files, not a package tree.
- Decisions resting on this: rejecting Structurizr as a dependency (semantics adopted instead); the memory store staying plain files with a derived index rather than an external graph database; the derived index being regenerated rather than backed by a store.
- Re-verification: `node -e "console.log(require('./package.json').dependencies)"` plus a scan for non-builtin imports under `.claude/`. If this ever flips to `false`, the plain-files-and-derived-index design loses its main justification and should be re-argued rather than assumed.
- **The import scan has twelve standing hits across ten packages, and none of them falsifies this.** Confirm the list rather than assuming the scan is clean. Re-measured 2026-08-27 at `5f52ba2`. The count was recorded as five because the scan matched only static `from` imports; it must also match dynamic `import(` calls, or it under-reports by half.
- Three are live-mode injection: `impeccable/scripts/live/{svelte-component,sveltekit-adapter,tanstack-adapter}.mjs` import `svelte`, `react` and `@babel/parser`. Those run inside a CONSUMER's project against the framework that project already installs; the baseline neither declares nor installs them, and no guard or workflow path reaches them.
- Two are the first-party MCP server: `.claude/mcp/baseline/server.mjs` imports `@modelcontextprotocol/sdk` and `tools.mjs` imports `zod`, both devDependencies. Build Stage 1.7 (`scripts/bundle-mcp-servers.mjs`) runs esbuild over `server.mjs` only, inlining both, so the shipped `server.mjs` is self-contained and `.mcp.json` launches nothing else.
- **Six are lazy `import()` inside `impeccable`'s detector engines**, not static imports, which is why a `from`-only scan missed them: `detector/engines/browser/detect-url.mjs` defers `puppeteer` (twice) and `detector/engines/static-html/detect-html.mjs` defers `htmlparser2`, `css-select`, `css-tree` and `domutils` inside one `Promise.all`. They resolve only when that detector actually runs in a consumer project that installed them, so they behave like the live-mode three: no baseline declaration, no install, no workflow path reaching them.
- **The shipped `tools.mjs` still carries its bare `zod` import and would throw in a consumer install.** Nothing loads it — the bundle inlined its contents and does not import it at runtime — so it is an inert leftover of the source tree rather than a live break. Do not add an importer of it without bundling it too.
