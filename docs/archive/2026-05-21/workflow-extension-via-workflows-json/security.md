# Security reports — workflow-extension-via-workflows-json

## workflow-extension-via-workflows-json-2026-05-21.md

# Security reports — workflow-extension-via-workflows-json

## workflow-extension-via-workflows-json-2026-05-21.md

# Security Review — workflow-extension-via-workflows-json — 2026-05-21

## Summary

**Overall risk: LOW.** No CRITICAL/HIGH/MEDIUM findings. Two LOW observations (migrator non-atomicity + theoretical slug interpolation) noted with defense-in-depth recommendations. The diff introduces no new third-party dependencies, no network access, no crypto, no auth surfaces, no `eval`/`Function` constructor use, no shell-piped attacker-controlled data, no template-string-to-shell paths. JSON parsing is the standard Node JSON.parse (does not honor `__proto__` for prototype mutation in v18+; the validator's strict-unknown-keys check rejects anomalous keys regardless).

## Findings

### LOW — Workflow.json migrator write is not atomic

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-362 (race condition)
- **File**: `src/cli/workflow-migrator.js:38`
- **Evidence**:
  ```js
  await writeFile(filePath, JSON.stringify(migrated, null, 2) + '\n');
  return { migrated: true, track_id: trackId };
  ```
- **Impact**: A process crash, kill signal, or power loss between `writeFile`'s open and fsync calls leaves a partially-written `workflow.json` on disk. The next harness invocation reads a corrupt or truncated file and aborts. No data loss is possible (the user can re-run `/triage`), but the failure mode is opaque.
- **Recommendation**: Use the write-to-temp-then-rename pattern: `await writeFile(filePath + '.tmp', body); await rename(filePath + '.tmp', filePath)`. POSIX rename is atomic on the same filesystem. Defers risk from "partial corruption" to "rename interrupt" which is recoverable. ~3-line change; non-blocking.

### LOW — Triage helper subprocess invocation interpolates `<slug>` into a Bash command

- **OWASP**: A03 — Injection | **CWE**: CWE-78 (OS command injection)
- **File**: `.claude/skills/triage/SKILL.md:39-43` (prose) + `.claude/skills/triage/seed-tasklist.mjs` invocation pattern
- **Evidence**: The triage skill body instructs Claude to run `node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug>` via the `Bash` tool. `<slug>` and `<track_id>` are substituted by Claude at invocation time from values derived in triage Steps 1-4. If Claude generates a slug containing shell metacharacters (`;`, `&&`, backticks), the resulting Bash invocation could execute attacker-controlled commands.
- **Impact**: Theoretical. The triage SOP already constrains slug to canonical-kebab (lowercase + hyphens only) via `lib/common.sh → canonical_slug` and the workflow-slug template. Triage classifies and confirms before substitution; an attacker would need to first poison the user's natural-language request AND survive triage's confirmation prompt. Realized exploit path requires multiple chained social-engineering steps.
- **Recommendation**: Defense in depth — quote the args in the documented invocation pattern: `node .claude/skills/triage/seed-tasklist.mjs "$track_id" "$slug"`. Better: the helper's positional-arg parser already handles whitespace-safe strings; the safety leak is at the Bash level. Alternative: have triage instruct Claude to first assert `[[ "$slug" =~ ^[a-z][a-z0-9-]*$ ]]` before invoking the helper. Either way, ~1-line SOP edit; non-blocking.

## Dependencies

**No new third-party packages.** The diff introduces five new JS modules under `src/cli/`, all using only `node:fs/promises`, `node:path`, `node:url`, `node:child_process` (existing project pattern). `package.json` and `package-lock.json` are unchanged in this branch's diff. `npm audit` not run (no dependency delta to audit).

## Subprocess + path-traversal review (focus areas)

- **`validateWorkflowsJsonl` parses user-editable JSONL** — uses standard `JSON.parse` (no `eval`/`Function`/`new Function`). Modern Node (v18+) does not honor `__proto__` keys during `JSON.parse` for prototype mutation. The validator's strict-unknown-keys check (`checkSchemaShape`) rejects any unexpected top-level key — defense in depth against schema bypass. ✓ Safe.
- **`findProjectRoot` walks parent directories** — terminates on `dirname(dir) === dir` (root-of-tree). No risk of infinite loop or path traversal beyond filesystem root. The walk is bounded by FS depth (typically <20 hops). ✓ Safe.
- **Subprocess invocations** — `seed-tasklist.mjs` is invoked from triage via the `Bash` tool with positional args. The args themselves are NOT shell-interpreted by Node — Node's `process.argv` passes through whatever the shell hands it. The risk is at the shell level (Finding 2 above). The script's own argv parsing in `main()` is safe (string split, no eval). ✓ Mostly safe (Finding 2 documents the only residual concern).
- **Migrator state-file rewrite** — Finding 1 above. ✓ Safe data semantics; non-atomic write is the only concern.
- **Doctor's interactive writes** — `init-project-doctor.md` is prose that instructs Claude to call `AskUserQuestion` before any Write/Edit. The contract is enforced via prose, not hook. Matches the existing baseline pattern (e.g., `/approve-spec` consent gate is also prose-enforced + hook-enforced). The hook side (`spec_approval_guard`) is already in place for the approve gates; the doctor doesn't have a dedicated hook, but its writes are limited to the user's own `.claude/workflows.jsonl` + `.claude/schemas/` + Article IV mirrors — files the user already controls. ✓ Acceptable risk.
- **`Track.$schema` reference** — stored as a string, used only for `SUPPORTED_SCHEMAS Set.has()` membership check at `src/cli/workflows-validator.js:124`. Never dereferenced as code, never fetched via HTTP, never `import()`-ed. ✓ Safe.

## Out of scope / Noted

- The existing `src/cli/upgrade-tiers.js` additions (`canRecoverBase`, `formatStageTimestamp`) from earlier in this session are in the branch diff. They were security-reviewed when first added (tar-extract sandbox + sha256 verification; defense against tar entry path traversal already in place at line 145-147). No new concerns from the workflows.jsonl work.
- Constitutional artifacts (seed.md §18, CLAUDE.md Article IV amendment + mirrors) introduce no executable code paths; they are reference documents read by skills at runtime.
- `init-project-doctor.md` runs subprocesses (`node .claude/skills/triage/seed-tasklist.mjs --validate-only`); same Finding 2 applies. Documented for completeness.
- The `.claude/workflows.jsonl` shipping path uses `cp` (POSIX) at build-template.sh; not a shell-interpolation concern.

## Verdict

LOW overall risk. Both findings are defense-in-depth recommendations, not blockers. The workflow-extension-via-workflows-json branch is **safe to proceed to `/integrate`**.


