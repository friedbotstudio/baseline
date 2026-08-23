# Security reports — epic-11-heading

## epic-11-heading-2026-08-23.md

# Security Review — main (epic-11-heading) — 2026-08-23

## Summary

Overall risk: **LOW**. The diff adds a heading-recompute pass to `roadmap-sync` and relocates a
test file. It introduces no new trust boundary, no new dependency, no network or process call, and
no credential handling. One LOW finding records a pre-existing content-mangling path that this
change makes reachable more often.

## What was checked

- `git diff HEAD` across 5 files, 125 insertions / 11 deletions.
- Trust boundaries in the diff: exactly one — `syncRoadmap` reads and writes a filesystem path
  derived from `project.json → roadmap.path`. Path resolution is unchanged by this diff:
  `resolveRoadmapPath` still rejects a non-string, an absolute path, and any path resolving outside
  the repo root (`sync.mjs:100-108`).
- Tainted-flow enumeration: the only external input the new code reads is the roadmap file's own
  text, which is repository-controlled.
- Injection surface (A03 / CWE-74): the new `epicNumbers` helper only reads. `promoteEpicHeading`
  writes via `heading.replace(scanner, wanted)`, where `wanted` is one of three frozen emoji
  constants — never attacker-derived and containing no `$` substitution token.
- ReDoS (CWE-1333): `LINE_RE` = `^##\s+Epic\s+(\d+)\s+—\s+(.+)$` is anchored with no nested
  quantifier and no alternation overlap; the status scanner is a 3-way literal alternation. Both are
  linear. The heal loop is O(epics x lines), 13 x ~200 on this repository's own roadmap.
- Secrets hygiene: no literal, no env read, no `.env` path in the diff.
- Dependencies: none added. `package.json` and the lockfile are untouched.
- Linters: this project configures no security linter (`project.json → lint.cmd` is null) and none
  was installed for this review.

## Findings

### [LOW] The heal pass rewrites a hand-forged heading's title emoji as well as its status

- **OWASP**: A08 — Software and Data Integrity Failures | **CWE**: CWE-74
- **File**: `.claude/skills/roadmap-sync/sync.mjs:210-218` (new loop), reaching
  `.claude/skills/roadmap-sync/sync.mjs:80-95` (`promoteEpicHeading`)
- **Evidence**:
  ```js
  if (heading.includes(wanted) && (heading.match(statusEmojiScanner()) || []).length === 1) {
    return { text, changed: false, status };
  }
  lines[headingIdx] = heading.replace(statusEmojiScanner(), wanted);
  ```
- **Impact**: the scanner is global, so a heading carrying two status emojis — one real, one inside
  a forged title — has BOTH rewritten to the computed status. The title is mangled. No structure is
  injected, because the replacement is a frozen constant, and no privilege boundary is involved.
  Before this diff the case was reachable only for an epic whose rows the run flipped; the heal pass
  now walks every epic on every committing workflow, so a forged heading is rewritten on the next
  commit rather than sitting inert.
- **Reachability**: `assertInert` (`lib/epic-heading.mjs:59-64`) already refuses to append a title
  containing a status emoji or a newline, so the append path cannot create one. A hand-edit of
  `docs/roadmap-execution-plan.md` is the only way in, and that edit is authored by the repository
  owner and visible in a reviewed diff.
- **Recommendation**: accept. Fixing it means splitting the heading on its `(tag)` suffix and
  scanning only the status field, which is a grammar change to a file three modules parse. The cost
  exceeds the risk of mangling a heading that a human deliberately forged in their own repository.
  Track it rather than patch it here.

## Dependencies

No new packages. Nothing to check against an advisory database.

## Out of scope / Noted

- The heal pass writes `docs/roadmap-execution-plan.md` on commits that previously wrote nothing.
  This is intended behavior, gated by the same fail-open try/catch, and every write still passes
  through gate C before it can be committed. Not a finding.
- `obj/` is gitignored, so the manifest restamp this cycle required leaves no committed artifact.

