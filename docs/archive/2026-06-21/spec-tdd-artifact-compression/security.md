# Security reports — spec-tdd-artifact-compression

## spec-tdd-artifact-compression-2026-06-21.md

# Security Review — spec-tdd-artifact-compression — 2026-06-21

## Summary

**Resolution (2026-06-21): both MEDIUM findings fixed in-workflow at the maintainer's direction** — see the per-finding RESOLVED notes. Residual risk after fixes: **LOW**.

Overall risk (as found): **MEDIUM**. Two MEDIUM findings, no HIGH/CRITICAL. The artifact-compression diff is internal harness tooling (threat model: constitutional self-binding — the constrained actor is Claude/the harness, not an external attacker), which bounds real-world impact. (1) The write_set→diagram-profile reduction is decoupled from `security.sensitive_globs`, so a change to a security-sensitive component (e.g. a hook) receives the *reduced* diagram set. (2) `resolvePointer` interpolates a caller-supplied `spec_slug` into a file path without confinement, permitting `../` traversal — currently latent (no production caller). Both have trivial fixes. No secrets, crypto, or new dependencies in the diff.

## Findings

### [MEDIUM] Diagram-profile reduction ignores `security.sensitive_globs`
- **OWASP**: A04 – Insecure Design | **CWE**: CWE-693 (Protection Mechanism Failure)
- **File**: `.claude/hooks/lib/write-set-profile.mjs:80-90` (resolver) + `.claude/project.json` (the `non-architectural` profile's `when`)
- **Evidence**:
  ```
  security.sensitive_globs : [".claude/hooks/**", ".claude/commands/**", "src/cli/**", "bin/**", "**/auth/**", "**/*.env*"]
  non-arch profile `when`  : [".claude/hooks/**", ".claude/skills/**", "docs/**", "*.md", ".claude/*.json"]
                              ^^^^^^^^^^^^^^^^^^ overlap
  ```
- **Impact**: A spec whose write_set is entirely under `.claude/hooks/**` (a security-sensitive surface per `sensitive_globs`) is classified `non-architectural` and required to carry only 4 diagrams instead of 6 — it loses the C4 Context + Container diagrams that document the security-relevant component's place in the system. The diagram guard is a *documentation-completeness* control, not a code gate, so this does not bypass `/security` or the spec-review skills; the effect is a thinner architectural review surface for exactly the components that most warrant one. Self-binding model bounds this to "Claude under-documents," not code execution.
- **Recommendation**: Force the full profile when the write_set intersects `security.sensitive_globs`. In `resolveProfile`, after extracting `writeSetPaths`, short-circuit to `fullSet()` if any path matches `projectGet('.security.sensitive_globs')` (reuse `matchesAnyGlob`). One condition; preserves the fail-open posture.
- **RESOLVED (2026-06-21)**: Implemented both halves — (a) `resolveProfile` now short-circuits to `fullSet()` when any write_set path matches `security.sensitive_globs` (`write-set-profile.mjs`, defense-in-depth for any future sensitive/profile overlap); (b) `.claude/hooks/**` removed from the `non-architectural` profile's `when` in `project.json`, so hook specs require all 6 diagrams. Only `.claude/skills/**`, `docs/**`, `*.md`, `.claude/*.json` reduce now. Covered by `test_when_writeset_hits_sensitive_glob_then_full_profile` + the updated `project-json-compression-keys` assertion. Maintainer chose "security-first" over feature breadth at review.

### [MEDIUM] `resolvePointer` path traversal via unbounded `spec_slug`
- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/tdd/resolve-pointer.mjs:24-30` (`readSpec`)
- **Evidence**:
  ```
  return await readFile(join(rootDir, 'docs/specs', `${specSlug}.md`), 'utf8');
  // probe: spec_slug = '../../../../etc/passwd'  ->  /etc/passwd.md   (escapes the repo)
  // (absolute '/etc/passwd' is neutralized by join; only literal ../ traversal works; .md suffix limits to *.md reads)
  ```
- **Impact**: A crafted pointer `{spec_slug: '../../../../etc/passwd', ...}` reads an arbitrary `*.md` file outside `docs/specs/`. Read-only, suffix-limited, and **latent** — no production code calls `resolvePointer` yet (only the `tdd/SKILL.md` doc reference); this bootstrap workflow still uses verbatim excerpts. In the self-binding model the input is Claude-authored, so this is defense-in-depth, but the fix is trivial and should land before a caller exists.
- **Recommendation**: Validate `spec_slug` against the repo's slug convention before path construction: `if (!/^[a-z0-9-]+$/.test(spec_slug)) throw new DanglingPointerError(...)`. That matches the kebab-case ≤40-char slug rule and structurally forecloses `..`, `/`, and null bytes. Optionally also resolve the final path and assert it stays under `join(rootDir, 'docs/specs')` (belt-and-suspenders).
- **RESOLVED (2026-06-21)**: `resolvePointer` now validates `spec_slug` against `/^[a-z0-9-]+$/` and throws `DanglingPointerError` before any file read (`resolve-pointer.mjs`). Covered by `test_when_resolvepointer_traversal_slug_then_rejected` (probes `../../../../etc/passwd`, `a/b`, `foo.bar`, `..`).

## Dependencies

No new packages in this diff. The two new modules are stdlib-only ESM (`node:fs/promises`, `node:path`). No CVE surface added.

## Out of scope / Noted

- **Default-ON shipping to consumers (LOW / informational, A05).** `artifacts.compression.enabled` defaults true (absent ⇒ true), so consumer installs inherit the reduced-diagram heuristic — and finding #1 — without opting in. Combined with #1, a consumer's security-sensitive spec silently gets fewer diagrams. The maintainer accepted default-on at gate-A review; folding finding #1's `sensitive_globs` guard in makes default-on materially safer. Kill-switch (`enabled:false`) is byte-identical to pre-feature.
- **ReDoS — checked, none.** The write_set extraction `/(write[_\s]set\s*:\s*(.+)$)/i` and the split `/[`,\s|]+/` are linear (no nested quantifiers); `globToRegex` maps `**`→`.*`, `*`→`[^/]*` with no catastrophic-backtracking construct; `profile.when` globs are config (trusted), tested paths are short. No ReDoS.
- **Fail-open is correct here.** `resolveProfile` returning the *full* (stricter) diagram set on any error is the safe default — an exception can only *raise* the requirement, never lower it. Verified the catch and every early-return path land on `fullSet()`.
- **No secrets, no crypto, no auth logic** in the diff.

