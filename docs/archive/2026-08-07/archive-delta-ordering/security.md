# Security reports — archive-delta-ordering

## archive-delta-ordering-2026-08-07.md

# Security Review — main (archive-delta-ordering) — 2026-08-07

## Summary

Overall risk: **LOW**. The diff adds one module-private helper and one boolean field to an existing module, reorders SOP prose, and appends three tests. No new dependency, no new export, no signature change, no new trust boundary. Both guards protecting this module family — `assertSafeSlug` at the entry point and `assertNoTraversal` inside the reader — are unchanged and still ordered ahead of every path construction. The one behavioural change to error handling moves in the fail-safe direction: a condition that was silently swallowed is now reported. `npm audit` reports 0 vulnerabilities.

## Findings

### [LOW] The new helper is reachable only after the slug guard, and constructs no path of its own

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/workspace/delta.mjs:278`, called at `:304`
- **Evidence**:
  ```js
  assertSafeSlug(slug, 'delta workflow slug');
  ...
  const { specText, specMissing } = readSpecText({ rootDir, slug });
  ```
- **Impact**: None reachable. Recorded because the change adds a call site that consumes a slug, which is the parameter this module family's prior review (`docs/security/durable-plan-slug-guard-2026-07-12.md`) identified as the traversal vector.
- **Recommendation**: No change. `assertSafeSlug` at `:293` still precedes the new call at `:304`, so `readSpecText` can never see a slug that failed the REJECT-never-repair check. The helper itself performs no `join` — it delegates to `resolveSpecPath` for the path and to `readSourceText` for the read, and `readSourceText` independently calls `assertNoTraversal(rel)` before its own `join` (`workspace/tree.mjs:33-34`). That is two independent guards on the same flow, and this change adds neither a bypass nor a third path.

### [LOW] A read error is now reported rather than silently swallowed

- **OWASP**: A09 - Security Logging and Monitoring Failures | **CWE**: CWE-390
- **File**: `.claude/skills/workspace/delta.mjs:278-285`
- **Evidence**:
  ```js
  const specText = readSourceText(rootDir, rel);
  return specText == null
    ? { specText: '', specMissing: true }
    : { specText, specMissing: false };
  ```
- **Impact**: Positive. Previously `readSourceText(...) ?? ''` collapsed a failed read into an empty string, and the resulting all-empty verdict was indistinguishable from a spec that declared no delta. An operator reading that verdict would conclude the corpus was verified when nothing had been read.
- **Recommendation**: No change. Note for future readers that `readSourceText` returns `null` for *both* a missing file and a caught read error (`tree.mjs:35-39` wraps `statSync`/`readFileSync` in a bare `catch`), so `specMissing: true` deliberately conflates "absent" with "unreadable". That conflation is correct for this consumer: both mean the table was not read, which is the single fact the flag exists to convey. No path, `errno`, or stack reaches the caller, so the flag discloses nothing beyond a boolean.

### [LOW] The flag-off early return reports `specMissing: false` without having looked

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-1188
- **File**: `.claude/skills/workspace/delta.mjs:291`
- **Evidence**:
  ```js
  // An opted-out project never looked for a spec, so it cannot report one missing.
  // `false` is the neutral value here, matching the empty arrays around it.
  if (!architectureMapEnabled({ rootDir })) return { ...nothingAtAll(), inputEmpty, specMissing: false };
  ```
- **Impact**: A consumer could in principle read `specMissing: false` on an opted-out project and infer "the spec was read and was clean", when in fact nothing was attempted. No shipped consumer does this — the field's only reader today is the human operator following `/archive` Step 3.
- **Recommendation**: No change now. `false` is the right neutral for the inert path: every other field in that return is also its empty value, and AC-014 pins the whole path as inert. The alternative (`true`) would assert a missing spec that was never sought, which is a stronger and equally unverified claim. If a future consumer branches on this field to make a gating decision, that consumer must check the flag state first — worth remembering rather than pre-solving.

## Dependencies

No new packages. `git diff HEAD -- package.json package-lock.json` is empty. `npm audit --omit=dev` reports **0 vulnerabilities**.

## What was checked

- OWASP A01–A10 against the diff. Only A01, A04 and A09 had any surface; all three are recorded above as LOW.
- Secrets hygiene: grep over added lines for `api_key` / `secret` / `token` / `password` / PEM headers. The single hit is the word "consent-token" inside SOP prose describing `spec_approvals/<slug>.approval` mtimes — a filename, not a credential.
- Trust boundaries: none introduced. No HTTP handler, CLI entrypoint, message consumer, or new file parser. `parseDelta` is unchanged and still receives a string.
- Path traversal: both guards re-read and confirmed in order — `assertSafeSlug` (`delta.mjs:293`) and `assertNoTraversal` (`tree.mjs:33`). Neither was modified, and the new helper adds no `join`.
- AuthN / AuthZ: no consent path, approval token, or guard is touched. The SOP reorder moves a verification step earlier in the same phase; it does not move anything across a consent gate.
- Cryptography: none added or changed.
- Error handling: reviewed the widened null branch specifically for false-negative risk. `readSourceText` already returned `null` on both the non-file and the caught-error paths, so the new branch changes only what the caller *reports*, never what it reads.

## Out of scope / Noted

- `.claude/skills/archive/SKILL.md` is instructional prose for the model, not executable code. Its reorder carries no runtime effect; the executable behaviour change is entirely in `delta.mjs`.
- Editing a baseline-owned `SKILL.md` trips the Article XII.3 manifest hash check by design. It was re-stamped via `npm run build`, and `audit-baseline` returns exit 0. That is drift detection working, not a finding.
- The prior report `docs/security/durable-plan-slug-guard-2026-07-12.md` remains the authoritative statement of this module family's slug-guard posture. Nothing in this diff alters it.

