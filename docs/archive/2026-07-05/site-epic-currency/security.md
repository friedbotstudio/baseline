# Security reports — site-epic-currency

## site-epic-currency-2026-07-05.md

# Security Review — main (site-epic-currency working tree) — 2026-07-05

## Summary

The diff widens the publish gate's executable-allowlist by two template prefixes, rewrites a governance test's allow-anchor, and edits public-site content plus a runbook. Overall risk: **LOW** — the allowlist widening is prefix-scoped and regression-guarded; no new dependencies, no injection surfaces, no secrets.

## Findings

### [LOW] Executable-allowlist widening admits any future file under the posture prefixes
- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-183
- **File**: scripts/check-files-diff.mjs:41
- **Evidence**:
  ```js
  /^obj\/template\/\.githooks\//,
  /^obj\/template\/scripts\/ci\//,
  ```
- **Impact**: a file that later lands under `obj/template/scripts/ci/` ships executable without a files-diff complaint. Mitigated three ways: build Stage 2.6 copies a fixed three-file list (nothing else reaches that prefix), the template-payload purity test enumerates required posture artifacts, and the new regression test asserts rogue paths (`obj/template/rogue.sh`, `obj/template/docs/init/rogue.sh`) stay uncovered. The widening is prefix-scoped, never a blanket `obj/template/` allowance.
- **Recommendation**: none required now; if the posture set grows, keep the copies list in build Stage 2.6 explicit rather than switching to a directory copy.

### [LOW] Content-anchored governance allowlist tolerates a crafted narrative phrase
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-1025
- **File**: tests/governance-no-python3-runtime.test.mjs:29
- **Evidence**:
  ```js
  const HISTORICAL_NARRATIVE = /(bash|`\.sh`)\s*\+\s*`?python3`?/;
  ```
- **Impact**: a seed.md line like "requires bash + python3 at runtime" would pass the anchor. Speculative — this is a doc-consistency check, not a security boundary; the prior line-number pin had the mirror-image weakness (any content at the pinned line passed) plus the brittleness that broke it. The negative cases in the test pin the common runtime-requirement phrasings.
- **Recommendation**: accepted; the test's own negative-case block is the guard to extend if a bypass phrasing ever appears.

## What was checked

- Injection (A03): site edits are static markup/prose; no new script tags, event handlers, or external resource loads; SVG additions are text/rect elements with static attributes.
- Secrets hygiene: no tokens or keys anywhere in the diff.
- Integrity (A08): the allowlist widening above; the docsite-flag-coverage test adds a read-only subset assertion (no new privileged path).
- Supply chain (A06): no dependency changes; `npm audit --omit=dev` was clean this session.
- The upcoming `power` chip makes no shipped-capability claim: it renders with an explicit SPEC'D tag and the track is not listed in `workflows.jsonl` or `workflows.njk`.

## Dependencies

None added or updated.

## Out of scope / Noted

- The auto-merge classify-checkout hardening (MEDIUM from the slice-j review) remains tracked at `backlog.md → auto-merge-classify-checkout-base-sha-hardening-6836`; untouched by this diff.

