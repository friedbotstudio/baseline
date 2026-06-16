# Security reports — epic-close-bundle-archival

## epic-close-bundle-archival-2026-06-16.md

# Security Review — epic-close-bundle-archival — 2026-06-16

## Summary

Overall risk: **LOW**. The change adds a local, developer-invoked helper (`epic_close.mjs`) plus SOP/governance prose. The helper shells out with `execFileSync` using an **argument array** (no shell), only ever copies the existing `approved` value (never forges it), and fails closed on archive errors. The one defense-in-depth gap is that the `epic` slug argument is not validated against path-traversal before it reaches `path.join` and `archive.sh`; impact is bounded by the helper being a local tool whose slug is supplied by trusted callers (`workflow.json → epic` or the maintainer).

## Findings

### [LOW] Unvalidated `epic` slug flows into path construction and archive.sh
- **OWASP**: A03 - Injection (path traversal) | **CWE**: CWE-22
- **File**: `.claude/skills/commit/epic_close.mjs:30` (`epicStatePath`), `:51` (`archiveBundle` → `execFileSync('bash', [ARCHIVE_SCRIPT, epic])`)
- **Evidence**:
  ```js
  function epicStatePath(root, epic) {
    return path.join(root, '.claude/state/epic', `${epic}.json`);
  }
  // ...
  execFileSync('bash', [ARCHIVE_SCRIPT, epic], { cwd: root, env: {...}, stdio: 'inherit' });
  ```
- **Impact**: A slug containing `../` (e.g. `../../foo`) would resolve `epicStatePath` outside `.claude/state/epic/` and pass the same value to `archive.sh` as `$SLUG`, which builds `docs/<kind>/$SLUG.md` paths. In principle this could read/move files outside the intended directory. **Bounded** because: (a) the helper is a local CLI, not a network/RPC boundary; (b) the slug is supplied by trusted callers — the `commit` skill passes `workflow.json → epic` (itself constrained by triage), and the standalone path is the maintainer typing their own epic name; (c) to actually *write* `closed`, the traversal target must already be a valid epic-state JSON with ≥1 child and all children `committed`; (d) `archive.sh` refuses to overwrite an existing target. No shell is involved (`execFileSync` arg array), so this is path traversal only, not command injection.
- **Recommendation**: Add a one-line slug shape guard at the top of `main` — reject any `epic` containing `/`, `\`, or `..` (e.g. `if (!/^[a-z0-9][a-z0-9-]*$/i.test(epic)) { console.error(...); return 2; }`). Cheap defense-in-depth; matches the bare-slug canonicalization the consent gates already enforce elsewhere.

### [LOW] `approved` is never written — no new epic_approval_guard bypass (verification, not a defect)
- **OWASP**: A08 - Software & Data Integrity | **CWE**: CWE-862 (relates to backlog `-abad`)
- **File**: `.claude/skills/commit/epic_close.mjs:60` (`markClosed`)
- **Evidence**:
  ```js
  const closed = { ...state, closed: true, closed_at: now, updated_at: now };
  fs.writeFileSync(statePath, JSON.stringify(closed, null, 2) + '\n');
  ```
- **Impact**: The helper writes the epic state via runtime `fs.writeFileSync`, which is **not** intercepted by `epic_approval_guard` (a PreToolUse hook on Claude's Write/Edit/MultiEdit tool calls only). This is the same write-surface class as backlog `-abad`. However, `markClosed` spreads the **existing** `state` and only adds `closed`/`closed_at`/`updated_at` — it can never flip `approved` from `false` to `true` (it copies whatever was already there). So it introduces **no** new approval-forgery path. Confirmed safe; noting for traceability against `-abad`.
- **Recommendation**: None required. If the `-abad` hardening later extends Bash/runtime coverage of `.claude/state/epic/`, ensure it allowlists `closed`-only merges so this helper is not falsely blocked.

### [LOW] Partial archive on archive.sh failure leaves epic open (fail-closed, but non-atomic)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-460 (cleanup on early termination)
- **File**: `.claude/skills/commit/epic_close.mjs:73-78` (`main` catch), `closeEpic:64-70`
- **Evidence**:
  ```js
  try { closeEpic(root, epic, statePath, state); }
  catch (e) { console.error(`epic-close: archive refused for ${epic}: ${e.message}`); return 1; }
  ```
- **Impact**: `archiveBundle` runs `archive.sh`, which moves bundle files one at a time and exits 1 on a conflict (e.g. target already exists). If it fails mid-way, some files may already be `git mv`'d while the helper returns 1 **without** writing `closed`. The epic is then "half-archived but still open." This is **fail-closed** for the close flag (correct — no false close), and it inherits `archive.sh`'s pre-existing refuse-to-overwrite semantics; it is not introduced by this change. Re-running after resolving the conflict is idempotent (already-moved files are skipped; `closed` is set once all move).
- **Recommendation**: None required for this risk level. Optional hardening: have `archive.sh` stage to a temp dir and move atomically, tracked separately from this work.

## Dependencies

No new packages. `epic_close.mjs` imports only Node stdlib (`node:fs`, `node:path`, `node:child_process`, `node:url`). No CVE surface.

## Out of scope / Noted

- **Consent integrity**: the fold (`commit/SKILL.md` Step 2.8) does not run `git commit` itself; the staged bundle move rides the last child's already-`/grant-commit`-consented commit. The helper's only write outside the index is to the **gitignored** epic state file (runtime state, not a consent artifact). No new unconsented git-write path is introduced. ✔
- **`-abad` follow-up** (backlog, MEDIUM): the broader Bash/runtime write-surface gap for `.claude/state/epic/` remains tracked separately; this change does not widen it (see finding 2).

