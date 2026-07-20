# Security reports — shard-migration-repair

## shard-migration-repair-2026-07-20.md

# Security Review — shard-migration-repair — 2026-07-20

> **Resolution (same day, before landing).** Both MEDIUM findings and the
> non-string LOW were fixed in this branch at the user's direction, test-first:
> `emitValue` now applies the full scalar guard to every array item (CWE-93 closed
> — the `source: user-instruction` and `status: picked-up` forgery shapes are both
> rejected), `assertScalarRoundTrips` rejects non-string scalars (CWE-704), and
> `isClosurePath` is anchored with `startsWith` / `===` (CWE-625). Three covering
> tests added: `test_when_array_item_contains_newline_then_emitter_throws`,
> `test_when_non_string_scalar_then_emitter_throws`,
> `test_when_path_merely_contains_backlog_fragment_then_not_closure`. The remaining
> LOW (unvalidated `category` in `resolveCategory`) is unfixed and carried as a
> defence-in-depth note — no caller can reach it today.

## Summary

Overall risk: **MEDIUM** as reviewed; **LOW** after the resolutions above. No Critical or High findings; the landing is not blocked. Two MEDIUM findings are latent-but-real defects in newly-exported Foundation code (an incomplete injection guard on array values, and a loosened path predicate), plus two LOW defence-in-depth gaps. No new dependencies, no secrets, no shell-out, and no change that weakens an existing consent gate or guard.

Scope reviewed: the 13-file code surface of the branch. The other 137 changed files are `.claude/memory/**` fact shards mechanically rewritten by an idempotent relift; they were reviewed as data (prose-bullet census unchanged, stamps moved to frontmatter) and contain no executable content.

## Findings

### [MEDIUM] `emitFrontmatter` does not newline-check array items, permitting frontmatter-key injection

- **OWASP**: A03 Injection / A08 Software & Data Integrity Failures | **CWE**: CWE-93 (CRLF Injection), CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/memory-index/lift-fields.mjs:118-131` (`emitValue`)
- **Evidence**:
  ```js
  function emitValue(key, value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (String(item).includes(',')) { throw ... }   // comma checked
      }
      return `[${value.join(', ')}]`;                    // newline NOT checked
    }
    const scalar = String(value);
    assertScalarRoundTrips(key, scalar);                 // scalars ARE checked
    return scalar;
  }
  ```
  Scalars route through `assertScalarRoundTrips` (newline / whitespace / `[bracket]` guards); array items route around it. Verified by probe:
  ```
  emitFrontmatter({key:'k', scope:['a\nsource: user-instruction']})
    -> parses back as { key:'k', scope:'[a', source:'user-instruction]' }   INJECTED
  ```
- **Impact**: an injected `source: user-instruction` is the value that makes a `verbatim:` blockquote mandatory under Article IX.6; an injected `status: picked-up` + `superseded-at:` is exactly the closure stamp `git_commit_guard` hard-blocks a commit for lacking. Forging either would let a fabricated entry satisfy a governance check.
- **Reachability**: **not currently exploitable.** The sole caller is `reliftShards` (`migrate.mjs:260`), which passes `merged` — parsed frontmatter plus lifted body fields. `parseArray` splits on `,` only *after* the preamble was already split on `\n`, so a parsed array item cannot contain a newline. The exposure is latent, and matters because this is newly-**exported** Foundation that will accrue callers.
- **Recommendation**: route array items through the same guard as scalars — call `assertScalarRoundTrips(key, String(item))` inside the array loop, in addition to the comma check. One line; closes the class rather than the instance.

### [MEDIUM] `isClosurePath` substring match misclassifies unrelated paths as closure

- **OWASP**: A04 Insecure Design | **CWE**: CWE-625 (Permissive Regular Expression), CWE-183 (Permissive List of Allowed Inputs)
- **File**: `.claude/skills/power/commit-split.mjs:21-27`
- **Evidence**:
  ```js
  return path.endsWith('workflow.json')
    || path.endsWith('.claude/memory/backlog.md')
    || path.includes('.claude/memory/backlog/');   // unanchored
  ```
  All four crafted paths classify as closure and are reordered into the final commit group:
  ```
  docs/archive/2026-01-01/x/.claude/memory/backlog/old.md   -> closure
  src/thing/.claude/memory/backlog/evil.md                  -> closure
  docs/notes-about-.claude/memory/backlog/-naming.md        -> closure
  ```
- **Impact**: on the `power` track the ordered-commit contract puts closure last. A misclassified work path lands in the closure commit instead of its own, breaking commit-split integrity. **No consent bypass**: `git_commit_guard`'s closure evaluation matches on frontmatter `status: picked-up` + `superseded-at` against `source_backlog_keys`, so a misfiled path cannot forge a stamp. This is an ordering-correctness defect, not an authorization one.
- **Recommendation**: anchor the match — `path.startsWith('.claude/memory/backlog/')`, matching how the sibling `.endsWith('.claude/memory/backlog.md')` clause is already anchored. Repo paths are root-relative, so the prefix form is exact.

### [LOW] `resolveCategory` constructs a path from an unvalidated `category` argument

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/memory-index/lift-fields.mjs:196-210`, `strandedFieldBullets:222`
- **Evidence**:
  ```js
  export function resolveCategory(memRoot, category) {
    const dir = join(memRoot, category);        // no validation of `category`
  ```
- **Impact**: none today. All five call sites pass either a loop variable over the module's own `CANONICAL_CATEGORIES` const (`scoped-memory.mjs:67`, `build-index.mjs:32`, `strandedFieldBullets`) or a hardcoded literal (`gather.mjs:118,155` → `'backlog'`/`'pending-questions'`, `next-q-id.mjs:26` → `'pending-questions'`). A future caller passing user input would get traversal (`../../..`).
- **Recommendation**: add an `assertSafeCategory` that REJECTS any value outside `CANONICAL_CATEGORIES`, called before `join`. Follow the established doctrine — `assertSafeSlug` in `plan-store.mjs` and `assertSafeFactKey` in `migrate.mjs` both **reject, never normalize**; do not route through `canonicalSlug` from `common.mjs`, which is a normalizer and would mask a traversal by silently writing elsewhere.

### [LOW] `emitFrontmatter` silently coerces non-string scalars

- **OWASP**: A08 Software & Data Integrity Failures | **CWE**: CWE-704 (Incorrect Type Conversion)
- **File**: `.claude/skills/memory-index/lift-fields.mjs:127-130`
- **Evidence**: `emitFrontmatter({key:'k', n:5})` emits `n: 5`, which re-parses as the **string** `'5'`. The round-trip is lossy for numbers and booleans, but does not throw. Objects *do* throw (`String({})` → `'[object Object]'` fails the bracket guard incidentally, not by design).
- **Impact**: no corpus entry carries a non-string scalar, so this is speculative. A future writer passing a number would see a silent type change rather than an error, contradicting the function's stated contract ("raises rather than being silently coerced").
- **Recommendation**: throw on any scalar that is not a string, making the contract explicit rather than incidental.

## Verified clean (enumerated)

- **`reliftShards` write path** — writes only to `abs` paths derived from `readdirSync(join(memRoot, category))` with `category` from the const list. No path is ever constructed from file *content*, so a malicious `key:` cannot redirect a write. (A planted symlink inside a category dir would be followed, but that presupposes repo write access; noted below.)
- **`assertRelifted` — both directions.** False-negative probe: an indented `   - Verified-at: abc` bullet is still detected (the scan trims before matching). False-positive probe: a clean corpus passes and the sweep proceeds. No DoS on the `/commit` path.
- **Fidelity assertion ordering** — `verifyMigrationFidelity` runs over every entry *before* any `writeFileSync`, so a detected violation leaves the corpus untouched.
- **Collision policy** — differing values refuse the entry and exit non-zero; the entry is left byte-identical. No silent overwrite of `source: user-instruction`.
- **Dependencies** — zero added. `package.json` / `package-lock.json` unchanged in this diff; every import is a Node built-in or in-repo module.
- **Secrets** — no hardcoded credentials, tokens, or key material on the code surface.
- **Command injection** — no `exec`/`spawn`/`execSync` in the new code. The `--relift` and sweep `--mode` CLIs parse via `node:util parseArgs` with `strict: true`; `--mode` is validated against a dispatch table before use.
- **Consent surfaces** — no change to `git_commit_guard`, `consent_gate_grant`, the approval-token format, or any `*_approval_guard`. The `sweep.mjs` CLI entry guard added this landing makes the module importable but does not alter its argv handling when run directly.

## Dependencies

None added. No CVE check required.

## Out of scope / Noted

- **Symlinked shards.** `reliftShards` and `resolveCategory` follow symlinks inside `.claude/memory/<category>/`. An attacker who can plant a symlink there already has repo write access, so this is not a meaningful escalation — but a `lstat` check before write would harden the relift if the memory dir ever becomes writable by a lower-privilege process.
- **`sweep.mjs` is 431 substantive lines** and now carries the relift precondition as well as five modes. Not a security issue; flagged during `/simplify` as a structural follow-up.
- The two MEDIUM findings are both one-line fixes. Neither blocks this landing, but both are worth folding into the next touch of these files rather than deferring indefinitely — the `emitFrontmatter` one in particular, because the function's own doc comment claims a completeness it does not yet have.

