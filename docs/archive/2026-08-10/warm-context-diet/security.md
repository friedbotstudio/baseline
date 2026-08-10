# Security reports — warm-context-diet

## warm-context-diet-2026-08-10.md

# Security Review — warm-context-diet — 2026-08-10

## Summary

Overall risk: **LOW**. The diff is 48 files but only 186 lines of executable code, all in two `.claude/hooks/lib/` modules — a `security.sensitive_globs` surface, so the full architectural review applied. No secrets, no new dependencies, no auth/crypto/network surface, and no change to any consent gate, guard predicate, or git hard-block. Three LOW findings: two edge cases in the new string handling (one unreachable at the configured budget) and one governance clause that kept its rule but lost its `SHALL` modal.

## What was checked

| Area | Method | Result |
|---|---|---|
| ReDoS on `THREAD_DATA_COMMENT` | timed 200/400/800 unterminated openers × 50k tail | linear (2.4 / 5.1 / 11.6 ms) — no backtracking blowup |
| ReDoS on `isNavigationOnly` | 200k-char non-space and 200k-space inputs | 0.5 / 0.4 ms — anchored, no nesting |
| Comment-strip correctness | 5 malformed-input cases | 2 leak the payload (Finding 1) |
| `clampTo` bounds | limits −100, 0, 10, 57, 200 | over-limit below 57 (Finding 2, unreachable) |
| `envelopeWithin` termination | single pass, no loop; algebraic bound | terminates; output ≤ limit at configured budget |
| Governance relocation | diffed every `SHALL` / `SHALL NOT` clause, HEAD vs now | 10/10 `SHALL NOT` and 18/19 `SHALL` survive verbatim or reworded; 1 weakened (Finding 3) |
| Git hard-blocks | all 16 forbidden ops grepped individually | all present |
| De-indexed skills vs guards | 16 slugs grepped across `.claude/hooks/`, `.claude/commands/` | 6 matches, all artifact paths or direct module imports — none needs model invocation |
| Deleted skills | 4 slugs grepped across hooks, commands, skills, settings, CLAUDE.md, seed.md | zero live references |
| Secrets | added-lines scan + `gitleaks protect --staged` | no leaks found |
| Dependencies | `package.json` / lockfile diff | no change |

## Findings

### [LOW] Comment-strip leaks its payload on two malformed inputs

- **OWASP**: A04 Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/hooks/lib/memory_session_start.mjs:45`
- **Evidence**:
  ```js
  const THREAD_DATA_COMMENT = /<!--\s*thread-entry[\s\S]*?-->\s*/g;
  ```
  Measured against five inputs; two survive the strip:
  - **Unterminated** — `<!-- thread-entry\nBASE64\n` with no `-->` anywhere: the whole block passes through.
  - **Arrow inside payload** — a literal `-->` within the base64 body ends the lazy match early, leaving the remainder in the injected text.
- **Impact**: base64 the model cannot read reaches the warm context, spending tokens the strip exists to save. It is **not** an injection vector: `_thread.md` is gitignored, written only by `thread_store.appendEntry`, and its plaintext prose sections were already injected verbatim before this change — the strip is a budget optimization, never a security control.
- **Recommendation**: bound the match (`[\s\S]{0,4096}?`) and add a fallback that drops any line matching `^[A-Za-z0-9+/=]{200,}$` inside a shelved-thread block. Both malformed shapes require a corrupted writer, so this is hardening, not a fix.

### [LOW] `clampTo` returns over-limit output when the limit is below the truncation notice

- **OWASP**: A04 Insecure Design | **CWE**: CWE-131 (Incorrect Buffer Size Calculation)
- **File**: `.claude/hooks/lib/memory_session_start.mjs:69`
- **Evidence**:
  ```js
  const room = limit - TRUNCATION_NOTICE.length;   // negative when limit < 57
  const cut = text.lastIndexOf('\n', room);        // -1
  return text.slice(0, cut > 0 ? cut : room) ...   // negative end → whole string minus |room|
  ```
  Measured: `clampTo(500 chars, limit=10)` returns 510 chars.
- **Impact**: none at the shipped configuration. Both call sites pass 2,996 and `text.length − overage`; the second cannot fall below 57 while `SESSION_START_BUDGET` is 4,096, because the envelope overhead is ~150 characters, not ~4,000. The defect becomes reachable only if someone lowers `SESSION_START_BUDGET` below roughly 250.
- **Recommendation**: `if (limit <= TRUNCATION_NOTICE.length) return TRUNCATION_NOTICE.trimStart();` — one line, removes the latent trap for a future budget change.

### [LOW] Article V's integrate classification lost its `SHALL` modal

- **OWASP**: A04 Insecure Design | **CWE**: CWE-1078 (Inconsistent Naming/Convention)
- **File**: `CLAUDE.md:112`
- **Evidence**:
  ```
  - On `/integrate` failure, classify: **mechanical bug** → auto-loop … ; **needs a spec
    change** → EXIT LOOP with YIELD. … You SHALL NOT relax the integrate criteria, mark a
    failing integrate as passed, or bypass the verify verdict.
  ```
  HEAD read `When /integrate fails inside the loop, you SHALL classify:`. The compression turned the obligation into a bare imperative while every sibling bullet in Article V keeps an explicit modal.
- **Impact**: the security-critical half is intact — the `SHALL NOT relax / mark passed / bypass` prohibition kept its modal, so a failing integrate still cannot be waved through. Only the classify instruction weakened, and Article V is declared a MANDATORY SOP, so it still binds. This is a consistency defect, not a hole.
- **Recommendation**: restore `you SHALL classify it as` in the bullet. Costs 18 characters against the 28,000 target, which currently has 1 character of slack — so it needs 18 characters trimmed elsewhere in the same edit.

## Dependencies

No packages added, removed, or version-changed. `package.json` and the lockfile are untouched by this branch. Nothing to CVE-check.

## Out of scope / Noted

- **`git_commit_guard` false-positives on read-only greps.** During this review a `grep -qF "SHALL \`git push -u origin <branch>\`" CLAUDE.md` was hard-blocked with "consent expired … re-run `/grant-push`". The guard's Bash matcher tests the command string, so searching *for* the literal text `git push` is indistinguishable from invoking it. This pre-dates the branch and is fail-safe in the right direction (blocks rather than allows), but it makes governance text containing forbidden git operations awkward to audit. Worth a backlog entry.
- **`_thread.md` is an injection surface, unchanged.** Its plaintext prose is injected verbatim into the warm context at every session start. Anyone who can write that file can place text in the model's context. This pre-dates the branch, which only removes content from the injected copy. Flagged because the file is gitignored and therefore invisible to code review and to `gitleaks`.
- **Two libraries exceed the ~80-line structural signal** (`memory_session_start.mjs` 433, `resume_writer.mjs` 277 substantive lines). Both pre-date the branch; `/simplify` recorded them as `flagged` for a follow-up spec.
- **`.claude/project.json` change is a one-entry array removal** (`excludedTrees` no longer names the deleted `optimize-seo/scripts/`). No permission, glob, or guard predicate is affected; the two surviving entries are unchanged.

## Decision

Only LOW findings. No CRITICAL or HIGH. Phase may complete.

