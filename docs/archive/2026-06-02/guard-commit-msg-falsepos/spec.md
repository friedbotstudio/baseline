# Spec — git-commit message payload carve-out in `writesConsentPath`

## Context

| Input | Path |
|---|---|
| Intake | *(none — entered via `/triage` → spec; request captured in `.claude/state/workflow.json`)* |
| BRD *(if any)* | *(none)* |
| Scout *(if any)* | *(none — single-file change, scout excepted)* |
| Research *(if any)* | *(none — research excepted; design grounded in reading `lib/common.mjs`)* |

## Goal

`writesConsentPath(cmd)` ignores the message payload of a `git commit` invocation (an inline `-m`/`--message` argument and a heredoc body feeding the commit) when scanning for consent-path writes, so a governance commit whose message merely *describes* consent tokens is allowed — while every real Bash write to a consent path, including one in a compound command alongside a `git commit`, is still blocked.

## Non-goals

- Changing the consent basename set, the write-verb set, or any other guard semantics.
- Touching `git_commit_guard.mjs` (the commit-consent enforcement) — this is purely the `destructive_cmd_guard` consent-path detector in `lib/common.mjs`.
- Suppressing detection for any command other than a `git commit` (e.g. `git tag -m`, `git stash`) — out of scope; only `git commit` is carved out.
- Handling `-F <file>` filename arguments specially: the file's *content* is never in the command string, so it already passes; only `-F -` heredoc bodies need stripping.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

The root cause: `writesConsentPath` runs `CONSENT_WRITE_VERB_RE` / `CONSENT_REDIRECT_RE` against the **entire** command string. A `git commit` message that contains a consent basename (e.g. `commit_consent`) and a write-verb word (e.g. `tee`) satisfies both the reference test and a write-signal test, so the command is wrongly classified as a consent-path write. The fix sanitizes the command — removing only `git commit` message payloads — before the existing write-signal tests run. Non-commit segments are preserved verbatim, so a real write after a separator is still caught.

The fix reuses existing Foundation helpers in `lib/common.mjs`: `splitTopLevelSegments` (quote-aware separator split) and `gitSubcommandInvoked` (segment-aware git subcommand classifier). The only new code is a sanitizer that, per top-level segment classified as `git commit`, drops `-m`/`--message[=]` argument tokens and any heredoc body the segment opens.

### C4 — System context

Who interacts with the system, and which external systems it depends on.

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — destructive_cmd_guard consent-write detection
Person(claude, "Claude (in-session)", "issues Bash tool calls, including git commit")
System(guard, "destructive_cmd_guard", "PreToolUse/Bash hook; blocks Bash writes to consent paths")
System_Ext(pretool, "PreToolUse pipeline", "delivers the Bash command payload to the hook")
Rel(claude, pretool, "Bash tool call")
Rel(pretool, guard, "command string")
Rel(guard, claude, "allow / block decision")
@enduml
```

### C4 — Container

Deployable units inside the system boundary and how they communicate.

```plantuml
@startuml
!include <C4/C4_Container>
title Container — consent-write enforcement
System_Boundary(sut, "Consent-write enforcement") {
  Container(hook, "destructive_cmd_guard.mjs", "Node ESM hook", "calls writesConsentPath on the Bash command")
  Container(lib, "lib/common.mjs", "Node ESM module", "consent-path detection + shell tokenizers")
}
Rel(hook, lib, "writesConsentPath(cmd)")
@enduml
```

### C4 — Component (changed containers only)

One diagram per container whose internals change. Only `lib/common.mjs` changes.

```plantuml
@startuml
!include <C4/C4_Component>
title Component — lib/common.mjs consent detection
Container_Boundary(lib, "lib/common.mjs") {
  Component(wcp, "writesConsentPath", "fn (changed)", "sanitize commit payloads, then run write-signal tests")
  Component(san, "sanitizeGitCommitForScan", "fn (new)", "strip -m/--message args + heredoc bodies of git commit segments")
  Component(split, "splitTopLevelSegments", "fn (existing)", "quote-aware split on unquoted ; | && || newline")
  Component(gsi, "gitSubcommandInvoked", "fn (existing)", "classify a segment as a real git <sub> invocation")
  Component(res, "CONSENT_* regexes", "consts (unchanged)", "reference + write-signal detectors")
}
Rel(wcp, san, "sanitize first")
Rel(san, split, "segment the command")
Rel(san, gsi, "is this segment a git commit?")
Rel(wcp, res, "test sanitized string")
@enduml
```

### Data model — class diagram

No database. The "data model" here is the module's function surface. Mark new/changed with `<<new>>` / `<<changed>>`.

```plantuml
@startuml
title Module surface — lib/common.mjs (consent detection)
class writesConsentPath <<changed>> {
  +cmd: string
  --
  +returns: boolean
  ~step: sanitize cmd via sanitizeGitCommitForScan
  ~step: run CONSENT_REF + write-signal tests on sanitized
}
class sanitizeGitCommitForScan <<new>> {
  +cmd: string
  --
  +returns: string
  ~drops -m/--message arg tokens of git-commit segments
  ~drops heredoc bodies opened by git-commit segments
}
class splitTopLevelSegments <<existing>> {
  +cmd: string
  +returns: string[]
}
class gitSubcommandInvoked <<existing>> {
  +cmd: string
  +sub: string
  +returns: boolean
}
writesConsentPath --> sanitizeGitCommitForScan
sanitizeGitCommitForScan --> splitTopLevelSegments
sanitizeGitCommitForScan --> gitSubcommandInvoked
@enduml
```

#### Migration DDL

No schema. No data migration. *(section retained so the absence is explicit)*

### Behavior — sequence per AC

One sequence per behavior. The sequence is the contract.

```plantuml
@startuml
title Behavior #1 — commit message describing consent tokens is allowed
actor Caller
participant writesConsentPath as W
participant sanitizeGitCommitForScan as S
W -> S : sanitize("git commit -m \"...commit_consent...tee...\"")
S -> S : split into segments
S -> S : segment is git commit -> drop -m arg token
S --> W : "git commit" (payload removed)
W -> W : CONSENT_REF_RE on sanitized -> no consent basename
W --> Caller : false (allow)
@enduml
```

```plantuml
@startuml
title Behavior #2 — real consent write in a compound command is still blocked
actor Caller
participant writesConsentPath as W
participant sanitizeGitCommitForScan as S
W -> S : sanitize("git commit -m x; tee .../commit_consent")
S -> S : split into 2 segments
S -> S : seg1 git commit -> drop -m; seg2 tee... -> kept verbatim
S --> W : "git commit ; tee .../commit_consent"
W -> W : CONSENT_REF_RE matches + CONSENT_WRITE_VERB_RE matches
W --> Caller : true (block)
@enduml
```

```plantuml
@startuml
title Behavior #3 — plain redirect to a consent path is still blocked (no commit)
actor Caller
participant writesConsentPath as W
participant sanitizeGitCommitForScan as S
W -> S : sanitize("echo x > .claude/state/commit_consent")
S -> S : no git-commit segment -> return unchanged
S --> W : "echo x > .claude/state/commit_consent"
W -> W : CONSENT_REDIRECT_RE matches
W --> Caller : true (block)
@enduml
```

### State — core entity *(only if stateful)*

No state machine. `writesConsentPath` and `sanitizeGitCommitForScan` are pure functions of the command string. *(heading retained to record the explicit choice)*

### Dependencies — graph

Directed graph; edge `A --> B` reads "A depends on B".

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — consent detection
left to right direction
[destructive_cmd_guard.mjs] --> [writesConsentPath]
[writesConsentPath] --> [sanitizeGitCommitForScan]
[writesConsentPath] --> [CONSENT_regexes]
[sanitizeGitCommitForScan] --> [splitTopLevelSegments]
[sanitizeGitCommitForScan] --> [gitSubcommandInvoked]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Fn | `writesConsentPath(cmd)` | `cmd: string` | `boolean` (true = blocks) | non-string → `false` | yes (pure) |
| Fn | `sanitizeGitCommitForScan(cmd)` | `cmd: string` | `string` (commit message payloads removed) | non-string → returns input coerced/empty safely | yes (pure) |

### Libraries and versions

No third-party libraries. The fix uses only Node built-ins already imported by `lib/common.mjs` and existing in-module helpers.

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(none)* | — | — | n/a |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | In `destructive_cmd_guard.mjs`, skip the consent check entirely when the command starts with `git commit`. | Opens a bypass: `git commit -m x; tee .../commit_consent` would skip the check. Must sanitize per-segment, not whole-command. |
| B | Always require `commit/SKILL.md` to write the message to a temp file (`-F <file>`) and never inline/heredoc. | SOP-only band-aid; leaves the guard wrong for every other caller (ad-hoc commits, other skills). The guard is the right layer. |
| C | Strip ALL quoted strings from the command before scanning. | Over-broad: a real `tee ".../commit_consent"` uses quotes too; would open a bypass. |

## Design calls

*(none)* — write_set has no UI files.

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given `git commit -m "<msg containing commit_consent and tee>"`, when `writesConsentPath` runs, then it returns `false` (allowed). | request | §Behavior #1 |
| AC-002 | given `git commit -F - <<EOF ... commit_consent ... tee ... EOF`, when `writesConsentPath` runs, then it returns `false` (allowed). | request | §Behavior #1 |
| AC-003 | given `git commit --message="...push_consent... cp ..."`, when `writesConsentPath` runs, then it returns `false` (allowed). | request | §Behavior #1 |
| AC-004 | given `git commit -m x; tee .claude/state/commit_consent`, when `writesConsentPath` runs, then it returns `true` (blocked). | request | §Behavior #2 |
| AC-005 | given `git commit -m x && echo y > .claude/state/push_consent`, when `writesConsentPath` runs, then it returns `true` (blocked). | request | §Behavior #2 |
| AC-006 | given `echo x > .claude/state/commit_consent` (no git commit), when `writesConsentPath` runs, then it returns `true` (blocked) — unchanged behavior. | request | §Behavior #3 |
| AC-007 | given `tee .claude/state/.commit_consent_grant < /dev/null` (no git commit), when `writesConsentPath` runs, then it returns `true` (blocked) — unchanged behavior. | request | §Behavior #3 |
| AC-008 | given the existing consent-write and tokenizer test suites, when the fix lands, then every previously-passing assertion still passes (no regression). | request | §Behavior #3 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | `git commit -m` with consent basename + write-verb in message | `writesConsentPath` → false | AC-001 |
| Golden path | `git commit -F -` heredoc body with consent basename + write-verb | false | AC-002 |
| Golden path | `git commit --message="..."` form (long flag, `=` joined) | false | AC-003 |
| Contract violation | compound: real `tee .../commit_consent` after `;` following a commit | true | AC-004 |
| Contract violation | compound: real redirect to `push_consent` after `&&` | true | AC-005 |
| Regression trap | plain `echo x > .../commit_consent` (no commit) | true (unchanged) | AC-006 |
| Regression trap | plain `tee` to a `*_grant` marker (no commit) | true (unchanged) | AC-007 |
| Input boundary | non-string input; empty string; bare `git commit` with no `-m` | false; no throw | AC-001 |
| Input boundary | message text that itself contains a `;` or `EOF`-like token inside quotes | classified correctly (quote-aware) | AC-002 |
| Regression trap | full existing `destructive-consent-write-block` + `git-commit-guard-tokenize` suites | unchanged | AC-008 |

## Observability

No new runtime signals. `destructive_cmd_guard` already logs `BLOCKED consent-path write via Bash: <cmd>` on a block; that line is unchanged and now fires only on genuine consent-path writes.

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `destructive_cmd_guard` block line | existing `logLine` | audit which command was blocked (unchanged) |

## Rollout

- **Feature flag**: none — a guard correctness fix ships directly; a flag would leave the false-positive live.
- **Migration order**: n/a (single pure-function change + tests).
- **Canary**: the full test suite + `audit-baseline` is the gate; no runtime canary.

## Rollback

- **Kill-switch**: revert the `lib/common.mjs` change (single commit). `writesConsentPath` returns to whole-command scanning.
- **Signal to roll back**: any new test in `destructive-consent-write-block` / `git-commit-guard-tokenize` fails in CI, or a real consent-path write is observed passing the guard. Detectable within one test run.

## Archive plan

- Defaults *(automatic)*: spec, spec-rendered/, spec approval, security report.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- *(none — design is fully determined by the existing helper surface and the eight ACs.)*
