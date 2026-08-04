---
key: zero-runtime-dependencies
category: constraints
scope: any
state: true
state_verified_at: f7da5a7
governs: .claude/hooks/**,.claude/skills/**,scripts/**
verified-at: f7da5a7
last-touched: 2026-08-04
---

- Constraint: baseline runtime code takes no third-party runtime dependency. `package.json → dependencies` is `["@clack/prompts"]` (CLI-only); every hook, skill helper, and build script is zero-dep `.mjs` on Node builtins, `engines: {"node": ">=18.17.0"}`. `state: true` means the constraint HOLDS.
- Why it is load-bearing, not stylistic: the baseline installs into other people's repositories. A runtime dependency becomes their dependency, their supply-chain surface, and their version conflict. Article XII ships hashed files, not a package tree.
- Decisions resting on this: rejecting Structurizr as a dependency (semantics adopted instead); the memory store staying plain files with a derived index rather than an external graph database; the derived index being regenerated rather than backed by a store.
- Re-verification: `node -e "console.log(require('./package.json').dependencies)"` plus a scan for non-builtin imports under `.claude/`. If this ever flips to `false`, the plain-files-and-derived-index design loses its main justification and should be re-argued rather than assumed.
