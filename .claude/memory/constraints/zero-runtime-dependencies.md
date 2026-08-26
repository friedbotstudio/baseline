---
key: zero-runtime-dependencies
category: constraints
state_verified_at: f7da5a7
scope: []
state: true
governs: .claude/hooks/**, .claude/skills/**, scripts/**
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- Constraint: baseline runtime code takes no third-party runtime dependency. `package.json → dependencies` is `["@clack/prompts"]` (CLI-only); every hook, skill helper, and build script is zero-dep `.mjs` on Node builtins, `engines: {"node": ">=18.17.0"}`. `state: true` means the constraint HOLDS.
- Why it is load-bearing, not stylistic: the baseline installs into other people's repositories. A runtime dependency becomes their dependency, their supply-chain surface, and their version conflict. Article XII ships hashed files, not a package tree.
- Decisions resting on this: rejecting Structurizr as a dependency (semantics adopted instead); the memory store staying plain files with a derived index rather than an external graph database; the derived index being regenerated rather than backed by a store.
- Re-verification: `node -e "console.log(require('./package.json').dependencies)"` plus a scan for non-builtin imports under `.claude/`. If this ever flips to `false`, the plain-files-and-derived-index design loses its main justification and should be re-argued rather than assumed.
- **The import scan has three standing hits, and none of them falsifies this.** `impeccable/scripts/live/{svelte-component,sveltekit-adapter,tanstack-adapter}.mjs` import `svelte`, `react` and `@babel/parser`. Those run live-mode injection inside a CONSUMER's project against the framework that project already installs; the baseline neither declares nor installs them, and no guard or workflow path reaches them. Confirm the three paths are still the only hits rather than assuming the scan is clean.
