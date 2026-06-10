# Security reports — harden-epic-approved-flip

## harden-epic-approved-flip-2026-06-10.md

# Security Review — harden-epic-approved-flip — 2026-06-10

## Summary

The new `epic_approval_guard.mjs` is a forgery-resistance control: it gates the epic `approved: true` flip against the persistent, gate-A-derived `spec_approvals/<slug>.approval` token. The core control is **sound** — the transition detector is consistent with what `track_guard` reads, the token chain is genuinely unforgeable (it rests on `spec_approval_guard`, which blocks token self-writes on both the Write-tool and Bash surfaces), and slug→path injection is blocked by the `[^/]+` capture. Overall risk: **MEDIUM**, driven by one incomplete-mediation gap: the guard covers only the `Write|Edit|MultiEdit` tool surface, while a Bash redirect to the epic state file is unguarded and `track_guard` trusts the flag it would set. No CRITICAL/HIGH findings.

## Findings

### [MEDIUM] Bash redirect to the epic state file bypasses the guard
- **OWASP**: A04 Insecure Design (incomplete mediation) | **CWE**: CWE-862 Missing Authorization (alternate path)
- **File**: `.claude/hooks/epic_approval_guard.mjs:48` (tool scope) + `.claude/hooks/lib/common.mjs:524` (CONSENT_BASENAMES)
- **Evidence**:
  ```js
  // epic_approval_guard fires only on the file-write tools:
  if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();
  // CONSENT_BASENAMES (Bash-write detection) covers consent tokens but NOT epic state:
  // commit_consent|push_consent|*_grant|spec_approvals/|swarm_approvals/   <-- no .claude/state/epic/
  ```
- **Impact**: A `Bash` command such as `echo '{"approved":true,...}' > .claude/state/epic/<slug>.json` (or `tee`, `sed -i`, `node -e fs.writeFileSync`) sets `approved: true` without passing this guard. Because the spec deliberately leaves `track_guard`'s read side unchanged (it still trusts `es.approved === true`), a child would then skip discovery — the exact outcome the control exists to prevent. The harness SOP never does this (it flips via the Write tool, which IS gated), so the *documented* forgery path is covered; this is the *uncovered alternate* path.
- **Recommendation**: Mirror the consent-token Bash protection. Either (a) extend `CONSENT_BASENAMES` / `destructive_cmd_guard` to block Bash writes whose target resolves under `.claude/state/epic/` when they set `approved: true`, or (b) adopt research Candidate C (have `track_guard` re-derive approval from the persistent token at read time, eliminating the trusted boolean entirely). This is **scope-beyond-spec** (the approved ACs model the Write/Edit/MultiEdit surface), so the recommendation is a backlog follow-up rather than an in-workflow fix.

### [LOW] `currentApproved` read is not wrapped (TOCTOU/unreadable → uncaught throw)
- **OWASP**: A04 Insecure Design | **CWE**: CWE-754 Improper Check for Unusual Conditions
- **File**: `.claude/hooks/epic_approval_guard.mjs:62`
- **Evidence**:
  ```js
  const currentApproved = existsSync(file) ? hasApprovedTrue(readFileSync(file, 'utf8')) : false;
  ```
- **Impact**: If the file becomes unreadable between `existsSync` and `readFileSync` (race, permission), `readFileSync` throws uncaught; the hook exits non-zero with no decision JSON. Depending on the runtime's treatment of a crashed PreToolUse hook, this could fail open. Low likelihood (existsSync just passed).
- **Recommendation**: Wrap the read; on failure treat `currentApproved` as `false` — that direction is fail-**closed** (it forces the transition path, which requires the token). `computeProposedContent` already wraps its read this way (`common.mjs:264`).

### [LOW] Tool matcher omits `NotebookEdit`
- **OWASP**: A04 Insecure Design | **CWE**: CWE-863 Incorrect Authorization
- **File**: `.claude/settings.json` (matcher `Write|Edit|MultiEdit`) + guard tool list
- **Impact**: `NotebookEdit` is not gated. In practice it targets `.ipynb` cells, not a `.json` state file, so it cannot write the epic state — theoretical only. Noted for parity with `env_guard`, which includes `NotebookEdit`.
- **Recommendation**: Optional — add `NotebookEdit` to the matcher and tool list for defense-in-depth parity.

### [LOW] Slug collision with a same-named non-epic spec approval
- **OWASP**: A04 Insecure Design | **CWE**: CWE-639 Authorization Bypass Through User-Controlled Key
- **File**: `.claude/hooks/epic_approval_guard.mjs:65`
- **Impact**: The token namespace is shared (`spec_approvals/<slug>.approval`). If a non-epic workflow with the same slug was approved earlier, that token would authorize an epic flip of the same name. Requires a slug collision between an epic and a prior unrelated workflow — low in practice (slugs are descriptive and unique).
- **Recommendation**: Accept given slug uniqueness; if ever paranoid, bind the token to the spec content hash.

### [LOW] Lexical-only `canonicalRel` (repo-wide symlink/TOCTOU limitation)
- **OWASP**: A04 Insecure Design | **CWE**: CWE-59 Link Following
- **File**: `.claude/hooks/lib/common.mjs:136` (documented)
- **Impact**: `canonicalRel` does not resolve symlinks; a symlink swap of the epic path between check and write is theoretically possible. This is a documented, repo-wide limitation shared by every guard, already tracked in `seed.md` §669 hardening backlog. No epic-specific elevation.
- **Recommendation**: None specific to this change; inherits the repo-wide future hardening.

## Verified sound (no finding)
- **Transition detection ↔ read-side consistency**: `hasApprovedTrue` parses JSON top-level `approved === true`, falling back to a regex only on unparseable JSON. `track_guard` reads the same top-level field via `JSON.parse`. When JSON parses, both agree; when it doesn't, both treat it as not-approved. There is no state where the guard says "not a transition" while `track_guard` would honor `approved: true`. (AC-004/005 boundary.)
- **Token unforgeability (the chain)**: writes to `spec_approvals/*.approval` are blocked for Claude on the Write tool (`spec_approval_guard.mjs:42,44`) and on Bash (`CONSENT_BASENAMES` includes `spec_approvals/`). Confirmed Claude cannot create the token this guard depends on. (AC-003.)
- **Slug→path injection**: the capture `([^/]+)` forbids `/`, so `${slug}.approval` cannot traverse out of `spec_approvals/`; normalized rel removes `..` path segments before matching. (CWE-22 mitigated.)

## Dependencies
No new packages. The guard imports only Node stdlib (`node:fs`, `node:path`) and the in-repo `lib/common.mjs`. No CVE surface.

## Out of scope / Noted
- The MEDIUM Bash-write gap is the natural pairing for backlog `epic-close` / the read-side-derivation idea (research Candidate C). Recommend a backlog entry: "extend epic `approved` enforcement to the Bash write surface (parity with consent-token Bash protection)."

