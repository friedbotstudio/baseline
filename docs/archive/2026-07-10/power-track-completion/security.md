# Security reports — power-track-completion

## power-track-completion-2026-07-09.md

# Security Review — power-track-completion — 2026-07-09

## Summary

Overall risk: **LOW**. The change registers a new `requires_config_flag` workflow-track precondition (`src/cli/workflows-validator-predicates.js`, a `security.sensitive_globs` surface) and wires a per-batch commit split into the consent-bearing `commit` skill. The track-selection fence is **fail-safe** — every malformed, empty, prototype-poisoned, or type-mismatched input resolves the predicate to `false`, so a track can never be made selectable when its operator flag is off. The commit split rides the existing **slug-scoped, TTL-bounded, fail-closed** consent path with no widening of the consent window. One **LOW** defense-in-depth finding (inherited-property read in the dot-path walk) and one informational note. No third-party dependency is introduced. No CRITICAL or HIGH findings.

## Findings

### [LOW] Dot-path walk reads inherited properties, not own-only

- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-1321 (Prototype Pollution / prototype-chain property access)
- **File**: `src/cli/workflows-validator-predicates.js:67-72`
- **Evidence**:
  ```js
  let cursor = projectJson;
  for (const segment of params.path.split('.')) {
    if (!isPlainObject(cursor)) return false;
    cursor = cursor[segment];        // reads inherited props via the prototype chain
  }
  return cursor === params.equals;
  ```
- **Impact**: If the Node process's `Object.prototype` is already polluted with an `enabled: true` (or the matching leaf key), `resolveConfigFlag({velocity:{power_mode:{}}}, {path:'velocity.power_mode.enabled', equals:true})` returns `true` and the `power` (or `org`) track becomes selectable despite the operator flag being unset — a track-fence bypass. **Not a live exploit**: the only production source of `projectJson` is `JSON.parse` of `project.json`, and `JSON.parse` materializes `__proto__` as an *own* key, never a prototype (verified) — so a hostile `project.json` cannot create the inherited property on its own. Reaching this state requires a pre-existing `Object.prototype` compromise elsewhere in the process, which is a strictly worse condition than a track-fence bypass. Hence LOW / defense-in-depth on a primitive the vision intends to be broadly reused.
- **Recommendation**: Guard each descent with an own-property check — `if (!isPlainObject(cursor) || !Object.hasOwn(cursor, segment)) return false;` before `cursor = cursor[segment];`. Verified this closes both prototype-read paths (`Object.prototype` pollution and `Object.create({enabled:true})`) while leaving the legitimate `enabled:true` path resolving `true`. One line; no behavior change for any valid config. Suitable as a fast-follow patch — it does not block this landing (a `## Test plan` boundary row already exercises the malformed-input surface; a dedicated proto-pollution regression test should ride the fix).

## Threat questions — answered

1. **Fence bypass / track privilege escalation** — **No (fail-safe).** Probed `__proto__.enabled`, `constructor.prototype.x`, `path` of `""` / `"."`, double-dot `a..b`, `equals` as object/array (the schema's scalar constraint is declarative only — D10 — so runtime must not rely on it), and a leaf `enabled` object. All resolve `false` except a genuine own-property scalar match. The single exception is the inherited-read LOW above, which needs a pre-existing proto compromise.
2. **Fail-open vs fail-safe** — **Fail-safe and total.** `resolveConfigFlag` never throws: verified against `null`/`undefined`/string/number/array `projectJson`, and `null`/`{}`/`{path:''}`/`{equals:true}` params. A throw inside triage's precondition evaluation was the specific worry (it could be caught and mis-read as "no preconditions") — it cannot happen.
3. **Untrusted `pred.path` / `pred.equals`** — Treated as untrusted (defense-in-depth). Hardening is the LOW finding; the current code already rejects non-string/empty `path` and non-scalar `equals`.
4. **Consent integrity of the commit split** — **Intact.** `decideCommitConsent` (`.claude/hooks/lib/consent-decision.mjs:44-66`) is **slug-scoped**: a token authorizes a commit only while `token.slug === workflow.json.slug`, AND `age <= commit_ttl_seconds` (900s), else fail-closed. So the N commits of a batch all ride one grant *only because they share the same live workflow slug* — a commit from a different workflow cannot land under this grant (slug mismatch → deny). Closure atomicity is enforced **independently** by `git_commit_guard` (`:290-296`, via `closure-check.mjs`): a staged closing `workflow.json` with non-empty `source_backlog_keys` must stage `backlog.md` with each key stamped in the SAME commit, so putting closure on the *final* commit cannot split it — the guard hard-blocks a split regardless of the skill prose.
5. **Security-phase self-integrity** — **Sound.** The new per-ticket section states verbatim that empty/missing `tickets[]` is "an error, not a pass: **yield**," and "Reviewing zero tickets and reporting clean would silently drop the phase." It cannot be read as clean-on-zero.
6. **Schema is not enforcement** — **Confirmed and correct.** No JSON-Schema engine runs at validate time (`workflows-validator.js` only checks `$schema` membership); the `allOf` if/then is documentation. The real gate is `validatePredicateParams`, called from I11 (`workflows-validator-invariants.js`), verified live to reject an `equals`-less declaration. Belt-and-suspenders: even if `resolveConfigFlag` were reached with never-validated params, it is total and fails safe.

## Dependencies

**None added.** This change is Node stdlib only (`Object.hasOwn`, `Array.prototype.split`, `JSON.parse`). No new package, no lockfile change, no CVE surface. Nothing to audit.

## Out of scope / Noted

- **Partial-landing under TTL expiry (informational, correct behavior).** If a `power` batch's commit series runs longer than `commit_ttl_seconds` (900s), `git_commit_guard` blocks the remaining commits mid-series (slug-mode TTL). Because the closure stamp lands on the *final* commit, no closure ever lands without consent — the failure is fail-*closed* and leaves the workflow re-grantable. The spec's own `## Test plan` anticipates this ("commit groups emitted while the consent TTL expires mid-series → remaining commits blocked; no partial closure stamp"). No change recommended; noted so an operator landing a very large batch knows to expect a possible mid-series re-grant.
- **Pre-existing template placeholder.** `.claude/skills/security/SKILL.md:60` contains `CWE-XXX` inside the findings-report *template* block — not introduced by this diff and not a code marker. Out of scope.
- The inherited-read LOW is filed as the follow-up hardening candidate; it is the only actionable item.

