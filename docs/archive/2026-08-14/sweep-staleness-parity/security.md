# Security reports — sweep-staleness-parity

## sweep-staleness-parity-2026-08-14.md

# Security Review — main — 2026-08-14

## Summary

Overall risk: **LOW**. The diff is 34 lines across two files and is net-subtractive: it deletes a
duplicated copy of the memory category sets from `sweep.mjs` and imports the registry that already
governs the session-start hook. It adds no dependency, no network call, no crypto, no secret, and no
new subprocess. Two observations are recorded below; neither blocks. The change does widen one
module's public surface and does grant the sweep new delete reach over a category it previously
could not see — both are the intended effect of the fix, and both are named here so they are
decisions rather than side effects.

## Findings

### [LOW] The shared decay sets are mutable module-level singletons

- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-1329 (reliance on a
  component that is modifiable at runtime)
- **File**: `.claude/skills/memory-index/categories.mjs:39-41`
- **Evidence**:
  ```js
  export const CANONICAL = Object.freeze([ ... ]);   // frozen

  export const STALE_EXEMPT = new Set(['backlog']);        // NOT frozen
  export const SUPERSESSION_DRIVEN = new Set(['decisions']); // NOT frozen
  ```
- **Impact**: `Object.freeze` on a `Set` does not prevent `.add()` / `.delete()`, and these two are
  unfrozen regardless. Any in-process module can call `STALE_EXEMPT.add('decisions')` and silently
  change the decay policy for **every** consumer at once. Before this change the sweep held a private
  copy, so such a mutation reached one reader; it now reaches the sweep and the session-start hook
  together. There is no path from external input to a mutation — the reachable callers are the hook,
  the sweep and the test suite — so this is a robustness and blast-radius observation, not an
  exploitable defect. It is raised because `CANONICAL` in the same file is deliberately frozen, so
  the inconsistency reads as an oversight rather than a decision.
- **Recommendation**: keep the two `Set`s module-private and export membership predicates
  (`isStaleExempt(name)`, `isSupersessionDriven(name)`) instead. Freezing is not sufficient on its
  own — `Object.freeze(new Set([...]))` still permits `.add()`. Deferred deliberately: it widens the
  change beyond this workflow's scope, and the registry's existing consumers already share the
  objects.

### [LOW] Auto-close gains delete authority over `constraints`

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-284 (improper access control) — observational
- **File**: `.claude/skills/memory-sync/sweep.mjs:266-269`
- **Evidence**:
  ```js
  for (const name of CANONICAL) {      // was CANONICAL_FILES, which omitted `constraints`
    ...
    newText = deleteBlock(newText, block);
  ```
- **Impact**: `CANONICAL` carries eight categories where the deleted local list carried seven, so
  every sweep mode now walks `constraints`. In `auto-close` that means a constraint entry carrying a
  valid `superseded-at:` will be **deleted** on the next `/memory-sync`. Previously no sweep mode
  could reach that category at all, so such entries were effectively immortal. This is the intended
  half of the fix — `categories.mjs` decision B3 places `constraints` in neither exempt set precisely
  because it is mutable and re-verifiable — but it is new destructive reach and is named as such.
- **Recommendation**: none required. Measured on the live store: **zero** constraint entries
  currently carry `superseded-at:`, so the first sweep after this lands deletes nothing. Re-check
  after any workflow that closes a constraint.

## Checked and clean

Enumerated rather than asserted:

- **Command injection (CWE-78)** — `commitDistance` is the only subprocess reached by the newly
  exported `isStale`. It calls `spawnSync('git', ['-C', root, 'rev-list', '--count', `${stamp}..HEAD`])`
  with an argument array and no shell, so a hostile `verified-at:` frontmatter value cannot inject a
  command. Argument injection is also closed: the value is always suffixed `..HEAD`, so it can never
  present as a bare flag, and a non-revision value yields a non-zero status which the caller maps to
  `null`.
- **Path traversal (CWE-22)** — `readFile(memdir, name)` takes `name` from the frozen `CANONICAL`
  literal array, never from input. The category vocabulary widened by one literal; its provenance did
  not change.
- **Newly exported surface** — `isStale` is now exported from both modules. It is a pure predicate:
  no writes, no network, and its only side effect is the read-only `git rev-list` above. Exporting it
  is what makes the two predicates comparable at all; keeping it private is what allowed them to
  diverge unobserved for the period this workflow measured.
- **`$`-injection regressions** — the four guarded sites (`sweep.mjs` stamp-closure, stale-sweep
  re-verify, stale-sweep mark-closed, backlog-decay) are untouched by this diff and their regression
  tests remain green.
- **Secrets** — no token, key, credential or `.env` reference added.
- **Dependencies** — none added; `package.json` untouched.

## Dependencies

No new packages. `package.json` and `package-lock.json` are not in this diff.

## Out of scope / Noted

- `sweep.mjs`'s `commitDistance` does not suppress git's stderr, while the hook's identical helper
  passes `stdio: ['ignore', 'pipe', 'ignore']` and wraps the call in `try/catch`. A repository error
  therefore prints to the console from one path and is swallowed by the other. Pre-existing on both
  sides and not introduced here; worth a chore if the noise is ever observed.
- `invariantFieldFor` remains local to `sweep.mjs` because `categories.mjs` exports no equivalent and
  no other module needs it. Left deliberately rather than exported for symmetry.

