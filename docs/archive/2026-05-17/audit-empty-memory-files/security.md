# Security reports — audit-empty-memory-files

## audit-empty-memory-files-2026-05-17.md

---
slug: audit-empty-memory-files
date: 2026-05-17
reviewer: claude (security skill)
base-branch: main
diff-size: 2 files, +77 / -7 (84 lines net)
---

# Security Review — audit-empty-memory-files — 2026-05-17

## Summary

**Overall risk: LOW.** The diff relaxes an internal self-audit assertion (the audit-baseline script) so canonical memory files with valid frontmatter but zero `## ` entries no longer FAIL the audit. The second file is `.claude/memory/backlog.md` content (5 new entries with user-verbatim blockquotes). No auth, network, data, cryptographic, secret, or runtime-execution surface is touched. No new dependencies. No new code paths that handle untrusted input.

## Findings

### [LOW] Relaxed self-audit may pass a partially-malformed memory file

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-345 (Insufficient Verification of Data Authenticity)
- **File**: `.claude/skills/audit-baseline/audit.sh:298-319`
- **Evidence**:
  ```python
  if not text.startswith("---"):
      add(f"memory shape: {name}.md", "FAIL", "missing frontmatter")
      continue
  if name == "_pending":
      add(f"memory shape: {name}.md", "PASS", "")
      continue
  body = text.split("---", 2)[-1]
  ...
  detail = f"{entry_count} entries" if entry_count > 0 else "empty (preamble-only)"
  add(f"memory shape: {name}.md", "PASS", detail)
  ```
- **Impact**: The audit passes when a canonical memory file has a *frontmatter-opening* `---` but no closing `---` (malformed YAML preamble). The threat model is bounded: an attacker with repo-write access can subvert the audit by other means (e.g. editing audit.sh itself, which the Article XI manifest-hash check would catch). Canonical memory file *contents* are not enumerated in `manifest.files` (only `src/memory/<name>.template.md` is), so this finding describes a slight reduction in self-consistency defense-in-depth, not an exploit primitive.
- **Recommendation**: Optional, non-blocking — strengthen the frontmatter check from `text.startswith("---")` to a stricter "opens with `---\n` AND has a matching `\n---\n` closer." This realizes the user's verbatim intent for *"proper preamble"* more literally. Defer to a follow-up if not bundled here.

## Dependencies

No new packages added. `package.json` and any lockfile are unchanged in this diff.

## Out of scope / Noted

- **Prereq deviation acknowledged.** The `security` skill's documented prereq names `simplify` in `completed`. This is a chore-track workflow where `simplify`'s conditional triggers did not fire (small single-file diff, no refactor moves) and `simplify` was added to `workflow.json → exceptions`. The Track Guard hook treats exceptions as satisfied; the security review proceeds. Backlog item `tdd-spec-implementation-drift-analysis-6086` overlaps with the broader concern of contract drift between phase skill prereqs and chore-track conditional skips, but that is a separate architectural item.
- **`backlog.md` user-verbatim blockquotes** were scanned for accidental credential/token leakage. Clean — five future-work intent sentences, no secrets, no key material, no internal URLs, no PII beyond first-person pronoun usage.
- **`obj/template/manifest.json` regeneration** during the chore (Article XI hash refresh) is a build-output side effect; `obj/` is gitignored and is not in the published diff. The mechanism (`scripts/build-manifest.mjs`) is unchanged.
- **No security linters configured.** `project.json → test.cmd` is `bash .claude/skills/audit-baseline/audit.sh` (structural drift check, not vulnerability scan). Adding `npm audit` or similar to the audit gate is a tracked follow-up (`docs/init/seed.md §14`), not blocking for this diff.

