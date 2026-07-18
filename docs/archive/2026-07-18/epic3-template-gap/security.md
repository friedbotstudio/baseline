# Security reports — epic3-template-gap

## epic3-template-gap-2026-07-18.md

# Security Review — epic3-template-gap — 2026-07-18

## Summary
Risk: **LOW**. The diff mirrors enforcement-oracle config flags into the consumer
template and adds three pure, read-only helper functions to the audit script plus
a test. No trust boundary is introduced, no untrusted input is parsed, no secret,
auth, or crypto surface is touched, and no dependency is added. Enabling
`code_review` by default in the consumer template *strengthens* the default
security posture (it turns on the landing-blocking security/simplify/code-structure
fan-out for consumers) rather than weakening it.

## Findings

No CRITICAL, HIGH, or MEDIUM findings.

### [LOW] Recursive object diff has no explicit depth bound
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-674 (uncontrolled recursion)
- **File**: `.claude/skills/audit-baseline/audit.mjs` (`firstDiff`)
- **Evidence**:
  ```
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[key], b[key], prefix ? `${prefix}.${key}` : key);
    if (d) return d;
  }
  ```
- **Impact**: None in practice. Both inputs are the repo's own `project.json` /
  `project.template.json` velocity/swarm blocks — trusted, author-controlled,
  shallow (≤3 levels), non-cyclic config. There is no external caller and no
  attacker-supplied path into this function. A pathological deeply-nested input
  would recurse, but such input cannot reach here.
- **Recommendation**: Accept as-is (LOW). The `JSON.parse(JSON.stringify(...))`
  clone in `withoutPath` would already throw on a cyclic structure before diffing,
  so a cycle fails loud rather than looping. No change required.

## Dependencies
No new packages. `checkConfigParity`/`firstDiff`/`withoutPath` use only stdlib
(`JSON`, `Object`, `Set`) and the existing `readJson` helper.

## Out of scope / Noted
- `swarm.refuse_dirty_tree: true → false` in the template matches the live config
  and closes the Q-007 drift; it does not change any consumer's runtime security
  behavior (the flag only governs whether swarm-dispatch aborts on a dirty tree).
- Editing the baseline-owned `audit.mjs` changes its manifest hash; the audit's
  own integrity check (skill-ownership hash drift) re-passes after
  `npm run manifest:refresh`, handled in `/integrate`. This is an integrity
  self-check working as designed (A08), not a finding.

