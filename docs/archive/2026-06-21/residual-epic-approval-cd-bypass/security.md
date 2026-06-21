# Security reports — residual-epic-approval-cd-bypass

## residual-epic-approval-cd-bypass-2026-06-21.md

# Security Review — residual-epic-approval-cd-bypass — 2026-06-21

## Summary
Risk: **LOW**. This change is itself a security control that closes the documented residual `cd`/`pushd`-into-dir bypass left after `-abad` (MEDIUM, OWASP A04 / CWE-862). `track_guard.epicInheritanceSatisfied` now derives an epic-child's discovery-skip authorization from the unforgeable `spec_approvals/<epic>.approval` token instead of the forgeable `approved: true` boolean. The change is a strict improvement: the read surface no longer trusts any value a Bash write can forge, and the prior write-surface detectors are left intact as defense-in-depth. No new exposure introduced.

## What was checked
- Full branch diff: `.claude/hooks/track_guard.mjs` (+9/−4, single function). Test-only changes in `tests/track-guard-epic-child.test.mjs` and `tests/epic-approval-guard.test.mjs` (AC-006 regression guard reframed to the new contract).
- Confirmed the write-surface controls are UNTOUCHED (defense-in-depth preserved): `git diff HEAD` is empty for `epic_approval_guard.mjs`, `destructive_cmd_guard.mjs`, and `lib/common.mjs` (`writesEpicApproval`).
- Read-surface bypass closure, empirically via the test suite: forged `approved:true` with no token → DENY (AC-001/AC-004); token present + `approved` false/absent → ALLOW (AC-003); missing/unparseable epic state → DENY (AC-005).
- Token slug-matching: the token path is keyed on `state.epic` (`spec_approvals/${epic}.approval`); a child must also resolve the epic state file and all three pins, binding it to that epic's genuine artifacts.
- Full serial suite: 1012 tests, 998 pass / 0 fail / 14 skipped.

## Findings

No Critical / High / Medium findings. One LOW (Noted), one positive observation.

### [LOW] Cross-epic approval inheritance is unchanged (pre-existing, not a regression)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-862
- **File**: `.claude/hooks/track_guard.mjs:50` (`epicInheritanceSatisfied`)
- **Evidence**:
  ```js
  const approvalToken = join(STATE_DIR, 'spec_approvals', `${epic}.approval`);
  if (!existsSync(approvalToken)) return false;
  ```
- **Impact**: A child workflow could declare `epic: "<some-other-legitimately-approved-epic>"` and inherit that epic's discovery-skip, provided the child's pinned scout/research/spec also resolve. This property is identical under the prior `approved:true` design — the discriminator simply moved from the (forgeable) flag to the (unforgeable) token, so it is neither introduced nor worsened here. The child remains bound to a real, approved epic's artifacts via the pin-resolution check.
- **Recommendation**: Accept as pre-existing. If ever tightened, the cleanest anchor is to also verify the child's `slice` exists in the named epic's `slices[]`; out of scope for this residual-closure work and not required by the spec.

## Dependencies
None added. Pure Node stdlib (`node:fs` `existsSync`/`readFileSync`, `node:path` `join`) — no new CVE surface.

## Out of scope / Noted
- **Positive: the read surface is now the authoritative gate.** With authorization derived from the token, the write-surface detectors (`epic_approval_guard` on the Write tool, `writesEpicApproval` on Bash) become belt-and-suspenders rather than load-bearing — exactly the "durable fix" the prior `-abad` finding recommended. A forged flag (by any write vector, including the `cd`-relative form that evades the Bash detector) is now inert, because the flag is never read for authorization.
- **The two accepted LOW items from the `-abad` review** (content-var-assembly of the literal `approved` token; finite write-verb allowlist) are subsumed by this change for the read path: both concern forging the flag, which no longer grants authorization. They remain accepted on the write-surface detectors per the non-goals.
- **No revocation semantics** exist for the durable token (consistent with `epic_approval_guard`'s no-TTL design); `approved:false` + token-present resolving to ALLOW is intended (AC-003), since the token is the durable authority.

