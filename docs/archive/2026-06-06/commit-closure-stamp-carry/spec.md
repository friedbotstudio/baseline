# Spec — Hook-level enforcement of atomic backlog closure stamping

## Context

| Input | Path |
|---|---|
| Intake | *(none — spec-entry track)* |
| BRD *(if any)* | *(none)* |
| Scout *(if any)* | *(none)* |
| Research *(if any)* | *(none)* |
| Brief | `docs/brief/commit-closure-stamp-carry.md` |
| RCA (driver) | `docs/rca/2026-06-06-backlog-closure-stamp-stranded-post-commit.md` (AI-02/03/04) |

## Goal

`git_commit_guard` hard-blocks any `git commit` that stages a closing `workflow.json` (one with non-empty `source_backlog_keys`) unless the same commit also stages `backlog.md` with each of those keys stamped `status: picked-up` + `superseded-at` — making atomic closure unbypassable on every commit, while `/commit` stamps pre-stage and adds the `Closes <key>` reconciliation and clean-tree report at SOP level.

## Non-goals

- Not weakening the `--amend` hard-block or any existing `FORBIDDEN_RE` flag — the closure check runs only after those still deny.
- Not parsing the commit **message** inside the guard — message-dependent logic (`Closes <key>` reconciliation) stays at SOP level to avoid the `git-commit-guard-tokenize` classification-bug surface (see landmines).
- Not changing which keys are obligations — the staged `workflow.json → source_backlog_keys` is the sole signal; `/triage` still populates it.
- Not introducing a separate durable marker — the obligation is self-contained in the staged tree (D1).
- Not retaining the SHA-bearing `SHIPPED (commit X)` note — atomicity forbids a self-referential SHA, so it is dropped.

## Decisions

> **D1 — The obligation lives in the staged tree, not a marker.** At `git commit` time the live `.claude/state/workflow.json` is already archived (commit SOP Step 1) — but Step 3 *stages* the archived copy. The guard reads `source_backlog_keys` from the index (`git show :<staged workflow.json>`), so the obligation is exactly "this commit stages a closing workflow.json." No marker, no TTL, no clearing race. Commits that don't stage such a file (residue chores, swarm-worktree commits, CI, ordinary commits) are a clean no-op.

> **D2 — The guard inspects only the staged tree; never the message.** The unbypassable atomicity check (`workflow.json` keys ⊆ stamped staged `backlog.md`) needs no message parsing. The `Closes <key>` reconciliation (AI-04) is message-dependent, so it is enforced by `/commit`'s preflight helper, not the hard-block guard. This keeps the security-critical guard free of the quoting-blind message-parsing that the `git-commit-guard-*` landmines document as repeatedly bypass-prone.

> **D3 — Stamp logic lives in one shared lib.** `.claude/hooks/lib/closure-check.mjs` holds the "is key K stamped in this backlog text?" reader. Both `git_commit_guard` (enforcement) and `/commit`'s preflight helper (friendly pre-guard error + reconciliation) import it. Single source of truth; independently unit-testable.

> **D4 — This modifies a hook, so it carries a seed.md §4.1 amendment.** Per Article VIII, changing `git_commit_guard` requires explicit user approval (given at this gate) **and** a `seed.md` §4.1 amendment, mirrored to `src/seed.template.md`, with the CLAUDE.md Article VIII row updated and mirrored to `src/CLAUDE.template.md`. The amendment lands in the same `/tdd` pass as the guard change.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — atomic closure enforcement
Person(claude, "Claude running /commit", "executes Phase 11")
System(enf, "Commit closure enforcement", "guard + SOP")
System_Ext(git, "git CLI", "index + history")
System_Ext(mem, "backlog.md", "project memory")
Rel(claude, enf, "git commit / runs /commit")
Rel(enf, git, "reads staged tree, allows/blocks commit")
Rel(enf, mem, "stamps (sweep) / reads stamps")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — closure enforcement
System_Boundary(enf, "Commit closure enforcement") {
  Container(guard, "git_commit_guard.mjs", "node hook", "hard-blocks unsatisfied closing commits")
  Container(lib, "lib/closure-check.mjs", "node", "shared stamp reader")
  Container(sop, "commit/SKILL.md", "SOP", "stamp pre-stage, stage, preflight")
  Container(pre, "closure-precommit-check.mjs", "node", "friendly preflight + Closes reconcile")
  Container(sweep, "sweep.mjs", "node", "writes status + superseded-at")
}
ContainerDb(mem, "backlog.md", "markdown", "backlog entries")
System_Ext(git, "git index", "staged tree")
Rel(sop, sweep, "1. stamp pre-stage")
Rel(sop, git, "2. git add backlog.md + bundle")
Rel(sop, pre, "3. preflight before commit")
Rel(pre, lib, "stamp check")
Rel(sop, git, "4. git commit")
Rel(guard, git, "reads staged workflow.json + backlog.md")
Rel(guard, lib, "stamp check")
Rel(sweep, mem, "writes")
@enduml
```

### C4 — Component (changed container only)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — git_commit_guard closure check
Container_Boundary(guard, "git_commit_guard.mjs handleBash") {
  Component(detect, "commit detector", "existing", "is this a git commit segment?")
  Component(staged, "staged-tree reader", "git show :path", "find staged workflow.json + backlog.md")
  Component(keys, "obligation extractor", "JSON", "source_backlog_keys from staged workflow.json")
  Component(verify, "stamp verifier", "lib/closure-check", "every key stamped in staged backlog.md?")
  Component(decide, "decision", "emitBlock/fallthrough", "block unsatisfied; else existing policy")
}
Rel(detect, staged, "on commit")
Rel(staged, keys, "workflow.json content")
Rel(keys, verify, "keys + staged backlog text")
Rel(verify, decide, "satisfied?")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — closure obligation
class WorkflowJson {
  +slug: string
  +source_backlog_keys: string[]
}
class BacklogEntry {
  +key: string <<pk>>
  +status: string
  +superseded_at: date
}
class ClosureObligation <<new>> {
  +keys: string[]
  +stagedBacklogPresent: bool
  +unsatisfied: string[]
  +satisfied: bool
}
class GuardDecision <<new>> {
  +block: bool
  +reason: string
}
WorkflowJson "1" --> "1" ClosureObligation : derives
ClosureObligation "1" --> "many" BacklogEntry : checks staged
ClosureObligation "1" --> "1" GuardDecision : yields
@enduml
```

#### Migration DDL

```sql
-- No relational schema. backlog.md / workflow.json are flat files;
-- the class diagram models in-memory structures only. No DDL.
```

### Behavior — sequence per AC

```plantuml
@startuml
title Behavior #1 — AC-001 satisfied closing commit passes
participant git
participant guard as "git_commit_guard"
participant lib as "closure-check.mjs"
git -> guard : PreToolUse(git commit)
guard -> guard : FORBIDDEN_RE ok
guard -> git : staged paths (git diff --cached --name-only)
guard -> git : git show :<archived workflow.json>
guard -> guard : source_backlog_keys = K (non-empty)
guard -> git : git show :.claude/memory/backlog.md
guard -> lib : every K stamped picked-up + superseded-at?
lib --> guard : yes
guard --> git : fall through to consent/branch policy (allow)
@enduml
```

```plantuml
@startuml
title Behavior #2 — AC-002 unsatisfied closing commit is blocked
participant git
participant guard as "git_commit_guard"
participant lib as "closure-check.mjs"
git -> guard : PreToolUse(git commit)
guard -> git : staged workflow.json has source_backlog_keys K
alt backlog.md not staged OR a key not stamped
  guard -> lib : check
  lib --> guard : unsatisfied: [K2]
  guard --> git : emitBlock "closure obligation: stage backlog.md with K2 stamped"
else (no split allowed)
  note over guard : committing workflow.json without backlog.md is the split attack -> blocked
end
@enduml
```

```plantuml
@startuml
title Behavior #3 — AC-003 non-closing commit is a clean no-op
participant git
participant guard as "git_commit_guard"
git -> guard : PreToolUse(git commit)
guard -> git : staged paths
alt no staged workflow.json with non-empty source_backlog_keys
  guard -> guard : closure check no-ops
  guard --> git : existing branch/consent policy unchanged
end
@enduml
```

```plantuml
@startuml
title Behavior #4 — AC-004 /commit preflight (stamp + reconcile)
participant SOP as "commit/SKILL.md"
participant sweep
participant pre as "closure-precommit-check.mjs"
database mem as "backlog.md"
participant git
SOP -> SOP : source_backlog_keys K non-empty
SOP -> sweep : stamp-closure K (pre-stage)
sweep -> mem : status: picked-up + superseded-at
SOP -> git : git add backlog.md + archive bundle
SOP -> pre : keys=K, staged list, message-file
alt stamped+staged AND every Closes-key reconciled
  pre --> SOP : exit 0
  SOP -> git : git commit (guard re-verifies atomicity)
else unstamped/unstaged OR unreconciled Closes
  pre --> SOP : exit 1 (friendly error before the guard)
  SOP -> SOP : abort, surface report
end
@enduml
```

```plantuml
@startuml
title Behavior #5 — AC-005 post-commit clean-tree report
participant SOP as "commit/SKILL.md"
participant git
SOP -> git : git status --porcelain
alt no backlog.md residue (expected — guard guaranteed it staged)
  git --> SOP : clean
  SOP -> SOP : report "closure committed in <SHA>; tree clean"
else residue
  git --> SOP : M backlog.md
  SOP -> SOP : WARN "closure residue" + path
end
@enduml
```

```plantuml
@startuml
title Behavior #6 — AC-006 governance amendment lands consistently
participant dev as "/tdd"
participant audit as "audit-baseline + parity tests"
dev -> dev : amend seed.md §4.1 git_commit_guard row
dev -> dev : mirror to src/seed.template.md (byte-equal pre-§16)
dev -> dev : update CLAUDE.md Art VIII row + mirror src/CLAUDE.template.md
dev -> dev : rebuild obj/template/.claude/manifest.json
dev -> audit : run suite
audit --> dev : seed-template-parity PASS, CLAUDE budget PASS, audit-baseline PASS
@enduml
```

### State — core entity *(backlog entry closure)*

```plantuml
@startuml
title State — backlog entry closure
[*] --> open
open --> picked_up : sweep stamp-closure (pre-stage)
picked_up --> committed : git commit (guard-enforced atomic)
committed --> deleted : next /memory-flush Step 0a (superseded-at decay)
deleted --> [*]
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — closure enforcement
left to right direction
[git_commit_guard.mjs] --> [lib/closure-check.mjs]
[git_commit_guard.mjs] --> [lib/common.mjs]
[git_commit_guard.mjs] --> [git]
[closure-precommit-check.mjs] --> [lib/closure-check.mjs]
[commit-SKILL.md] --> [closure-precommit-check.mjs]
[commit-SKILL.md] --> [sweep.mjs]
[commit-SKILL.md] --> [git]
[lib/closure-check.mjs] --> [backlog.md]
[sweep.mjs] --> [backlog.md]
[guard-closure.test.mjs] --> [git_commit_guard.mjs]
[closure-check.test.mjs] --> [lib/closure-check.mjs]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Hook | `git_commit_guard` Bash matcher, closure leg | the `git commit` cmd + staged index | `emitBlock` on unsatisfied closing commit; else fall through to existing consent/branch policy | block reason names the unsatisfied keys + remediation | yes (read-only on index) |
| Lib | `lib/closure-check.mjs → unsatisfiedKeys(backlogText, keys)` | staged backlog text + key list | `string[]` of keys not stamped `picked-up`+`superseded-at` (or absent) | — | yes (pure) |
| CLI | `closure-precommit-check.mjs --memory-dir <d> --backlog-keys <csv> --staged-file <p> [--message-file <p>]` | flags | JSON report; exit `0`/`1`/`2` | unreconciled `Closes`, unstamped, unstaged → 1; usage → 2 | yes (read-only) |
| CLI | `sweep.mjs --mode stamp-closure …` *(unchanged; header comment corrected)* | flags | `{stamped, missing, already_closed}` | usage → 2 | yes |

Closure-key grammar (preflight `Closes` parser only): `/\bCloses\s+(?:backlog\s+)?([a-z0-9][a-z0-9-]*-[0-9a-f]{4})\b/gi`. Staged-path globs the guard scans for an obligation: any staged path ending `workflow.json` (covers `docs/archive/*/*/workflow.json` and a directly-staged `.claude/state/workflow.json`).

### Libraries and versions

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(none — node stdlib + git CLI)* | `node:fs`, `node:util` `parseArgs`, `node:child_process` `spawnSync` (git, read-only) | — | n/a (no third-party API) |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | Separate durable `closure_pending` marker the guard reads | Needs a write/clear/TTL lifecycle and an over-block window if the closing commit is deferred. The staged archived `workflow.json` (D1) is a self-clearing signal already in the tree. |
| B | Put `Closes <key>` reconciliation in the guard too | Re-opens the quoting-blind message-parsing surface the `git-commit-guard-tokenize` / consent-msg landmines document as repeatedly bypass-prone in this exact guard. Kept at SOP (D2). |
| C | SOP-helper only (no guard) — the prior spec | User chose unbypassable hook-level enforcement; SOP-only repeats the unenforced-rule root cause. |
| D | Duplicate stamp-reader in guard and helper | Two readers drift. One shared `lib/closure-check.mjs` (D3). |

## Design calls

The write_set has no UI files (it does not intersect `project.json → tdd.ui_globs`).

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given a `git commit` staging a `workflow.json` with non-empty `source_backlog_keys` K AND a staged `backlog.md` where every K is stamped `picked-up`+`superseded-at`, when the guard runs, then the closure leg passes and control falls through to the existing consent/branch policy | RCA AI-02 | §Behavior #1 |
| AC-002 | given such a commit where `backlog.md` is not staged OR any K is unstamped/absent, when the guard runs, then it `emitBlock`s naming the unsatisfied keys (the split attack — committing `workflow.json` without `backlog.md` — is blocked) | RCA AI-02 | §Behavior #2 |
| AC-003 | given a `git commit` that stages no `workflow.json` with non-empty `source_backlog_keys`, when the guard runs, then the closure leg no-ops and existing behavior is byte-for-byte unchanged | back-compat | §Behavior #3 |
| AC-004 | given `/commit` with non-empty `source_backlog_keys`, when it runs, then it stamps pre-stage, stages `backlog.md`, and the preflight helper aborts with a friendly error (before the guard) on an unstamped/unstaged key or an unreconciled `Closes <key>` | RCA AI-02/AI-04 | §Behavior #4 |
| AC-005 | given `/commit` finished, when it reports, then it runs `git status --porcelain` and surfaces any residual `backlog.md` dirtiness (expected none) | RCA AI-03 | §Behavior #5 |
| AC-006 | given the guard change, when `/tdd` lands it, then `seed.md §4.1` + `CLAUDE.md` Art VIII are amended with byte-equal `src/` mirrors and a rebuilt manifest, and `seed-template-parity` / CLAUDE-budget / `audit-baseline` all pass | Art. VIII (D4) | §Behavior #6 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | staged `workflow.json` keys=[K]; staged `backlog.md` has K `picked-up`+`superseded-at` | closure leg passes; decision falls through | AC-001 |
| Contract violation | staged `workflow.json` keys=[K]; `backlog.md` NOT in staged set (split attack) | `emitBlock`, reason lists K, remediation | AC-002 |
| Contract violation | staged `workflow.json` keys=[K]; `backlog.md` staged but K `status: open` | `emitBlock`, unsatisfied:[K] | AC-002 |
| Contract violation | staged `workflow.json` keys=[K1,K2]; only K1 stamped | `emitBlock`, unsatisfied:[K2] | AC-002 |
| No-op | commit stages code only, no `workflow.json` | closure leg silent; existing policy result unchanged | AC-003 |
| No-op | commit stages `workflow.json` with empty `source_backlog_keys` | closure leg silent | AC-003 |
| Adversarial | `git commit -F <file>` and heredoc `-m` forms | closure leg reads index, not message; verdict unaffected by message form | AC-001/002 |
| Adversarial | `--amend` present | FORBIDDEN_RE blocks first; closure leg never reached | non-goal guard |
| Interaction | unsatisfied closure on a non-protected branch (no consent needed) | still blocked by closure leg (closure precedes/!=consent) | AC-002 |
| Lib unit | `unsatisfiedKeys(text, [K])` over stamped/unstamped/absent fixtures | correct key lists | AC-001/002 |
| Preflight | helper: unreconciled `Closes other-aaaa` not in keys | exit 1 | AC-004 |
| Preflight | helper: `Closes` parser variants (`Closes K`, `Closes backlog K`, case, punctuation) | extracts K; no false key from prose | AC-004 |
| Regression | `sweep.mjs modeStampClosure` still writes only `status`+`superseded-at` (no SHA/caveat) | unchanged | AC-004 |
| Regression (governance) | `seed-template-parity`, CLAUDE 34k-budget + binding-markers, `audit-baseline`, no-python3 ledger | all PASS after amendment + manifest rebuild | AC-006 |
| Regression (SOP scan) | `commit/SKILL.md`: stamp/stage precedes `git commit`; no `SHIPPED (commit` literal; post-commit status report present | invariant holds | AC-004/005 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `git_commit_guard` closure block | `logLine(HOOK, "BLOCKED closure obligation keys=…")` | audit a blocked closing commit |
| Log | `closure-precommit-check` JSON report | `{ok, unstamped, unstaged, unreconciledCloses}` | friendly preflight verdict |
| Log | `/commit` post-commit status line | `closure committed in <SHA>; tree clean` / `WARN residue` | operator visibility (AI-03) |

No metrics/alarms — dev-time tooling.

## Rollout

- **Feature flag**: none. The guard leg activates only when a commit stages a `workflow.json` with non-empty `source_backlog_keys`; all other commits are unchanged (AC-003).
- **Migration order**: 1) add `lib/closure-check.mjs` + tests; 2) add closure leg to `git_commit_guard.mjs` + tests; 3) `closure-precommit-check.mjs` + `commit/SKILL.md` edits; 4) `sweep.mjs` header comment; 5) amend `seed.md §4.1` + mirror `src/seed.template.md`; update `CLAUDE.md` Art VIII row + mirror `src/CLAUDE.template.md`; 6) rebuild `obj/template/.claude/manifest.json`; run full suite + `/security`.
- **Canary**: this workflow's own `/commit` has empty `source_backlog_keys`, so it exercises the AC-003 no-op path end-to-end; the enforcement paths are covered by guard unit fixtures.

## Rollback

- **Kill-switch**: `git revert` the landing commit. The guard leg is read-only; reverting restores the prior guard + SOP. No runtime state to unwind.
- **Signal to roll back**: a legitimate closing commit is blocked (guard false-positive) — observed immediately at the commit attempt; revert restores the SOP-only path.

## Archive plan

- Defaults *(automatic)*: brief, spec, spec approval, security report.
- Extras *(list any non-default files)*:
  - `docs/rca/2026-06-06-backlog-closure-stamp-stranded-post-commit.md` (the driving RCA).

## Open questions

- **Guard change is `/security`-mandatory.** `git_commit_guard` is a hard-block consent guard with repo-wide blast radius and a documented bypass history (`git-commit-guard-tokenize`, consent-msg landmines). The Phase-8 `/security` review is required, not optional, and its test plan SHALL include the adversarial rows above. *(Process note — does not block approval.)*
- **Manifest rebuild + seed/CLAUDE mirrors are mandatory build steps.** Editing baseline-owned hooks + `seed.md` + `CLAUDE.md` diverges from the manifest and the `src/` mirrors; `/tdd` rebuilds the manifest and applies both mirror edits in the same pass, heeding the `seed.md`-amendment tripwires (CLAUDE 34k budget + binding markers, seed-template parity, python3 line-ledger, `code-browser` deframe slice). *(Resolved as build steps — surfaced so the reviewer expects them.)*
