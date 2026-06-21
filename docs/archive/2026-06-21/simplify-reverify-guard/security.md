# Security reports — simplify-reverify-guard

## simplify-reverify-guard-2026-06-21.md

# Security Review — simplify-reverify-guard — 2026-06-21

## Summary
Risk: **LOW**. The change adds one developer-local helper (`reverify-guard.mjs`) that fingerprints the dev's own working tree via `git` and reads untracked file contents, plus prose edits to `simplify/SKILL.md` and a unit test. There is no external or untrusted trust boundary — all inputs (the repo working tree, the internally-assigned workflow slug) originate inside the dev's own checkout. No secrets, network, auth, or cryptographic-security surface is introduced.

## Findings

### [LOW] Workflow slug flows into a file path without sanitization
- **OWASP**: A03 - Injection (path) | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/simplify/reverify-guard.mjs:50`
- **Evidence**:
  ```
  const fpPath = path.join(stateDir, `${slug}.fp`);
  ```
- **Impact**: A `slug` containing `../` or an absolute segment could direct `capture`'s `writeFileSync` outside `.claude/state/simplify/`. In practice `slug` is internally assigned by `/triage` (kebab-case, no separators) and never user-supplied at this boundary, so exploitation requires an already-compromised `workflow.json`.
- **Recommendation**: Optional hardening — reject a `slug` matching `/[/\\]|\.\./` before building `fpPath`. Deferred as LOW given the internal-only provenance; noted for the eventual oracle-bound-checker refit if this helper is ever reused with external input.

## Dependencies
No new packages. The helper imports only Node stdlib (`node:crypto`, `node:child_process`, `node:fs`, `node:path`, `node:url`). `execFileSync` is invoked with a fixed binary (`git`) and array args (no shell, no interpolation) — no command-injection surface.

## Out of scope / Noted
- `computeFingerprint` uses sha256 as a content-change fingerprint, not for authentication or integrity-against-an-adversary — collision resistance is irrelevant to the use case, and sha256 is strong regardless. Not a cryptographic-failure concern.
- `maxBuffer: 64 * 1024 * 1024` bounds `git diff` output; an oversized diff errors rather than exploits. Local-tool resource bound, not a security issue.
- The guard is **fail-safe**: any error or doubt yields exit 0 (re-verify), so a malfunction degrades to the pre-change behavior (always re-verify), never to a silent verification skip.

