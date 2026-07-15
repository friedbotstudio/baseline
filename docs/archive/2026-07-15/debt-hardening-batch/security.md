# Security reports — debt-hardening-batch

## debt-hardening-batch-2026-07-15.md

# Security Review — debt-hardening-batch — 2026-07-15

## Summary

Overall risk: **LOW**. Per-ticket review of a power batch (T1/T3/T5). No CRITICAL/HIGH/MEDIUM findings.
T1 is a net security *improvement* (adds a DoS guard). T3 and T5 touch only trusted, hardcoded, or
config inputs with no injectable trust boundary. No new dependencies, no secrets. No BLOCKER — batch proceeds.

## Per-ticket verdicts (power_batch_reviews)

| Ticket | Surface | Verdict | Highest severity |
|---|---|---|---|
| T1 | `.claude/skills/harness/plan-store.mjs` | CLEAN | LOW (improvement) |
| T3 | `.claude/hooks/lib/derived-header.mjs`, `.claude/skills/audit-baseline/audit.mjs` | CLEAN | LOW |
| T5 | `.claude/skills/standup/gather.mjs`, `project.json`, `src/project.template.json` | CLEAN | LOW |

## Findings

### [LOW] T1 — slug length bound strengthens the path guard (no issue)
- **OWASP**: A04 Insecure Design (defense-in-depth) | **CWE**: CWE-400 (resource exhaustion), CWE-22 (context)
- **File**: `.claude/skills/harness/plan-store.mjs:19-33`
- **Evidence**:
  ```
  if (slug.length > MAX_SLUG_LEN) {
    throw new Error(`plan-store: refusing to build a path from an over-long slug (length ${slug.length} > ${MAX_SLUG_LEN})`);
  }
  ```
- **Impact**: none introduced. Before this change an over-long (charset-valid) slug reached `writeFileSync`
  and surfaced a raw `ENAMETOOLONG`; the bound now rejects it with a named error before any path is built.
  The pre-existing `SLUG_RE` (`^[a-z0-9][a-z0-9-]*$`, linear — no ReDoS) + REJECT-never-normalize path
  guard (CWE-22) is unchanged; the length check runs after it and cannot be bypassed.
- **Recommendation**: none — this is the fix.

### [LOW] T3 — audit reads only a hardcoded exempt set; lib is pure
- **OWASP**: A03 Injection (not present) | **CWE**: CWE-22 (checked, not present)
- **File**: `.claude/skills/audit-baseline/audit.mjs` (`checkMirrorsUnstamped`), `.claude/hooks/lib/derived-header.mjs`
- **Evidence**: `checkMirrorsUnstamped` iterates the module constant `EXEMPT_RELPATHS` (four fixed repo-relative
  paths) and `readText(rel)` joins them under `ROOT`. `rel` is never caller/attacker input, so no traversal.
  `derived-header.mjs` is pure string/set logic (no fs, no exec, no regex-DoS).
- **Impact**: none — no injectable input reaches a path, command, or sink.
- **Recommendation**: none.

### [LOW] T5 — lenient config read is parse-safe and non-throwing
- **OWASP**: A08 Data Integrity / A05 Misconfiguration | **CWE**: CWE-20 (input validation)
- **File**: `.claude/skills/standup/gather.mjs` (`collectReleaseModel`)
- **Evidence**:
  ```
  const raw = readFileSafe(join(rootDir, '.claude/project.json'));
  if (raw) { try { const release = JSON.parse(raw).release; if (release && typeof release === 'object') return release; } catch { /* degraded */ } }
  degraded.push('no-release-model'); return null;
  ```
- **Impact**: none. `rootDir` is a trusted session/CLI param (same provenance as the existing `roadmapPathFor`
  read it mirrors). Malformed/missing JSON is caught → `null` + `no-release-model`, never a throw. The returned
  object is config data surfaced in the read-only recap, never merged into a prototype-reachable target
  (no prototype-pollution vector). Release-block values (`cicd_model`, branch names, cadence) are non-secret.
- **Recommendation**: none.

## Dependencies

No new packages in this diff. All three slices are Node stdlib only (`node:fs`, `node:path`) + config JSON.

## Out of scope / Noted

- `stampText` in `derived-header.mjs` has no production caller today (spec-committed mechanism, AC-201).
  It is a pure string function with no sink — no security surface. Noted for the record, not a finding.

