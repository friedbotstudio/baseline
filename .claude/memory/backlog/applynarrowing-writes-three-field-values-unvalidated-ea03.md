---
key: applynarrowing-writes-three-field-values-unvalidated-ea03
category: backlog
scope: [memory-sync, security]
governs: .claude/skills/memory-index/scope-narrow.mjs
status: open
deferred: risk
raised-on: 2026-08-29
raised-in-context: stale-keying-and-glob-scope
source: assistant-deferral
estimated-effort: low (one line per parameter)
verified-at: e9a5893
last-touched: 2026-08-29
---

> verbatim (assistant, 2026-08-27):
> "The fix is one line per parameter through `assertSafeFieldValue`, which `constraints.mjs:65` already uses on this exact field name for this exact reason."

- Intent: route `applyNarrowing`'s `scope`, `governs` and `surfacesOn` values through `assertSafeFieldValue` (`migrate.mjs:64`) before they are written into a frontmatter block.
- Why it matters: a value containing a newline is written straight into the block, forging an arbitrary second key. The frontmatter parser is **last-wins**, so the forged key wins — confirmed empirically against a real `verified-at: abc1234` and a forged `verified-at: 0000000`. `verified-at` is the staleness witness, so a forged one makes an entry read as verified against a commit nobody checked, and it silently stops decaying. `scope:` and `governs:` are forgeable the same way.
- Rated MEDIUM in `docs/archive/2026-08-28/stale-keying-and-glob-scope/security.md`. Reachability is local rather than remote: the realistic vector is a contributor-authored memory entry whose value round-trips through a narrowing run, not an external attacker.
- **Pre-existing, not introduced.** `governs:` and `scope:` have been writable this way since `applyNarrowing` was written; the `surfaces-on:` landing added a third unvalidated parameter to an existing hole rather than opening one. That is why it did not block its own landing.
- Precedent to copy: `constraints.mjs:65` already guards this exact field name for this exact reason, so the fix is a call, not a design.
- Related: [[a-wide-governs-glob-ripples-into-unrelated-literals]] — the same writer, a different way to get a wrong value into the store.
