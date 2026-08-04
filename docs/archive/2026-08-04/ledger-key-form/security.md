# Security reports — ledger-key-form

## ledger-key-form-2026-08-05.md

# Security Review — main (ledger-key-form) — 2026-08-05

## Summary

Overall risk: **LOW**. The change adds a shape predicate on discard-ledger keys and routes `memory_stop`'s three key constructions through a shared builder. It **strictly narrows** what can enter the suppression set that silences future memory candidates — measured: zero key shapes newly admitted — and the prior F-3 CR/LF guard is preserved, unreordered, and still the first authority on newline keys. One new output sink (a stderr refusal line carrying the rejected key) is introduced; `JSON.stringify` neutralises every C0 control character, leaving only a LOW-severity bidi/zero-width terminal-spoofing residue. No new dependencies.

## Findings

### [LOW] Refusal line echoes bidi and zero-width characters unescaped to stderr

- **OWASP**: A09 – Security Logging and Monitoring Failures | **CWE**: CWE-117 (Improper Output Neutralization for Logs), CWE-1007 (Insufficient Visual Distinction of Homoglyphs)
- **File**: `.claude/skills/memory-flush/ledger.mjs:84-90`
- **Evidence**:
  ```js
  if (!isCandidateKey(key)) {
    process.stderr.write(
      `ledger: refused key ${JSON.stringify(key)} — expected the full '## CANDIDATE:' header form, `
      + `e.g. "<path>${CANDIDATE_SEPARATOR}landmarks.md" or "backlog${CANDIDATE_SEPARATOR}<slug>". `
      + `A key in any other shape records a row that suppresses nothing.\n`,
    );
    return false;
  }
  ```
- **Impact**: The refused `key` is partly attacker-influenceable — candidate keys derive from repository file paths and from `deriveKey()` over transcript text, so hostile content pasted into a session or a hostile filename can reach this line. `JSON.stringify` escapes all C0 controls (verified: ESC → ``, BEL → ``, `\n`, `\r`), so ANSI-escape injection and line-splitting are **not** possible. Characters above U+0020 pass through raw, so `U+202E` (RTL override) and `U+200B` (zero-width space) survive and can visually reorder or hide part of the refusal line in a terminal. The ceiling is cosmetic deception of a developer reading stderr; no row is written, no control flow changes, and the process is a local dev tool with no privilege boundary.
- **Recommendation**: If tightened later, strip or escape non-ASCII control-category code points (`/\p{Cf}/gu`) before interpolation, e.g. `JSON.stringify(key).replace(/\p{Cf}/gu, (c) => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0'))`. Accepting as-is is reasonable: the same class of unescaped text already flows through `_pending.md` bodies and every other diagnostic in this subsystem, so fixing it only here buys little.

## Verified, no finding

The four questions the caller raised, each checked against running code rather than by reading:

1. **F-3 CR/LF guard intact and still first.** `if (/[\r\n]/.test(String(key))) return false;` (`ledger.mjs:81`) precedes the new `isCandidateKey` branch. Probed directly: a key containing `\n` returns `false` and emits **nothing** to stderr, proving it is refused at the F-3 guard before the key-form guard is reached. The new guard is additive, not a replacement. `isCandidateKey` also independently rejects `[\r\n]`, so the predicate is safe to call from any future site — defense in depth, not a second authority.
2. **Suppression set strictly narrows.** `decidedKeys()` feeds `memory_stop`'s `existingKeys`, so any key in it silences a matching future candidate. Comparing the old predicate (truthy and no CR/LF) against `isCandidateKey` across eight representative shapes: **0 keys newly admitted**; four previously-accepted shapes (`bare`, `" → b"`, `"a → "`, `"a→b"` with no spaces) are now refused. Narrowing is the safe direction — fewer strings can silence memory. No shape that `memory_stop` actually builds is excluded, which the coupling test `test_when_memory_stop_builds_keys_then_every_key_satisfies_is_candidate_key` pins mechanically.
3. **Unchanged `readLedger` is not a bypass.** It still parses the three pre-existing bare-key rows on disk. Those rows join `existingKeys` but can never match, because every key `memory_stop` compares against is built by `candidateKey()` and therefore carries the separator. They are inert by construction, not merely unused. Leaving the read path untouched is also what keeps the append-only file readable; hardening it would invalidate history without closing any path.
4. **Type confusion narrowed.** The F-3 check coerces via `String(key)` while `isCandidateKey` requires `typeof key === 'string'`. A non-string object whose `toString()` yields a separator-bearing value previously passed and would now be refused. Stricter, in the safe direction.

## Dependencies

No dependency change. `git diff HEAD -- package.json package-lock.json` is empty; runtime dependencies remain `{"@clack/prompts":"1.4.0"}`. The diff uses only `node:fs` and `node:path`, both already imported by the file. No security linter (`semgrep`, `bandit`, `npm audit` script) is configured in this project, so none was run — per the skill's constraint, none was installed.

## Out of scope / Noted

- **Direct writes to `_discard-ledger.md` remain unguarded.** Appending `- discarded :: <valid header key>` straight to the file would silence a real future candidate, bypassing `recordCuration` entirely. This requires local filesystem write access, at which point the whole `.claude/` tree is already compromised, and it is pre-existing rather than introduced here. Noted because the file's value is precisely that it is durable and gitignored — there is no review surface on its contents.
- **`candidateKey()` does not validate its inputs, and is now the natural place to.** A file path legally containing a newline (POSIX permits it) would produce a candidate key with an embedded newline, and the `## CANDIDATE: <key>` header written to `_pending.md` would span two lines; the header regex would then capture a truncated key. This behaviour is unchanged by this diff — the old template literals had the identical property — but the change creates a single chokepoint where a `/[\r\n]/` rejection on `left`/`right` would fix all three construction sites at once. Worth a follow-up, not a blocker.
- **The annotation added at `memory_stop.mjs:282` is a comment only** and carries no runtime behaviour; `@landmine:` markers are read by `scout`, never executed.

