# Security reports — gate-taxonomy

## gate-taxonomy-2026-07-16.md

# Security Review — gate-taxonomy (C6) — 2026-07-16

## Summary
One HIGH-severity defect was found **and resolved during this review** (a prototype-key fail-safe bypass).
At landing there are **no open CRITICAL/HIGH/MEDIUM findings**. Residual risk: **LOW**. The module is a
pure, advisory-only classifier with zero dependency surface and no runtime caller.

## Findings

No open CRITICAL, HIGH, or MEDIUM findings at landing. The HIGH defect found mid-review is documented
under *Resolved during this review* below, with its fix, regression test, and re-verification.

## Resolved during this review

### (was HIGH) Fail-safe bypass via prototype-chain property access on caller-controlled `kind`
- **OWASP**: A04 - Insecure Design (fail-safe defeated) | **CWE**: CWE-1321 (Improperly Controlled
  Modification of Object Prototype Attributes) / CWE-20 (Improper Input Validation)
- **File**: `.claude/hooks/lib/gate-taxonomy.mjs` (classifyOperation rule lookup)
- **Evidence** (pre-fix): `OP_KIND_RULES[kind]` reached inherited `Object.prototype` members on a
  caller-controlled key:
  ```
  classifyOperation({kind:'constructor'})    => {}                  (not a verdict)
  classifyOperation({kind:'toString'})       => "[object Undefined]" (a string)
  classifyOperation({kind:'hasOwnProperty'}) => TypeError thrown    (broke totality)
  ```
- **Impact**: C6's core invariant is that anything unrecognized resolves to `ask`. For `kind` values that
  are `Object.prototype` method names, the fail-safe was bypassed — a future autonomous caller checking
  `verdict === 'ask'` could proceed on an operation that should have required a human. HIGH (would be
  CRITICAL with a live gating caller; advisory-only + no live caller capped immediate blast radius).
- **Fix (applied + verified)**: own-property guard on the lookup —
  `const rule = kind && Object.hasOwn(OP_KIND_RULES, kind) ? OP_KIND_RULES[kind] : undefined;` — so every
  prototype-collision key falls through to the fail-safe `ask` and totality is restored. Post-fix probe:
  ```
  constructor / toString / hasOwnProperty / __proto__ / valueOf
    => {verdict:'ask', category:null, reason:"unknown operation kind '<k>' — fail-safe ask"}
  ```
  Regression test `test_when_prototype_key_kind_then_ask_no_throw` added to `tests/gate-taxonomy.test.mjs`;
  full suite re-run 1717 pass / 0 fail.

## Dependencies
No new packages. The module imports nothing — zero dependency surface.

## Out of scope / Noted
- **Advisory-only confirmed**: no file in `.claude/hooks/**` or `.claude/skills/**` imports
  `gate-taxonomy.mjs` (tests excluded), so it cannot alter any gate/guard enforcement — consistent with
  AC-006, confirmed at runtime by the full guard/gate suite passing unchanged (1717/0 at `/integrate`).
- **No injection/path/regex surface**: classifies caller-supplied `kind` strings via a frozen lookup
  table; no filesystem, process, or regex construction. The only tainted-key concern (prototype access)
  is closed above.
- **Frozen exports**: `CATEGORIES` and `CONSENT_POINT_MAP` are `Object.freeze`d — a consumer cannot
  mutate the taxonomy at runtime.

