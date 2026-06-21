# Security reports — checker-graduation-fanout

## checker-graduation-fanout-2026-06-21.md

# Security Review — checker-graduation-fanout — 2026-06-21

## Summary

Risk: **LOW**. Six small mechanical ESM helpers (two oracle checkers, a fan-out merger, a bounded-round-trip assertion, an append-only ledger, a fail-closed gate) plus the ad-hoc `write-set-profile.mjs`/`spec-lint` fixes and the §II.A amendment. No Critical/High findings. All inputs are local repo files under the maintainer's own filesystem; no network, no untrusted remote input, no secrets, no crypto, no new dependencies. The gate's fail-closed property holds. **Clause-7(c) input: security clean** (this verdict is the `security_clean=true` the graduation gate consumed).

## Findings

### [LOW] Gate trusts a well-formed ledger's contents (integrity depends on FS access)
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-345
- **File**: `.claude/skills/harness/graduation-gate.mjs:14-37`
- **Evidence**:
  ```js
  if (!ledger || !Array.isArray(ledger.round_trips)) { return { pass: false, ... }; }
  const fpBlocks = ledger.round_trips.reduce((s, rt) => s + (Number(rt.false_positive_blocks) || 0), 0);
  ```
- **Impact**: Fail-closed on a malformed/missing ledger, but a *well-formed* ledger with ≥3 entries + `securityClean:true` evaluates `pass:true`. Forging that needs write access to `.claude/state/<slug>/ledger.json` — local FS access (already full compromise); the ledger is gitignored Tier-2 state written only by the harness.
- **Recommendation**: Accept for the baseline trust model. If this ever ingests untrusted evidence, add a per-round-trip schema check.

### [LOW] Detector completeness — a crafted spec can evade a block (false negative), not force one
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-184
- **File**: `.claude/skills/spec-diagram-review/oracle.mjs:24-37`, `.claude/skills/spec-traceability-review/oracle.mjs:30-37`
- **Impact**: An author could phrase an edge/AC-reference in a form the regex misses, evading a true-positive block. This is a false *negative* (missed defect), never a false-positive block — so it cannot threaten the gate's `false_positive_blocks==0` invariant.
- **Recommendation**: Out of scope this pass (relief valve defers some checks to ADVISORY). Broaden grammar in the follow-up.

## Dependencies

None added. Node stdlib only (`node:fs`, `node:path`). Cross-module imports (`tier-dial.mjs`, `oracle.mjs`) resolve to in-repo baseline-owned modules (in the manifest).

## ReDoS check (explicit focus area)

All regexes checked for catastrophic backtracking: the edge regex `\[([^\]]+)\]\s*-->\s*\[([^\]]+)\]`, the trace regex `intake\s+AC[\s-]?0*(\d+)`, and `write[_\s]set\*{0,2}\s*(?::|is\s)\s*(.+)$` are all single-quantifier/linear. DFS cycle detection is O(V+E). **No ReDoS / no algorithmic-complexity DoS.**

## Out of scope / Noted

- `evidence-ledger.mjs` writes under `.claude/state/<slug>/`; `slug` is maintainer-controlled (`workflow.json`). No traversal from untrusted input. If `slug` ever derives from untrusted input, validate `^[a-z0-9-]+$` before path-join.
- The §II.A amendment adds **no new declared subagent** (fan-out is workflow-runtime/script execution); `EXPECTED_AGENTS` and the seed subagent count are unchanged, verified by `audit-baseline` PASS.
- Clause-7(c) satisfied: **no Critical/High → security clean**.

