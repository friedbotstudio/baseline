---
name: gitignore
owner: baseline
description: Generate or repair a project's .gitignore. Composes the baseline must-ignore set (the single source of truth in baseline-ignores.json) with optional gitignore.io enrichment, and merges add-only so existing entries are never lost. Use when a repo has no .gitignore, when the commit-leak guard reports a gap, or when onboarding a new stack. Trigger: "set up gitignore", "fix my gitignore", "ignore node_modules/secrets", "gitignore for <stack>".
argument-hint: "<optional comma-separated stacks, e.g. node,python,macos>"
---

# gitignore — generate and repair .gitignore

This skill produces a correct `.gitignore` for the current project. It runs in main context (Article II). It never blocks a commit — enforcement is the `gitignore_leak_guard` hook's job; this skill *repairs* what the guard flags.

## Source of truth

The canonical baseline must-ignore set lives at `.claude/skills/gitignore/baseline-ignores.json` (entries spanning `secret`, `state`, and `tooling` categories). Consumer-specific additions live in `project.json → gitignore.extra_must_ignore`. The same set is read by the install/init merge and by the `gitignore_leak_guard` hook, so the three never drift.

## Steps

1. **Read the baseline set** from `baseline-ignores.json` and the consumer extras from `project.json → gitignore.extra_must_ignore`. These are mandatory — they MUST end up in the final `.gitignore`.
2. **Optional enrichment via gitignore.io (network).** When the user names stacks (or you infer them from the repo), fetch language/IDE coverage from the gitignore.io service hosted at Toptal:
   - List available types: `GET https://www.toptal.com/developers/gitignore/api/list`
   - Generate for a comma-separated list: `GET https://www.toptal.com/developers/gitignore/api/<type1,type2,...>` (e.g. `node,macos,visualstudiocode`) → plain-text `.gitignore` body.
   Use WebFetch. This is enrichment only.
3. **Offline fallback.** If the network is unreachable or the service errors, skip enrichment and write the baseline set only, then tell the user the enrichment was skipped (offline fallback). The baseline correctness never depends on the network — the fallback path is the safety net, not an error.
4. **Merge add-only.** If a `.gitignore` already exists, never overwrite or reorder it. Append only the lines (baseline + enrichment) that are not already present, preserving the existing content byte-for-byte. If none exists, create it from the baseline (+ enrichment).
5. **Confirm.** Report which sources contributed (baseline always; gitignore.io types if reached; consumer extras) and whether the offline fallback was used.

## Constraints

- **Add-only.** Destroying or reordering a project's existing `.gitignore` entries is forbidden.
- **Baseline is non-negotiable.** Every baseline must-ignore entry ends up ignored, with or without enrichment.
- **No network on the critical path.** gitignore.io is enrichment; the offline fallback always produces a correct file.
- The commit-time guard (`gitignore_leak_guard`) reads the same set; keeping `baseline-ignores.json` current keeps generation and enforcement in lockstep.
