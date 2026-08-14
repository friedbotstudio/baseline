---
key: a-lexical-containment-check-is-defeated-by-a-symlink
category: landmines
scope: [implement, security, simplify]
governs: .claude/skills/tdd/drift_check.mjs, .claude/skills/workspace/restore-degraded-shards.mjs, .claude/skills/workspace/tree.mjs
verified-at: be0a351
last-touched: 2026-08-13
---

- Landmine: **`resolve()` + `startsWith(root)` is a LEXICAL check. A symlink whose path is inside the root passes it, and the subsequent `readFileSync` follows the link straight out of the tree.** CWE-59. Second occurrence of the class in two days.

**Measured 2026-08-13** against `probeRunnable`, with every escaping target made deliberately readable so a permissive verdict proves the file was actually opened:

| Attack | Lexical check alone |
|---|---|
| `../outside/x.mjs` | refused |
| `sub/../../outside/x.mjs` | refused |
| absolute path | refused |
| null byte injected | refused |
| `./../outside/x.mjs` | refused |
| **symlinked FILE inside the root** | **escaped** |
| **symlinked DIRECTORY inside the root** | **escaped** |

- **Use `realpathSync`, not `lstatSync`.** The sibling fix in `restore-degraded-shards.mjs → classifyEntry` used `lstat` + `isSymbolicLink()`, which catches a symlinked FILE but misses a symlinked PARENT DIRECTORY — both escaped in the probe above. `realpathSync` resolves the whole chain in one call and covers both.
- **Realpath BOTH SIDES, and this is where it bites.** Resolving only the target broke three passing tests instantly: on macOS `/tmp` is itself a symlink to `/private/tmp`, so every `mkdtemp` root reads as an escape. A one-sided realpath is a false-positive generator, not a guard.
- **The trap was already documented twelve lines away and I still hit it.** `drift_check.mjs → isRunAsScript` carries the comment "realpath both sides so a symlinked invocation path (macOS /tmp -> /private/tmp) still matches." Proximity is not protection: a comment on a neighbouring function is read when you are debugging that function, not when you are writing a new one. If a module has a path-realpathing convention, state it at the module header where a new function author will meet it.
- **Cheap detector.** A containment test whose out-of-bounds target is missing or unreadable proves nothing — `refused` and `absent` become indistinguishable. Put a real, readable file outside the root and assert the refusal.
- Related: [[a-synthesizing-writer-erases-fields-its-arguments-cannot-carry]] is the other "the sibling was fixed, this one was not" pair in the same corpus.

- load_bearing: true
