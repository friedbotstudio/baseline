# Security reports — epic-approved-bash-surface

## epic-approved-bash-surface-2026-06-21.md

# Security Review — epic-approved-bash-surface — 2026-06-21

## Summary
Risk: **MEDIUM**. The change is a security control itself — it closes the documented `echo '{"approved":true}' > .claude/state/epic/<slug>.json` Bash-write bypass of `epic_approval_guard` (backlog `-abad`). The fix is sound and a strict improvement: every direct write form (redirect, append, `tee`/`cp`/`mv`/`dd`/`sed -i`, programmatic `writeFileSync`/python-open, `$VAR`-indirected directory, `./`-prefixed and absolute paths) is now blocked, with no false-positive over-blocking of legitimate epic-state mutations. One **residual completeness gap of the same class** remains (a `cd`/`pushd`-into-dir write with a directory-relative filename), documented below as MEDIUM — it does not regress anything, and the durable fix is the read-side approval-derivation already tracked under `-abad` option (b).

## What was checked
- Full branch diff (`.claude/hooks/lib/common.mjs` +53, `.claude/hooks/destructive_cmd_guard.mjs` +13).
- Detector completeness vs. bypass vectors: alternate write verbs, quoting/escaping (single-quote, double-quote, shell-escaped `\"`), `$VAR` indirection of both the directory and the `approved` key, path-spelling (`./`, absolute, trailing-slash), `cd`/`pushd` relative writes, `rsync`/non-listed verbs.
- False-positive risk against every legitimate epic-state write path in the repo (`/triage` epic setup, harness post-gate-A flip, `commit/epic_close.mjs`, harness backstop).
- Parity with the sibling control `writesConsentPath` (the design baseline the change claims parity with).
- Empirical probing of the live `writesEpicApproval` against 8 crafted commands.
- Full serial test suite: 995 pass / 0 fail / 14 skipped.

## Findings

### [MEDIUM] Residual `cd`/`pushd`-into-dir bypass — directory-relative write evades the directory-anchored detector
- **OWASP**: A04 - Insecure Design (defense-in-depth completeness) | **CWE**: CWE-862 Missing Authorization
- **File**: `.claude/hooks/lib/common.mjs:741` (`EPIC_STATE_REF_RE`), `:742` (`EPIC_REDIRECT_RE`)
- **Evidence**:
  ```js
  const EPIC_STATE_REF_RE = /\.claude\/state\/epic\//;
  const EPIC_REDIRECT_RE = new RegExp("(?:>>?\\|?)\\s*['\"]?[^'\">\\s|;&]*?\\.claude/state/epic/");
  ```
  Empirically confirmed bypass (live function returns `false`):
  ```
  cd .claude/state/epic && echo '{"approved":true}' > foo.json     → got=false (NOT blocked)
  pushd .claude/state/epic;  echo '{"approved":true}' > foo.json    → got=false (NOT blocked)
  ```
- **Impact**: The detector's discriminator is the *directory* substring `.claude/state/epic/`. After a `cd`/`pushd` into that directory, the redirect target is a bare `<slug>.json` that carries no epic signal, and the `cd` argument (`.claude/state/epic`, no trailing slash) fails the `epic/` anchor — so a forged `approved:true` flip lands unblocked. `track_guard` then trusts the flag, letting an `epic-child` skip mandatory discovery (intake/scout/research/spec/approve-spec) without a real gate-A approval. This is the same access-control invariant the original `-abad` finding (MEDIUM, A04/CWE-862) defends; this is a residual of that class, not a new exposure.
- **Why parity does not hold here**: `writesConsentPath` is robust to the `cd`-into-dir form because its discriminator is a self-identifying basename (`commit_consent`, `*.approval`) that travels with the file regardless of CWD. The epic control discriminates on the directory while the filename (`<slug>.json`) is generic, so once CWD is inside the dir the write is signal-free.
- **Severity rationale**: The threat model is structural self-binding (the constrained actor is Claude/the harness, not an external attacker), and the bypass requires a deliberate, contrived `cd`+relative-write shaped specifically to evade the guard. The fix strictly improves the prior state (where *all* epic Bash writes bypassed). Hence MEDIUM, not HIGH.
- **Recommendation**: Track, do not block this workflow. Two options:
  1. **Durable (preferred)** — adopt `-abad` option (b) / research Candidate C: have `track_guard` re-derive approval from the persistent `spec_approvals/<slug>.approval` token at read time, eliminating the trusted boolean entirely. This closes the write surface *and* the read surface in one move and makes the Bash detector belt-and-suspenders rather than load-bearing.
  2. **Incremental** — broaden the detector to also flag a command that sets `approved:true`, has a write signal, and references `.claude/state/epic` via a `cd`/`pushd`/`-C`/`--directory` token (anchor on the directory reference without requiring the trailing slash on a redirect target). Carries a small over-block risk for reads performed after a `cd` into the dir; weigh against option 1.

  Append this residual to backlog `-abad` (it is the natural companion to the read-side-derivation work already noted there).

### [LOW] Content variable-assembly of the literal flip is out of scope (inherent to the Bash surface)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-862
- **File**: `.claude/hooks/lib/common.mjs:746` (`APPROVED_TRUE_RE`)
- **Evidence**: `V=true; echo '{"approved":'$V'}' > .claude/state/epic/foo.json` is not blocked — after naive `$V` expansion the text is `'{"approved":'true'}'`, and the intervening quote defeats `/"approved"\s*:\s*true\b/`.
- **Impact**: Low and inherent. The Bash surface only ever sees command text, never the materialized file; the *key* variable case (`K=approved; …$K…`) IS caught via expansion, only value-side concatenation across quotes is not. This matches the parity control (`writesConsentPath` likewise does not chase content-var-assembly) and matches `epic_approval_guard`'s own `hasApprovedTrue` regex shape. The Write-tool surface (which parses real content) remains the authoritative gate for non-Bash writes.
- **Recommendation**: Accept as a documented limitation. Subsumed entirely by the option-1 read-side derivation above.

### [LOW] Write-verb allowlist is finite (parity-equal with the consent control)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-862
- **File**: `.claude/hooks/lib/common.mjs:753` (`fragmentWritesEpicTarget` reuses `CONSENT_WRITE_VERB_RE`)
- **Evidence**: Verbs outside `tee|cp|mv|install|truncate|dd|ln` + `sed -i` + the programmatic set (e.g. `rsync dest`) are not treated as writes. `rsync /tmp/forged .claude/state/epic/foo.json` returns `false`.
- **Impact**: Low. Such a path needs a pre-forged source file already containing `approved:true`, and is identical to the gap the consent control accepts. Redirects (the common forge shape) are caught path-anchored regardless of verb.
- **Recommendation**: Accept (parity). Re-evaluate the shared verb list centrally if ever broadened for the consent control.

## Dependencies
None added. The change is pure Node stdlib + existing module internals (`expandWithEnv`, `resolveAssignments`, `executedFragments`, `COMMAND_START_ASSIGN_RE`, and the `CONSENT_*` verb regexes). No new packages → no CVE surface.

## Out of scope / Noted
- **No false positives (verified).** Every legitimate epic-state write in the repo is safe: `/triage` writes via the Write tool (and writes `approved:false`); the post-gate-A flip is the Write tool gated by `epic_approval_guard`; `commit/epic_close.mjs` and the harness backstop write via helper `.mjs` files invoked as `node <file> …`, so the Bash command string carries neither inline `"approved":true` nor an epic-path redirect — `writesEpicApproval` returns `false` for them (confirmed live). The block fires only on inline Bash forges.
- **Positive: indirection resistance works.** `D=.claude/state/epic; echo '{"approved":true}' > $D/foo.json` and the `node -e` shell-escaped `{\"approved\":true}` form are both correctly blocked — the `$VAR` expansion and the `\\?`-tolerant `APPROVED_TRUE_RE` carry their weight.
- **Defense-in-depth, not the sole gate.** This Bash detector is the second surface; the Write-tool `epic_approval_guard` remains the primary structural gate. The genuinely complete fix (read-side approval derivation) would retire the trusted boolean and make every write-surface detector secondary — recommended as the next step on `-abad`.

