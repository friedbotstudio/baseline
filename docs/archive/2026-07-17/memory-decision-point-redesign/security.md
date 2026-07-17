# Security reports — memory-decision-point-redesign

## memory-decision-point-redesign-2026-07-17.md

# Security Review — memory-decision-point-redesign — 2026-07-17

## Summary

Overall risk: **LOW**. The change adds local dev-tooling that reads and writes markdown files under `.claude/memory/` — no network trust boundary, no auth surface, no secrets, no new dependencies. The one security-relevant surface (constructing filesystem paths from fact keys) is correctly guarded with a REJECT-never-normalize validator. No CRITICAL, HIGH, or MEDIUM findings.

## What was checked

- **A01 Broken Access Control** — n/a (no access-control surface; local tooling).
- **A03 Injection / CWE-22 Path Traversal** — the only user-influenced path input is a fact key derived from a `## heading`. Reviewed every `join()` write site in `migrate.mjs` (lines 91, 120) and the read sites in `build-index.mjs` / `scoped-memory.mjs`.
- **A04 Insecure Design** — reviewed the migrator's destructive steps (source-file removal) for data-loss safety.
- **A06 Vulnerable Components** — `package.json` unchanged in the diff → no new packages → no CVE surface.
- **Secrets hygiene** — grepped the diff; no tokens, keys, or `.env` content.
- **ReDoS** — reviewed the `parseFrontmatter` regex.

## Findings

### [LOW] Migrator removes source files after migration (by design)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-1188 (informational)
- **File**: `.claude/skills/memory-index/migrate.mjs:97,121`
- **Evidence**:
  ```
  verifyMigrationFidelity(perCategory);
  for (const { flat } of migrated) rmSync(flat);        // line 97 — only AFTER fidelity passes
  ...
  rmSync(dir, { recursive: true, force: true });        // line 121 — reverse: removes category dir
  ```
- **Impact**: An operator running `migrate.mjs --root <wrong-path>` could delete `.md` files under that root. This is operator-invoked local tooling, not a remote-reachable path.
- **Recommendation**: None required — the design is already defensive: `verifyMigrationFidelity` throws (`MigrationFidelityError`) *before* any source removal, so a count mismatch aborts with zero data loss. The rollout keeps the feature behind `memory.sharded_store.enabled` (default off), so live invocation is gated. Acceptable as-is.

### [LOW] Fact-key validator is REJECT-never-normalize (positive finding)
- **OWASP**: A03 - Injection | **CWE**: CWE-22 (correctly mitigated)
- **File**: `.claude/skills/memory-index/migrate.mjs:31-40`
- **Evidence**:
  ```
  const SAFE_KEY = /^[a-z0-9][a-z0-9-]*$/;
  export function assertSafeFactKey(key) {
    if (typeof key !== 'string' || !SAFE_KEY.test(key))
      throw new Error(`unsafe fact key (REJECT, never normalize): ...`);
    return key;
  }
  ```
- **Impact**: Prevents `../`, absolute paths, and separators in keys from reaching `join()` — a traversal write is rejected, not silently rewritten to a different path.
- **Recommendation**: None — this matches the repo landmine (`canonicalSlug` is a normalizer, not a validator; normalizing here would MASK a traversal). Correctly implemented and covered by `tests/memory-migrate.test.mjs → test_when_key_has_traversal_then_rejected`.

### [LOW] parseFrontmatter regex — no ReDoS
- **OWASP**: A03 | **CWE**: CWE-1333 (not present)
- **File**: `.claude/hooks/lib/frontmatter-parser.mjs`
- **Evidence**: `/^---\n([\s\S]*?)\n---\n?/` — a single lazy group anchored at start; linear, no nested quantifiers. Operates on trusted local files.
- **Recommendation**: None.

## Dependencies

No new packages — `package.json` is unchanged in the diff. `npm audit` surface unchanged.

## Out of scope / Noted

- **Deferred hook wiring.** The live activation (`process_lifecycle_guard` → `scoped-memory`, `memory_session_start` → `build-index`) is not wired in this diff; it stays behind the default-off `memory.sharded_store.enabled` flag. When that wiring lands, re-review the guard's handling of the Write/Edit `tool_input.file_path` value (a new trust-boundary input) — surfacing scoped memory must not itself read attacker-influenced paths outside `.claude/memory/`.
- The CLI `--root` arguments (`build-index.mjs`, `migrate.mjs`) trust the invoking operator; this is consistent with every other `.claude/skills/**` helper in the repo.

