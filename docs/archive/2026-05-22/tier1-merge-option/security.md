# Security reports — tier1-merge-option

## tier1-merge-option-2026-05-22.md

# Security Review — tier1-merge-option — 2026-05-22

## Summary

Overall risk: **LOW**. The diff replaces the tier-1 "Show diff" option with "Merge" + a BASE-less stage path, extends the SessionStart hook with a presence-gated stage nag, and restructures `/upgrade-project` SKILL.md. The new code reuses existing helpers (`writeStageArtifact`, `appendToStageManifest`) and inherits their pre-existing trust boundaries — **no new attack surface** is introduced. The change actually adds two defense-in-depth items: a `NEEDS_USER_INPUT` branch for malformed `base_sha256` values in the reconciler, and reuse of the existing rel-validation constraint at reconciliation time. No CRITICAL or HIGH findings.

## Findings

### [LOW] `rel` path-traversal in `writeStageBaseless` (inherited; documented mitigation)
- **OWASP**: A08 Software & Data Integrity Failures | **CWE**: CWE-22 (Path Traversal)
- **File**: `src/cli/upgrade-tiers.js:99-104`, `src/cli/upgrade-tiers.js:238-242`
- **Evidence**:
  ```
  export async function writeStageBaseless(ctx, rel, incomingBuf, localBuf) {
    const stageDir = await ensureStageDir(ctx);
    await writeStageArtifact(stageDir, `${rel}.baseline-incoming`, incomingBuf);
    await appendToStageManifest(stageDir, ctx, rel, null, incomingBuf, localBuf);
  }
  async function writeStageArtifact(stageDir, rel, bytes) {
    const dst = join(stageDir, rel);
    ...
  ```
- **Impact**: A `rel` value containing `../` could redirect the staged artifact outside `stageDir`. In practice the writer never receives such a value: `rel` flows from `threeWayMerge`'s `allPaths` set, which is the union of `oldManifest.files` + `newManifest.files` keys. The new manifest is built by `build-manifest.mjs` from the shipped template tree (CLI-controlled); the old manifest is the consumer's own `.baseline-manifest.json` written by a prior install. Reaching the writer with a malicious `rel` requires either compromising the shipped manifest (supply-chain attack — out of scope of this diff) or a malicious local `.baseline-manifest.json` (the user owns this file). This is the **same risk surface as the existing `writeStage`** (tier-3) — not introduced by this workflow.
- **Recommendation**: No fix in this diff. The defense-in-depth check at the reconciler boundary remains binding: `.claude/skills/upgrade-project/SKILL.md:113` rejects path-traversing `rel` values as `NEEDS_USER_INPUT` with reason `path-traversal-rejected`. Add a writer-side defense in a follow-up only if the project decides to harden tier-3 too — they share the same code path.

### [LOW] Symlink redirection of staged writes (inherited; pre-existing surface)
- **OWASP**: A05 Security Misconfiguration | **CWE**: CWE-59 (Link Following)
- **File**: `src/cli/upgrade-tiers.js:105-111` (`ensureStageDir`) + `src/cli/upgrade-tiers.js:238-242` (`writeStageArtifact`)
- **Evidence**:
  ```
  async function ensureStageDir(ctx) {
    if (!ctx.stageRunTs) ctx.stageRunTs = stageTimestamp();
    const stageDir = join(ctx.target, '.claude/state/upgrade', ctx.stageRunTs);
    await mkdir(stageDir, { recursive: true });
    return stageDir;
  }
  ```
- **Impact**: An attacker with `.claude/state/` write access could pre-create `.claude/state/upgrade/<known-future-ts>/` as a symlink pointing outside the project tree. `mkdir(... { recursive: true })` is a no-op when the leaf exists, and the subsequent `writeFile(dst, bytes)` follows the symlink, allowing arbitrary file write within the user's filesystem permissions. **Exploitability is bounded by the attacker already having local write access to `.claude/state/`** — which means they can write arbitrary bytes there directly anyway. The threat model treats `.claude/state/` as trusted local state.
- **Recommendation**: No fix in this diff. The same pattern is used by `writeStage` (tier-3) today and was not flagged in the previous security review. If hardening is desired, add `O_NOFOLLOW` semantics via `fs.realpath(stageDir).startsWith(realpath(ctx.target))` after `mkdir`. Out of scope for this workflow.

### [LOW] Silent JSON-parse skip in SessionStart hook stage scan
- **OWASP**: A09 Security Logging & Monitoring Failures | **CWE**: CWE-755 (Improper Handling of Exceptional Conditions)
- **File**: `.claude/hooks/memory_session_start.sh:200-205`
- **Evidence**:
  ```python
  for stage_manifest in upgrade_root.glob('*/manifest.json'):
      try:
          with open(stage_manifest) as f:
              stage = json.load(f)
      except Exception:
          continue
  ```
- **Impact**: A malformed stage manifest is silently skipped, so the nag count may be inaccurate (off by the number of unparseable files). This is a **UX correctness** concern, not a security one — the hook is not a trust boundary and there is no security signal that an attacker could suppress by corrupting a manifest. The CLI and `/upgrade-project` independently validate the manifest at reconciliation time.
- **Recommendation**: No fix. Silent-skip is appropriate for a SessionStart hook (noisy errors degrade Claude Code's startup context). If observability is later desired, log a WARN line to `.claude/state/logs/memory_session_start.log` (the existing log surface) without changing the user-visible output.

### [LOW] Stage manifest tampering — malformed `base_sha256` discriminator
- **OWASP**: A04 Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/upgrade-project/SKILL.md:48-69` (classification preamble + sub-procedures)
- **Evidence**:
  ```
  2. **Per-entry classification** (binding). For each entry in the stage manifest...
     - If `entry.base_sha256` is a 64-hex string → **three-way reconciliation**...
     - If `entry.base_sha256` is `null` → **two-way reconciliation**...
     - Any other value → apply the `NEEDS_USER_INPUT` fallback with reason `malformed-base-sha256`.
  ```
- **Impact**: A local attacker with `.claude/state/` write access could tamper with a stage manifest's `base_sha256` to confuse the reconciler. The new classification preamble explicitly handles malformed values by routing to `NEEDS_USER_INPUT` instead of attempting reconciliation with a guessed branch. This is **new defense-in-depth added by this diff**, not a finding against it.
- **Recommendation**: No fix. The contract is documented and the test suite verifies the SKILL.md body declares the malformed-value branch (`tests/upgrade-project.test.mjs` extended `required[]` includes `classification`).

## Dependencies

No new packages in this diff. All edits use existing imports (`node:fs/promises`, `node:path`, `node:crypto`, `@clack/prompts`). The `libnpmpack` dependency (used by `resolveBase`) is unchanged.

## Out of scope / Noted

- **Tier-3 (`writeStage`) inherits the same path-traversal and symlink-following surface** as tier-1 (`writeStageBaseless`). Both paths share the underlying `writeStageArtifact` + `ensureStageDir` helpers. Future hardening should target both together via a single check.
- **`obj/template/.claude/manifest.json` integrity** is anchored by the build-time `scripts/build-manifest.mjs` SHA hash table and the `audit-baseline` skill's drift check. No new attack surface for this file in this diff.
- **CHANGELOG.md** is not yet updated (deferred to Phase 11.5 `/changelog` — by design, no security implication).
- **Removal of `src/cli/diff-render.js` + `tests/diff-render.test.mjs`** is a reduction in code surface (eliminates the LCS-diff renderer and its O(m×n) memory footprint per landmark caveat) — slight security positive.

## Decision

All findings are **LOW**. The diff inherits existing risk surface without expanding it and adds two defense-in-depth items. No CRITICAL/HIGH blockers.

