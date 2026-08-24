# Security reports — consumer-defects-2026-08-24

## consumer-defects-2026-08-24-2026-08-24.md

# Security Review — main (consumer-defects-2026-08-24) — 2026-08-24

## Summary

Overall risk: **HIGH**. One HIGH finding, introduced by this branch: the T4 fix to `destructive_cmd_guard` anchored the hard-block verb patterns without teaching the matcher about executor wrappers, so five command forms that were hard-blocked at `HEAD` now pass. This is a regression in a guard whose whole purpose is refusing catastrophic commands, and it is a direct consequence of a change made in this diff.

The T1 hook (`state_write_guard`) is sound on its own tool boundary and resists every path form tested. Two pre-existing structural gaps around it are noted at MEDIUM and LOW; neither is introduced here.

Nine tickets reviewed, per the `power` track's per-ticket rule. Diff: 28 files, 346 insertions, 79 deletions, plus 11 untracked files.

## Findings

### [HIGH] Executor-wrapped destructive commands bypass the anchored hard-block patterns

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-184 (Incomplete List of Disallowed Inputs)
- **File**: `.claude/hooks/lib/common.mjs:398-430` (`effectiveCommands`), consumed by `cmdMatchesAny` at `:127`
- **Ticket**: T4
- **Evidence**:

  ```js
  export function effectiveCommands(cmd) {
    for (const seg of splitShellSegments(cmd)) {
      let s = seg.trim();
      let prefix = COMMAND_HEAD_PREFIX_RE.exec(s);   // env assignments + PREFIX_EXECUTORS
      while (prefix) { s = s.slice(prefix[0].length).trim(); prefix = ...; }
      if (s) out.push(s);
    }
  }
  ```

  `COMMAND_HEAD_PREFIX_RE` covers `PREFIX_EXECUTORS` (`sudo`, `env`, `xargs`, …) but **not** `SHELL_C_EXECUTORS` (`sh -c`, `bash -c`), `eval`, subshells, or command substitution. Measured against the eight live `hard_block_patterns`, comparing `HEAD` behaviour to this branch:

  | command | blocked at HEAD | blocked now |
  |---|---|---|
  | `sh -c "shutdown -h now"` | yes | **no** |
  | `bash -c 'mkfs.ext4 /dev/sda1'` | yes | **no** |
  | `eval "poweroff"` | yes | **no** |
  | `(reboot)` | yes | **no** |
  | `echo $(halt)` | yes | **no** |
  | `sudo poweroff` | yes | yes |
  | `xargs shutdown` | yes | yes |
  | `FOO=1 halt` | yes | yes |
  | `make x && reboot` | yes | yes |

- **Impact**: A hard-block pattern is documented as "not overridable by confirmation". Five wrapper forms now reach the shell unchallenged, including disk-formatting (`mkfs`) and host power-state commands. No confirmation prompt fires, because `cmdMatchesAny` returns false before the ask-pattern stage is reached. The wrappers are ordinary shell idioms, not exotic evasion.
- **Recommendation**: Build `effectiveCommands` on the existing `executedFragments` (`common.mjs:410`) rather than on `splitShellSegments` alone. `executedFragments` already peels `sh -c` / `bash -c`, `eval`, subshells `( … )`, brace groups, and `$( … )` / backtick substitutions, is recursion-capped at depth 6, and is already covered by `tests/git-commit-guard-tokenize.test.mjs`. Emit both the raw fragment and its prefix-stripped form per fragment, so the redirect-shaped pattern (`>\s*/dev/sda`) keeps matching raw text. The AC-002 safety-direction test should gain the five rows above.
- **Resolved**: fixed in this cycle as AC-023. `effectiveCommands` now walks `executedFragments`. All five forms in the table above re-measured as blocked; the AC-001 false-positive cases re-measured as allowed. Pinned by `tests/destructive-guard-executor-wrappers.test.mjs`, which covers the wrapper forms, the quoted-data safety direction, the prefix forms, and a wrapped redirect signature. A source-level assertion refuses a second walker.

  Fixing this exposed a follow-on, tracked as AC-025 and fixed with it: recursing into substitutions made backticks inside a heredoc read as command substitution, so markdown prose quoting a shell command matched a verb pattern — the same false-positive class, through the new door. The first attempt at that fix blanked every quoted heredoc and **opened a second hole**: `bash <<'EOF'` genuinely executes its body, and a blanket strip hid it (measured: not blocked). Replaced by the shipped `stripQuotedHeredocBodies`, which preserves the body when the opener verb is an executor. `tests/executed-fragments-heredoc.test.mjs` now pins the executor-versus-sink boundary in both directions.

### [MEDIUM] `state_write_guard` does not cover the Bash write path

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-863
- **File**: `.claude/settings.json:34` (matcher `Write|Edit|MultiEdit|NotebookEdit`)
- **Ticket**: T1
- **Evidence**:

  ```
  matcher: Write|Edit|MultiEdit|NotebookEdit
  ```

  `destructive_cmd_guard` is the only Bash-leg hook that inspects write intent, and its detector (`writesConsentPath`) is scoped to consent artifacts — basenames matching `consent|approval|grant`. `.claude/state/workflow.json` matches none of them.

- **Impact**: The Article II boundary this hook enforces holds for the file-editing tools and not for `Bash`. A subagent can still append a phase to `completed` with a shell redirect, which is the privilege path the ticket set out to close. The hook raises the cost of the bypass rather than removing it.
- **Recommendation**: Extend the Bash leg to deny writes under `.claude/state/**` when `agent_id` is present, reusing `decideStateWrite`'s predicate against the resolved redirect target. Track as a follow-up ticket — it is a scope expansion beyond T1's approved ACs, not a defect in what shipped. Until then, `seed.md` §4.1's row for this hook should say the Write-tool boundary is what it covers.
- **Resolved**: fixed in this cycle as AC-024 rather than deferred, at the engineer's direction. `state_write_guard` is now wired on `Bash` as well as the editing tools, in both `.claude/settings.json` and `src/settings.template.json`. The consent detector's machinery was lifted into `writesPathFamily` and the path family passed in, so the state family inherits variable expansion, the executed-fragment scan and target anchoring instead of cloning them — a second Bash detector is the drift this repo already has a convention against. Reads still pass: a subagent that cannot read `workflow.json` cannot work. `seed.md` §4.1 and its mirror now state both boundaries. Pinned by `tests/state-write-guard-bash-leg.test.mjs`, including the variable-indirected target, the read cases, the main-session case, and a degenerate payload.

### [LOW] Path resolution does not follow symlinks

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-59
- **File**: `.claude/hooks/lib/state-write.mjs:29` via `canonicalRel` (`common.mjs:137`)
- **Ticket**: T1
- **Evidence**:

  ```js
  const norm = resolve(normalize(filepath));   // no realpath()
  ```

  Every path form tested resolves correctly — `.claude/state/../state/workflow.json`, `./`-prefixed, and absolute all deny. A pre-existing symlink outside the state directory pointing into it would not.

- **Impact**: Requires an attacker to already have created a symlink in the repo, which needs a write they do not have if the guard is working. Speculative, and stated as such.
- **Recommendation**: None specific to this branch. `seed.md` §5 already records symlink-swap defence as an open hardening item across all guards; this hook inherits the repo's existing posture rather than weakening it.

## Per-ticket verdicts

| ticket | surface | verdict |
|---|---|---|
| T1 | `state_write_guard`, `lib/state-write.mjs`, settings, roster surfaces | MEDIUM + LOW (above); fail-open on degenerate payload is asserted, not assumed |
| T2 | `memory-index/resolve.mjs` | clean — shape check precedes reachability, no new input reaches a path build |
| T4 | `destructive_cmd_guard`, both `project.json` files | **HIGH** (above) |
| T5 | `roadmap-sync/append.mjs`, `backfill.mjs` | clean — `roadmapEpic` is integer-validated before use; no path or command built |
| T6 | `spec-lint/lint.mjs` | clean — `join(rootDir, '.claude','state','epic', slug + '.json')`; slug arrives from `workflow.json`, already `assertSafeSlug`-guarded upstream at the fan-out entry |
| T7 | `harness_continuation`, `swarm-dispatch`, `harness` SOPs | clean — `parked` is read-only in the hook; it can only add silence, never an emission |
| T9 | `commit/SKILL.md` | clean — prose only |
| T10 | `write-set-profile.mjs`, diagram guard, lint | clean — masking is one-way; a hidden reference earns no carve-out, so the direction is stricter |
| T11 | `tests/publish-check.test.mjs` | clean — raises a test timeout, no production surface |

## Dependencies

No new packages. The project holds a `zero-runtime-dependencies` constraint; the diff adds no `package.json` entry, and every new module imports `node:` builtins only.

## Out of scope / Noted

- **The masking regex in `write-set-profile.mjs:107`** is a backtracking-shaped pattern (`` /(`+)(?:(?!\1)[^\n])*?\1/g ``) run over spec text. The inner class excludes newlines, which bounds each match to one line, so a catastrophic-backtracking input is not reachable through a spec file. Noted rather than reported.
- **T4's regression is a general lesson for this guard.** Anchoring is the right fix for the false-positive class, but the guard's matcher and its tokenizer were developed separately, and only the `git`-scoped paths ever learned about wrappers. Both `gitSegments` and `cmdMatchesAny` should read the same fragment list.

