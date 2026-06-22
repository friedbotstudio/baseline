# Security reports — durable-plan-schema

## durable-plan-schema-2026-06-22.md

# Security Review — durable-plan-schema (-424f) — 2026-06-22

## Summary

Overall risk: **LOW**. The diff adds an internal, local-filesystem orchestration
primitive (the durable plan object) plus two additive consumer migrations. There is
no network surface, no authn/authz, no crypto, and no new dependency. The one finding
worth acting on is defense-in-depth slug-path hardening (MEDIUM, no current exploit
path because `slug` is developer-controlled). Tier is `regulated`, so the hardening is
recommended even absent a live attacker.

Checked: A01 (access control — n/a, local state), A03 (injection / path traversal —
finding 1), A04 (insecure design — finding 2, fail-open in the live gate-A path), A05
(misconfig — flag defaults), A06 (deps — none added), A08 (data integrity — JSON
parse, finding 3). Secrets scan: clean (no tokens/keys; no `.env` touched).

## Findings

### [MEDIUM] Unvalidated `slug` flows into durable state file paths

- **OWASP**: A03 Injection | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/harness/plan-store.mjs:12-13` (also `checker-fanout.mjs:57`, pre-existing)
- **Evidence**:
  ```js
  function planPath(slug, rootDir) {
    return join(rootDir ?? process.cwd(), '.claude', 'state', 'plan', `${slug}.json`);
  }
  ```
- **Impact**: a `slug` containing `..` or a path separator (e.g. `../../config`) would
  resolve `createPlan`/`readPlan`/`recordRevision` writes/reads outside
  `.claude/state/plan/`. In the current baseline `slug` is **developer-controlled**
  (derived by `/triage` from the request), so there is **no external-attacker path** —
  this is defense-in-depth, not a live vulnerability. But the plan object is intended to
  become a broadly-used v1 orchestration primitive; a future caller could pass a less
  trusted slug.
- **Recommendation**: add a one-line slug guard in `plan-store` (and reuse it in the
  checker-fanout/evidence-ledger projection writers): reject any slug that is not
  `/^[a-z0-9][a-z0-9-]*$/` (kebab-case, the existing slug convention) — throw before any
  path is constructed. Cheap, deterministic, no behavior change for valid slugs. Track as
  a small follow-up; not blocking.

### [LOW] Plan-mirror failure could fail-open the live checker-fanout verdict

- **OWASP**: A04 Insecure Design | **CWE**: CWE-703 (Improper Check/Handling of Exceptional Conditions)
- **File**: `.claude/skills/harness/checker-fanout.mjs:50-61`
- **Evidence**:
  ```js
  function persistVerdict(rootDir, slug, merged) {
    ... writeFileSync(out, ...) // projection (canonical) — written first
    mirrorVerdictToPlan(rootDir, slug, merged); // may throw on a plan write error
  }
  ```
- **Impact**: today this is a **no-op** in the gate-A path — at spec-review time no plan
  exists for the slug, so `mirrorVerdictToPlan` returns `null` (verified by
  `tests/checker-fanout-migration.test.mjs`). The projection (which `spec_approval_guard`
  reads) is written *before* the mirror, so the gate's input is intact regardless. Once a
  plan exists (post-wiring), a filesystem error in the mirror would throw out of
  `persistVerdict` → `runCheckerFanout` → caught by `runCli` as fail-open `skipped`. The
  real verdict was already computed and projected, so the gate is safe, but the fan-out
  would report `skipped` spuriously.
- **Recommendation**: wrap the `mirrorVerdictToPlan` call in `persistVerdict` in a
  try/catch that swallows mirror errors (the projection is canonical) — so a durable-plan
  write hiccup never perturbs the verdict path. One line; LOW priority.

### [LOW] `JSON.parse` of on-disk plan state

- **OWASP**: A08 Software & Data Integrity | **CWE**: CWE-1321 (Prototype Pollution, evaluated)
- **File**: `.claude/skills/harness/plan-store.mjs:96` (`readPlan`)
- **Evidence**:
  ```js
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  ```
- **Impact**: the parsed plan is later `structuredClone`d and spread (`recordRevision`).
  Evaluated for prototype pollution: `JSON.parse` materializes a `__proto__` key as an
  **own** property (not a prototype mutation), and neither `structuredClone` nor object
  spread promotes an own `__proto__` to the prototype chain — so no pollution path exists.
  The plan file is tool-written local state (trust boundary = local FS), not external
  input. `readPlan` is already resilient (returns `null` on parse error, never throws).
  No action required; recorded for completeness.

## Dependencies

No new packages. The diff uses Node stdlib only (`node:fs`, `node:path`, `structuredClone`).
`npm audit` surface unchanged.

## Out of scope / Noted

- The `checker-fanout.mjs:57` projection-path slug usage is **pre-existing** (not
  introduced by this diff); the slug guard in finding 1 should cover it when implemented.
- `plan-wiring.mjs` fail-open gate (`isPlanWiringEnabled` catches all errors → `false`) is
  the correct fail-safe posture — a broken/missing config disables plan writes rather than
  crashing the loop. Verified by `tests/plan-harness-wiring.test.mjs`.

