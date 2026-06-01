# Security reports — atomic-writes-and-slug-hardening

## atomic-writes-and-slug-hardening-2026-06-01.md

# Security Review — atomic-writes-and-slug-hardening — 2026-06-01

## Summary

Risk: **LOW**. This change *is* a hardening batch (CWE-78 slug validation + CWE-362 atomic writes), and the fixes are sufficient and correct. One LOW note: slug validation lives at the `seed-tasklist.mjs` subprocess boundary, and other slug→path consumers rely on the slug originating from trusted main context rather than re-validating. No new dependencies.

## Findings

### [LOW] Slug validation is enforced at the seed-tasklist boundary only (defense-in-depth, not a hole)
- **OWASP**: A03 - Injection | **CWE**: CWE-78
- **File**: `.claude/skills/triage/seed-tasklist.mjs` (`runMaterialize`, `SLUG_RE = /^[a-z0-9][a-z0-9-]*$/`)
- **Evidence**:
  ```
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    process.stderr.write(`invalid slug '${slug}': must match ${SLUG_RE} ...`);
    process.exit(2);
  }
  ```
- **Assessment**: the regex is sufficient for the named vector — it rejects shell metacharacters (`;`, `|`, `&`, `$`, backtick, space), path traversal (`/` and `.` are not in the class, so `../x` and `/etc` fail), leading hyphen (first char must be `[a-z0-9]`), uppercase/underscore (`Foo_Bar` fails), the empty string, and non-string input. Confirmed RED→GREEN by `tests/atomic-writes-and-slug.test.mjs` (`a;rm`, `../x`, `Foo_Bar` rejected; `my-fix-1` accepted).
- **Impact**: bounded. The slug is NOT externally attacker-controlled in this single-developer tool — it originates from `/triage` (main context). Downstream consumers that interpolate the slug into state-file paths (e.g. `commit` stamp-closure, the `changelog --entries-file` path) read it from `workflow.json`, which `/triage` writes. The seed-tasklist guard is the documented subprocess boundary; the others inherit a trusted slug. So this is defense-in-depth, not an open injection path.
- **Recommendation**: optional future hardening — have `/triage` validate the slug with the same `SLUG_RE` before writing `workflow.json` (single source of the constraint), so a bad slug never reaches disk. Not required now; tracked-worthy only if slugs ever become externally supplied.

## Atomic writes (CWE-362) — verified correct, no finding

- `writeJsonAtomic(path, obj)` (`.claude/hooks/lib/common.mjs`) writes to `${path}.tmp.${process.pid}` in the **same directory** as the target, then `renameSync(tmp, path)`. Same-dir rename avoids the cross-device `EXDEV` failure mode (a `/tmp`→target rename would not be atomic); rename(2) is atomic on POSIX, so a crash can never expose a half-written file. On failure it unlinks the temp and rethrows (callers see the error rather than continuing on stale state).
- Applied at: `thread_store.writeJson` (cursor + candidate sidecars), `resume_transform.writeCache`, and inline in `src/cli/workflow-migrator.js` (`migrateWorkflowJsonInPlace`, via `fs/promises` `writeFile`+`rename`, same-dir temp). The migrator's `src/cli` copy and its build-synced `.claude/skills/harness/` mirror are byte-equal (verified).
- The pid-suffixed temp name avoids two concurrent writers clobbering each other's temp. No TOCTOU/symlink regression: the prior code did a direct `writeFileSync(path)` which followed a symlinked target identically; the new path is no worse and the rename replaces the target atomically.

## Dependencies

None added. No `package.json` change.

## Out of scope / Noted

- `grant-commit.md` 300s→900s is a documentation correction (the runtime TTL was already 900s); no security surface.

