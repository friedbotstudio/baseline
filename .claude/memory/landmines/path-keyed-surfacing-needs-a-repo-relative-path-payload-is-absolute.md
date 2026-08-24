---
key: path-keyed-surfacing-needs-a-repo-relative-path-payload-is-absolute
category: landmines
scope: []
governs: .claude/hooks/process_lifecycle_guard.mjs, .claude/hooks/lib/governed-memory.mjs, .claude/skills/memory-index/resolve.mjs
verified-at: 05d8fec
last-touched: 2026-08-24
---

- **The trap.** The PreToolUse payload's `tool_input.file_path` is an **absolute** path. Everything a path is looked up against is **repo-relative**: `governs:` globs in memory frontmatter, and `anchor:` values in `docs/system/elements/`. Hand the absolute path to either lookup and it matches nothing, silently.
- **Measured** (2026-08-06, `corpus-recall-reachability`): `resolveLookup('by_path', …)` on `.claude/skills/memory-index/resolve.mjs` returns **9** governing entries; on the same file's absolute form it returns **0**. `surfaceCorpusLocation` returns `null` for the absolute form and the anchoring element for the relative one.
- **Why it survived.** `process_lifecycle_guard` is advisory and ends every branch in `emitAllow()`. A guard that fails open **and** never fires is indistinguishable from one that works: no error, no empty-result warning, no audit signal. The path-governed trigger shipped in the `living-system-model` epic (roadmap item C, marked ✅) and never fired on a real write until this cycle.
- **How to avoid it.** Normalise once at the hook boundary before either lookup — `isAbsolute(p) ? relative(rootDir, p) : p`. Do it in the caller that receives the payload, not inside the resolvers, so the resolvers keep their one contract (relative in, relative out).
- **What this does NOT fix.** The phase-scoped trigger and the path-keyed ones are still **mutually exclusive** — `surfacePhaseScopedMemory` calls the path leg only under `if (!phase)`, and `emitAllow()` is `process.exit(0)`. See [[governs-globs-under-a-phase-prefix-never-surface]], which remains true in full. What changed this cycle is narrower: the governed-memory block and the corpus-location block are now composed **before** any `emitAllow`, so they are additive with each other.
- **Re-verification.** Run the two lookups on the same file in both path forms. If the absolute form starts returning hits, a resolver grew its own normalisation and this entry's advice belongs there instead.
