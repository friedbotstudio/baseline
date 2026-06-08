# Security reports — standup-skill

## standup-skill-2026-06-08.md

# Security Review — standup-skill — 2026-06-08

## Summary

Overall risk: **LOW**. The standup change adds a read-only recap helper (`gather.mjs`) that shells out to `git` and parses local Markdown, plus a compact session-start surface. No Critical/High findings. `git` is invoked without a shell, all parsing is regex-only (no eval), all external reads degrade gracefully, and — importantly — the auto-injected session-start surface renders only **derived scalars** (counts, an enum bump, a version), never raw attacker-influenceable text. No new dependencies.

## Findings

### [LOW] Untrusted git/backlog content surfaced to the model on the on-demand path
- **OWASP**: A03 - Injection (LLM prompt-injection variant) | **CWE**: CWE-74
- **File**: `.claude/skills/standup/gather.mjs:35-58` (`collectRelease` → `commitsSinceTag[].subject`), and the on-demand `/standup` flow that reads the helper's JSON in main context
- **Evidence**:
  ```js
  const log = gitOut(rootDir, ['log', range, '--format=%H%x09%s']);
  const commitsSinceTag = (log ? log.split('\n').filter(Boolean) : []).map((line) =>
    describeCommit(line, rules),   // subject is carried verbatim
  );
  ```
- **Impact**: On a repository with attacker-authored commit messages or backlog entries, running `/standup` places that text into the model's context (the main-context recommendation reads the gather JSON). A crafted subject could attempt prompt injection. This is the same trust posture as running `git log` and is bounded to a repo the maintainer has chosen to operate in.
- **Recommendation**: Accept as LOW. The on-demand recap is explicitly maintainer-initiated on their own repo. Critically, the **automatic** session-start surface does **not** carry raw subjects (see Noted), so the unattended vector is already closed. No code change required; documented here for awareness.

### [LOW] Regex parsing over attacker-influenceable input — confirmed linear-time
- **OWASP**: A03 - Injection (ReDoS) | **CWE**: CWE-1333
- **File**: `.claude/skills/standup/gather.mjs:159` (`classifyCommit`), `:227-232` (`parseEntries`, `field`)
- **Evidence**:
  ```js
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:/.exec(subject || '');
  // field(): /^-?\s*status:\s*(\S+)/m  ·  parseEntries(): raw.split(/^##\s+/m)
  ```
- **Impact**: Commit subjects and backlog bodies are untrusted in a hostile repo and are fed to these regexes. None contain nested/overlapping quantifiers (`\w+`, `[^)]+`, `\S+`, `.+` are all single-pass over disjoint classes), so there is no catastrophic-backtracking ReDoS. Verified by inspection.
- **Recommendation**: No change. Noted to document that the ReDoS surface was reviewed and is linear.

## Dependencies

No new packages. The change uses only Node builtins (`node:child_process` `execFileSync`, `node:fs`, `node:path`, `node:url`) and the `git` CLI already required by the repo. A06 (vulnerable/outdated components): not applicable.

## Out of scope / Noted

- **A03 command injection — NOT present.** `gather.mjs` invokes git via `execFileSync('git', [argsArray], {cwd})` (`:202`), which passes arguments directly to `execvp` with **no shell**. Even a maliciously-named tag (e.g. `"; rm -rf"`) flows in as a single argv element to `git log <rev>..HEAD`; git treats it as a (likely invalid) revision and the call degrades via try/catch. There is no string concatenation into a shell command anywhere.
- **A08 data integrity — handled.** `JSON.parse` of `.releaserc.json` is wrapped in try/catch (`:148-153`) and returns `[]` on malformed config; a hostile/corrupt release config cannot crash the helper.
- **Resilience at session start (A04/A09).** `renderStandupSection` is wrapped in try/catch in `buildIndex` (`memory_session_start.mjs`), so any `gather` failure omits the Standup section rather than breaking session start. The section renders only `commitsSinceTag.length` (number), `aggregateBump` (enum), `upstream.state` (enum), and a tag-derived version string — **no raw commit subjects or backlog text** reach the auto-injected context, closing the unattended prompt-injection vector.
- **Path traversal — not present.** All file reads are `join(rootDir, <fixed relative path>)` with `rootDir` from trusted sources (CLI `--root` or the hook's `projectRoot`); no user-controlled path segments are concatenated.
- **Secrets hygiene — clean.** No hardcoded tokens/keys; the helper reads only repo-local files and git metadata.

