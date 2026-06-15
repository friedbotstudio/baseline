# Codebase Scout Report — gitignore setup (skill + init creation + commit guard)

## Primary touchpoints

### Part 1 — generation skill (new)
- `.claude/skills/<new>/SKILL.md` — new baseline skill (frontmatter `owner: baseline` → auto-discovered into the manifest). Slug/category TBD at codesign. Generator (gitignore.io) + vendored fallback are the design calls.
- `src/<vendored-default>` — **no shipped `.gitignore` template exists today** (`find src -name '*gitignore*'` is empty). The analogous shipped-overlay pattern is `src/.npmrc.template` (overlaid by install because `npm pack` drops dotfiles). A vendored default would live here.

### Part 2 — init creates/merges .gitignore
- `.claude/commands/init-project.md:8-214` — the user-only init command; **Step 6 "Apply"** is where target mutations happen. A `.gitignore` write/merge sub-step slots into Step 6 (between hooks-write and project.json-write).
- `src/cli/install.js:133-154` — `freshInstall()` / `forceInstall()`: `cp(templateDir, target, …)` copies the filtered `.claude/` tree; `applySpecialAndNeverTouch` merges `.mcp.json` + `project.json`; `materializeNpmrc(target)` (`install.js:125-131`) writes `.npmrc` from `src/.npmrc.template`. **`materializeNpmrc` is the exact pattern a `materializeGitignore(target)` would mirror.**
- **No project-root `.gitignore` is created by init/install today.** The only `.gitignore` write is `install.js:86` → `.claude/.baseline-prior/.gitignore` (`*\n`), unrelated (upgrade mirror).
- This repo's own `.gitignore` (110 lines) is the de-facto must-ignore reference: `.claude/state/`, `_pending.md`(+`.body`), `_resume.md`, `_thread.md`, `.claude/skill-memory/`, `.claude/agent-memory/`, `node_modules/`, `obj/`, OS/editor cruft, `docs/init/seed.*.md` (with `!docs/init/seed.md` negation). Useful source for the baseline default set.

### Part 3 — commit guard (new PreToolUse hook)
- `.claude/hooks/git_commit_guard.mjs:1-318` — **the pattern to follow + compose with.** `main()` (302-313): `readPayload()` → `payloadGet(payload,'.tool_input.command')`. `handleBash()` (200-281): `gitSegments(cmd)` to split real git invocations, `gitSubcommandInvoked(cmd,'commit')` to detect commit, `emitBlock(reason)` (deny, exit 0) vs `emitAllow()` (exit 0, no output). **Fail-open:** the top-level `.catch()` (315-318) calls `emitAllow()` on any error. The new guard should fail *closed* on a malformed-but-clearly-commit payload where feasible, but match the established emit/exit contract.
- `.claude/hooks/lib/common.mjs` — shared helpers the new hook reuses: `readPayload`, `payloadGet`, `projectGet` (reads project.json), `emitBlock`/`emitAllow`, `logLine`, `canonicalRel`, `matchAnyGlob`, `gitSegments`, `gitSubcommandInvoked`. Do NOT re-implement these.
- 23 hook `.mjs` files on disk today (`ls .claude/hooks/*.mjs | wc -l` = 23).

## Entry points that reach this code
- `npx @friedbotstudio/create-baseline` → `src/cli/install.js` (the CLI install path).
- `/init-project` command (Claude-driven, `.claude/commands/init-project.md`).
- `/gitignore` (the new skill, ad-hoc).
- Every `git commit` Bash invocation → PreToolUse Bash matcher → the new hook + existing `git_commit_guard` + `destructive_cmd_guard` + `process_lifecycle_guard`.

## Constraints and co-changes (the two-cascade count drift)

**Hook wiring** (`src/settings.template.json` + `.claude/settings.json`): the PreToolUse `Bash` matcher block lists `destructive_cmd_guard`, `git_commit_guard`, `process_lifecycle_guard`. The new hook adds one `{ "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/<new>.mjs" }` entry there. Both files edited identically.

**Manifest** (`obj/template/.claude/manifest.json`): `owners` has only `skills` (skills auto-discovered by `owner: baseline` frontmatter in `build-manifest.mjs`). BUT `manifest.files` hashes ALL shipped files **including 38 `.claude/hooks/` entries** — so a new hook file + edited settings → manifest hashes change → **`bash scripts/build-template.sh` must restamp** (landmine `baseline-skill-edit-needs-manifest-rebuild`).

**Counts are auto-derived from disk, prose is hand-synced.** `derive-counts.mjs` derives `skills` (listDirs + `skillIsBaselineOwned`, line ~108) and `hooks` (filter `.mjs`, line ~110) from disk. Adding the skill dir + hook file auto-bumps the derived totals to 42/24. The audit then compares derived-vs-claimed, so every PROSE/LITERAL surface must be hand-updated to 42 skills / 24 hooks:
- `.claude/skills/audit-baseline/audit.mjs` — `EXPECTED_HOOKS` set (~91-102, hardcoded 23 names) **must gain the new hook name**; verify `WORDS` map covers `twenty-four`.
- `.claude/skills/audit-baseline/derive-counts.mjs` — `SPELLED` map (~17-21) must include `24`/`42`; `SKILL_CATEGORIES` (~27-41) must bump the category the new skill joins so the sum = 42.
- `docs/init/seed.md` — §4.1 hook list+count, §4.3 skill list+count, headline line 14 ("twenty-three hook scripts"), tree lines (~108 "23 hook scripts", ~112 "41 skills"), §3 build steps (~551 "23 hook scripts", ~555 "41 skills"). **Mirror byte-equal into `src/seed.template.md`** (pre-§16 parity) and add the new hook to §4.1's python3 ledger awareness.
- `CLAUDE.md` — line 14 headline, setup-guard message line ~46 ("23 hooks…41 skills"), Article VIII header line ~184 ("The 23 hooks"), Article VIII **table needs a new row** for the hook, Appendix orientation line ~283. **Mirror byte-equal into `src/CLAUDE.template.md`.** Watch the ≤34500-byte budget (landmine `constitutional-amendment-tripwires…`): a new Article VIII row + count edits add bytes — currently 34442, only ~58 bytes slack, so offsetting trims or annex-offload will be needed.
- `README.md` — header counts (~44) + table rows (~64-65).
- `.claude/CONSTITUTION.md` — Appendix A `.claude/hooks/` row (**currently STALE at "22 hook scripts"** line 95 — disk is 23; the annex count is unaudited and already drifted, so this becomes 24 = a +2 fix) + category recount; Appendix B skill index (line 97 "41 skills") → 42; the orientation line.
- Tests: `tests/derive-counts.test.mjs:25-26` (`skills, 41` / `hooks, 23` → 42 / 24); `tests/whatsnew-counts.test.mjs:~26` (41 → 42). These are the binding literals the new counts must match.

**Compose with `git_commit_guard`** — both fire on the same PreToolUse/Bash boundary; either may deny. Neither should mask the other; the new guard fails closed on a clearly-commit payload.

**Offline-first (Article VI.5)** — gitignore.io is external network; the skill needs a vendored-default fallback; the commit guard must never touch the network (`git check-ignore` only).

**Shippability** — any new helper must be `.mjs`/`.js`/`.sh` (no Python), and modules imported by shipped SKILL.md prose must be in the manifest.

## Existing tests
- `tests/install.test.mjs` — exercises `freshInstall`/`forceInstall`, manifest write, `.npmrc` materialization (`:53`). The new `.gitignore` materialization gets a sibling case here.
- `tests/tui-install.test.mjs`, `tests/workflows-install-upgrade.test.mjs`, `tests/install-java-preflight.test.mjs` — install-path coverage.
- `tests/derive-counts.test.mjs` / `tests/whatsnew-counts.test.mjs` — the count literals (must change to 42/24).
- No existing test exercises `git_commit_guard` behavior directly via payload fixtures that I found — the new hook should ship its own payload-fixture test (deny-on-leak / allow-on-clean / fail-closed / no-network).

## Patterns in use here
Hooks are small Node ESM scripts that import `lib/common.mjs`, read the PreToolUse payload, and `emitBlock`/`emitAllow`. The install path is pure functions in `src/cli/install.js` with `materializeX(target)` overlay helpers fed by `src/*.template` files. Counts derive from disk; every human-readable count surface is hand-kept in sync and the audit enforces agreement. The chore-verify-conditional workflow (commit 179e638) just exercised this exact cascade discipline.

## Risks / landmines
1. **Double governance cascade (skill 41→42 AND hook 23→24).** Every count surface above must move in one change-set or the audit FAILs (`baseline-skill-count-cascade`). The Article VIII table gains a row AND counts change — two kinds of edit in CLAUDE.md.
2. **Manifest restamp required** after the new skill/hook/settings edits (`baseline-skill-edit-needs-manifest-rebuild`) — run `bash scripts/build-template.sh` before the audit.
3. **CLAUDE.md byte budget (~58 bytes slack at 34442/34500).** Adding an Article VIII row + count words will bust it — plan an offsetting trim or push detail to the annex.
4. **CONSTITUTION.md Appendix A is already stale at 22 hooks** (disk 23) — unaudited drift; the spec should correct it to 24, not 23.
5. **gitignore.io request shape + keeping the vendored default current** — research must pin the endpoint/tokens; the fallback is the offline safety net.
6. **Single source of truth for the must-ignore set** across skill + init + guard is unresolved (open question) — without it the three drift. Codesign decision.
7. **install.js writes dotfiles via overlay because `npm pack` drops them** — a `.gitignore` shipped only inside the copied tree may not survive packing; the `.npmrc` precedent (overlay at install) is why. The vendored default likely needs the same overlay treatment, not just a tree file.
