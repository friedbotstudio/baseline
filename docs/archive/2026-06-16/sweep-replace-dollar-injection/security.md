# Security reports — sweep-replace-dollar-injection

## sweep-replace-dollar-injection-2026-06-16.md

# Security Review — sweep-replace-dollar-injection — 2026-06-16

## Summary
Overall risk: **LOW**. The diff adds a pure-string Foundation helper `replaceBlock(text, block, updated)` (literal `indexOf` + `slice`) to `.claude/skills/memory-flush/sweep.mjs` and swaps six `String.prototype.replace(block, updated)` call sites to use it. The change **closes** a data-integrity defect (A08) and introduces no new injection, path-traversal, argv, or DoS surface. This is a local-only dev helper that operates on `.claude/memory/*.md` files the user already controls; there is no network, auth, or untrusted-remote-input boundary in scope.

## Findings

### [LOW] (Resolved by this diff) `$`-pattern re-injection corrupted memory files
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-20 (Improper Input Handling of replacement string)
- **File**: `.claude/skills/memory-flush/sweep.mjs:140` (fix), formerly at the six `.replace(block, updated)` call sites
- **Evidence** (the fix):
  ```js
  function replaceBlock(text, block, updated) {
    const idx = text.indexOf(block);
    if (idx < 0) return text;
    return text.slice(0, idx) + updated + text.slice(idx + block.length);
  }
  ```
- **Impact**: Before the fix, `String.prototype.replace` with a string replacement interpreted `$\``, `$'`, `$&`, `$$`, `$n` patterns present in memory entry bodies (which legitimately contain shell snippets). On stale-sweep restamp / stamp-closure / backlog-decay, matched text was re-injected, duplicating entries and corrupting the file (observed: `landmarks.md` 64→214 entries). This is a self-inflicted integrity bug, not attacker-reachable — corruption requires the user to run a curation mode against their own memory files. Hence LOW.
- **Recommendation**: Already applied. `indexOf`/`slice` performs a positional splice and never interprets the replacement string. All six affected sites (modeStampClosure, applyStaleAction re-verify + mark-closed, modeBacklogDecay keep/drop/picked-up) now route through it. The class is fully closed; `deleteBlock` (the other block-mutation helper) was already splice-based.

## Verification of focus areas
- **Injection in `replaceBlock`**: none. `indexOf` is a literal substring search (no regex compilation); `slice` is index-based. No metacharacter interpretation on either input or replacement.
- **DoS / ReDoS**: none. Linear in string length, no regex, no backtracking. Bounded by file size (memory files are size-capped at 500 lines).
- **Path traversal / argv injection**: unchanged. The diff adds no IO, no `spawn`/`exec`, no `parseArgs`/path-join lines (confirmed by grep over added lines). CLI surface and `--memory-dir`/`--backlog-keys` handling are untouched.
- **First-occurrence semantics**: `indexOf` replaces only the first match — identical to the prior `String.replace(string)` semantics, and entry blocks are unique within a file, so no behavioral regression.

## Dependencies
None added. Pure Node stdlib (`String.prototype.indexOf`/`slice`).

## Out of scope / Noted
- Pre-existing LOW findings on `sweep.mjs` (CWE-22 slug path-traversal and CWE-78 argv quoting in `stamp-closure`, noted in `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md`) are unchanged by this diff — neither introduced nor worsened. They remain tracked carve-outs for a future hardening pass.

