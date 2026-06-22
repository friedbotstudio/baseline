# Security reports — spec-rollout-enforceability-review

## spec-rollout-enforceability-review-2026-06-22.md

# Security Review — spec-rollout-enforceability-review — 2026-06-22

## Summary

Overall risk: **LOW**. The change adds an oracle-bound spec-review checker, persists a merged fan-out verdict, and adds one read branch to the consent-critical `spec_approval_guard`. The guard change is **monotonic** — it can only add denials, never weaken the existing consent gate. One LOW path-handling finding (operator-trust model, matching existing precedent) and two informational notes. No CRITICAL/HIGH/MEDIUM. Proceed.

## Findings

### [LOW] slug-derived write path in persistVerdict (no traversal guard)
- **OWASP**: A01 Broken Access Control (path handling) | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/harness/checker-fanout.mjs:46`
- **Evidence**:
  ```js
  function persistVerdict(rootDir, slug, merged) {
    const out = join(rootDir, '.claude/state/checker-fanout', `${slug}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
  }
  ```
- **Impact**: A `slug` containing `../` or an absolute segment would write the verdict file outside the intended `checker-fanout/` dir. `slug` originates from `workflow.json` / the `run <slug>` CLI arg — operator-controlled, not network/attacker input. Identical property already exists and is accepted for `docs/specs/${slug}.md` (line 79) and `drift_check.mjs`'s `--slug` (documented LOW, operator trust model).
- **Recommendation**: Accept under the operator-trust model (consistent with the existing `--slug` precedent), OR add a one-line `canonicalSlug`-style guard rejecting `/` and `..` in `slug` at the CLI boundary if defense-in-depth is wanted. Non-blocking.

## Confirmed invariant (the requested high-scrutiny check)

`spec_approval_guard.mjs` — the new fan-out branch (lines 71–90) is **monotonic and fail-safe**:
- It executes **after** `validateConsentMarker(...)` (the unconditional consent control, line 47) and after the shippability `BLOCKED` check. The consent marker — the actual access-control primitive — is enforced before this branch is ever reached.
- The branch's only side effect is `emitBlock(...)` when `report.verdict === 'BLOCKED'`. There is no code path in which the fan-out branch causes an approval that would otherwise be denied. It can only **add** a denial.
- Absent or unparseable verdict file → falls through to `emitAllow()`. This "fail-open on the verdict file" is **not** a weakening of access control, because the verdict file is a secondary block layer, not the consent control. It matches the existing shippability branch (also `existsSync`-gated). A04 (insecure design) does not apply: nothing treats the verdict file as the consent gate.

## Informational notes (not findings)

- **`spec_approval_guard` block-message interpolation** — `f.message` / `f.check` from the verdict JSON are interpolated into the denial text. An actor who can write `.claude/state/checker-fanout/<slug>.json` controls that text, but the output is a *denial* message (blocks more, never approves) and such an actor already has local FS write access. No privilege gain. Trust model: local `.claude/state/` is operator-trusted, identical to the existing `spec-shippability/<slug>.json` the guard already reads.
- **`release.yml` Pages preflight** (`.github/workflows/release.yml`) — `gh api "repos/${{ github.repository }}/pages"` uses the GitHub-provided `github.repository` context (validated `owner/repo`, not user-injectable on a push-to-main trigger), string-compares `build_type`, and exits 1 on mismatch. `GH_TOKEN` is the job's `GITHUB_TOKEN` scoped by `permissions: pages: write`. No command injection, no SSRF (fixed GitHub API host). Clean.
- **`oracle.mjs`** — pure string/markdown parsing, no I/O, no `eval`. Regexes are simple anchored character classes with no catastrophic-backtracking shape. No injection surface.
- **`tier-dial.mjs`** — pure data registration (a new profile key). No security surface.

## Dependencies

No new packages. All new code is stdlib-only Node ESM. The only external call (`gh api`) uses the GitHub CLI already present in the Actions runner.

## Out of scope / Noted

- The fan-out verdict file is now a consent-adjacent artifact the approval guard reads. If the threat model ever expands to untrusted local writers of `.claude/state/`, both this file and the existing `spec-shippability/<slug>.json` would need integrity protection (e.g., a signed/HMAC'd verdict). That is a baseline-wide design question, not specific to this change.

