---
key: consent-guard-precision-needs-target-anchoring-via-var-expansion
category: landmines
scope: [scout, spec, tdd, security, integrate]
---

- Path: `.claude/hooks/lib/common.mjs` → `writesConsentPath` / `resolveAssignments` / `expandWithEnv` / `fragmentWritesConsentTarget`.
- Trap: making `writesConsentPath` MORE PRECISE (stop false-blocking commands that merely READ a consent path while a write-verb targets elsewhere, e.g. `head .claude/state/commit_consent; git mv a b`) is deceptively dangerous: any "is a write-verb NEAR a consent ref" heuristic UNDER-BLOCKS variable indirection. The first attempt — per-fragment co-occurrence (consent ref + write signal in the SAME executed fragment) — passed its own tests but `/security` proved a HIGH bypass: `F=.claude/state/commit_consent; tee $F` puts the basename in the `F=` fragment and the verb in the `tee $F` fragment, so neither fragment co-occurs. `executedFragments` does NOT expand variables. Two separate quickfix shapes failed `/security` (this + the git-commit carve-out above) before the sound design landed.
- Mitigation: **expand-then-detect.** (1) `resolveAssignments(scan)` builds a `VAR→value` map left-to-right, expanding each value against the map so far (fixpoint, so `G=$F` inherits `F`). (2) `expandWithEnv` substitutes `$VAR`/`${VAR}` BEFORE detection, so `tee $F` becomes `tee .claude/state/commit_consent`. (3) the redirect check stays WHOLE-COMMAND (path-anchored; the `>|` clobber embeds a `|` that `splitShellSegments` splits, so a per-fragment redirect check misses it); verb/sed/prog checks run per executed fragment. Boundary (accepted): a consent path entering a var with NO literal basename (`X=$(...)`, `read X`, env, function args) is unreachable by any literal scanner — `tee $UNKNOWN` is allowed, same as the prior guard. General rule: **precision changes to a security guard are spec-entry territory, not quickfix** — write the exhaustive bypass matrix as the test plan and run `/security` against it. Regression: `tests/anchor-consent-write-target.test.mjs` (18-row matrix) + the 19-vector probe in the archived security report.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
