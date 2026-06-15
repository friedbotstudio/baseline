# Security reports — gitignore-setup

## gitignore-setup-2026-06-15.md

# Security Review — gitignore-setup — 2026-06-15

## Summary

Overall risk: **LOW**. The feature adds a PreToolUse hook, a generation skill, a shipped data file, an install merge helper, a `project.json` key, and a governance cascade. No new dependency, no crypto, no secrets, no shell-string command construction. The one network surface (gitignore.io) is enrichment-only, main-context, fixed-host, with an offline fallback; the commit guard is fully offline. Findings are LOW and mostly coverage/defense-in-depth notes.

## Findings

### [LOW] Must-ignore matching is case-sensitive and coverage-bounded
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-178 (Improper Handling of Case Sensitivity) / CWE-693 (Protection Mechanism Failure)
- **File**: `.claude/hooks/gitignore_leak_guard.mjs:33-46` (`matchesPattern`)
- **Evidence**:
  ```
  return path === pattern || basename(path) === pattern || path.endsWith(`/${pattern}`);
  ```
- **Impact**: The guard blocks a staged secret only if its path matches a pattern in the baseline set ∪ `project.json` extras. A secret whose name isn't covered (e.g. `id_rsa`, `credentials.json`) or differs by case (`.Env` vs `.env`) is not blocked. This is a coverage limit of a defense-in-depth control, not a bypass of an existing protection — git/gitignore are themselves case-sensitive, so the behavior is consistent with how the repo would treat those paths.
- **Recommendation**: Keep the baseline set broad for secret categories (`.env`, `.env*`, `*.pem` are present) and document that high-risk repos extend `project.json → gitignore.extra_must_ignore`. No code change required; the control is intentionally explicit (Decision A/B forbid heuristic auto-classification). Optionally add `*.key`, `id_rsa*` to the baseline set in a follow-up if broader secret coverage is wanted.

### [LOW] glob→regex builder could backtrack on a pathological repo-owned pattern
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **File**: `.claude/hooks/gitignore_leak_guard.mjs:48-51` (`globMatch`)
- **Evidence**:
  ```
  const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
  ```
- **Impact**: Adjacent `*` wildcards compile to adjacent `[^/]*` which can backtrack. The patterns come only from the shipped baseline data and `project.json` (both repo-owned, not external/attacker input), so this is theoretical. Inputs are short path strings, bounding cost further.
- **Recommendation**: No change needed given the trust boundary (repo-owned config). If `extra_must_ignore` ever accepted untrusted input, cap pattern length / collapse consecutive `*`.

### [LOW] gitignore.io enrichment sends type tokens to a fixed external host
- **OWASP**: A10 - SSRF | **CWE**: CWE-918
- **File**: `.claude/skills/gitignore/SKILL.md` (enrichment step)
- **Impact**: The skill fetches `https://www.toptal.com/developers/gitignore/api/<types>`. Host is fixed; only the type tokens vary and are appended to the path. The fetch is main-context (Claude-driven WebFetch), enrichment-only, with an offline fallback to the vendored baseline. No automated/unattended request, no credentials sent.
- **Recommendation**: None required. The commit guard and install path never touch the network (Decision B), so the security-relevant gate is fully offline.

## Dependencies

No npm packages added or upgraded. gitignore.io is an external HTTP service (no package, no lockfile entry) used only by the skill's optional enrichment. `npm audit` not applicable (no dependency delta).

## Out of scope / Noted

- The commit guard **fails closed** on an inspection error for an unambiguous `git commit` (`gitignore_leak_guard.mjs:78-82`), the secure default — it denies rather than allows when it cannot verify. It fails *open* only when the baseline data file is absent (the feature is simply not installed), which is acceptable.
- `git` is invoked exclusively via `execFileSync('git', [..fixed args..])` with no shell, so untrusted path/pattern values cannot inject commands (A03 not applicable).
- `materializeGitignore` reads the shipped baseline JSON and writes `.gitignore` add-only; no `eval`, no shell, no overwrite of existing content.
- The guard composes with `git_commit_guard` on the same Bash boundary; neither masks the other (both independent denials).

