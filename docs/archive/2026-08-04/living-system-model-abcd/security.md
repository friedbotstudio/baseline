# Security reports — living-system-model-abcd

## living-system-model-abcd-2026-08-04.md

# Security reports — living-system-model-abcd

## living-system-model-abcd-2026-08-04.md

# Security Review — main — 2026-08-04

Power-track review: run **once per ticket** over `workflow.json → tickets[]`. Four tickets reviewed, four verdicts recorded. No ticket was skipped.

## Summary

Overall risk: **MEDIUM**. Nothing here is remotely reachable: local developer tooling with no network surface, no authentication, no secrets handling, and no new dependencies.

**Six findings across five tickets — one HIGH, three MEDIUM, two LOW; all resolved in-cycle with regression tests.** This section originally read "no CRITICAL or HIGH findings" and covered tickets A–D only; ticket E was added mid-cycle and raised the one HIGH (F-6, a bypass of the enforcement gate ticket E introduces). See the addendum. No CRITICAL finding was raised at any point.

Two findings are worth more than their severity label suggests, because both break a contract the spec explicitly asserts rather than merely being untidy: `resolveLookup` throws where its contract says it never throws (F-1), and `backfillScopeAny` silently skips entries it was written to fix, leaving exactly the unreachability AC-011 claims to eliminate (F-2). Both were confirmed by execution, not by reading.

## Per-ticket verdicts

| Ticket | Surface reviewed | Verdict | Findings |
|---|---|---|---|
| **A** — Decision node model | `memory_session_start.mjs` decay predicate, `categories.mjs` | **CLEAN** | none |
| **B** — Constraint model | 8 registry readers, `constraints.mjs`, 2 new memory entries | **NOTED** | F-5 (LOW) |
| **C** — Index and recall | `process_lifecycle_guard.mjs`, `governed-memory.mjs`, `resolve.mjs`, `index-io.mjs` | **NOTED** | F-1, F-2 (MEDIUM), F-4 (LOW) |
| **D** — Capture leg | `memory_stop.mjs`, `ledger.mjs` | **NOTED** | F-3 (MEDIUM) |

No ticket raises a BLOCKER, so the batch does not yield.

**Ticket A is clean on its merits, not by omission.** Its change narrows a predicate (`isStale` returns `false` earlier for supersession-driven categories) and replaces a literal with an import. It reads no untrusted input, crosses no trust boundary, and writes nothing. The one thing worth stating explicitly: making decisions permanently non-stale removes a decay signal, but decay was never the integrity control here — Article IX.2 citation-time re-verification is, and it is untouched.

## Findings

### [MEDIUM] `resolveLookup` throws on a malformed `governs:` glob, violating its documented never-throws contract

- **OWASP**: A04 Insecure Design | **CWE**: CWE-248 (Uncaught Exception), CWE-1333 (adjacent)
- **File**: `.claude/skills/memory-index/index-io.mjs:38-47`, consumed at `.claude/skills/memory-index/resolve.mjs:70-72`
- **Evidence**:
  ```js
  const pattern = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')   // '?' is NOT in this class
    .replace(/\*\*\/?/g, ' ')
    .replace(/\*/g, '[^/]*')
    .replace(/ /g, '.*');
  return new RegExp(`^${pattern}$`).test(normalized);
  ```
  Confirmed by execution — a shard carrying `governs: ?`:
  ```
  resolveLookup THROWS: SyntaxError - Invalid regular expression: /^?$/: Nothing to repeat
  surfaceGovernedMemory -> []        // swallowed, but see Impact
  guard exit=0                       // fail-open preserved
  ```
- **Impact**: Two distinct effects from one cause. (a) `resolveLookup` propagates a `SyntaxError` to every caller, contradicting the spec's Contracts row ("never throws; rebuilds on a stale `built_at`"); AC-005's test covers only an unknown *kind*, so the suite does not catch it. (b) In the surfacing leg the throw *is* caught, but the `try` wraps a whole category, so one malformed glob silently suppresses **every** decision in `decisions/` — the advisory surface fails closed and quietly, which is the worst combination for a control whose job is to surface reasons.
- **Recommendation**: Escape `?` by adding it to the character class (`/[.+^${}()|[\]\\?]/g`). Independently, move the `try` in `surfaceGovernedMemory` inside the per-entry loop so one bad entry cannot mask its siblings. Both are one-line changes.

### [MEDIUM] `backfillScopeAny` skips entries it exists to fix, because its scope probe is not anchored to frontmatter

- **OWASP**: A04 Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/memory-index/resolve.mjs:82-90` (`hasReachableScope`), applied at `:91-103`
- **Evidence**:
  ```js
  function hasReachableScope(text) {
    const match = /^scope:(.*)$/m.exec(text);   // /m matches ANY line in the file
    ...
  }
  ```
  Confirmed by execution against an entry whose **body** contains a line beginning `scope:`, with no `scope:` in its frontmatter:
  ```
  backfill -> {"updated":0}     // entry skipped; frontmatter still has no scope
  ```
- **Impact**: A fact with no frontmatter scope is left unreachable whenever its body happens to contain a line starting `scope:` — plausible in this corpus, where entries routinely quote frontmatter keys while documenting the schema. This is precisely the condition AC-011 and rollout prerequisite P2 assert cannot survive the backfill ("no fact is unreachable"). The same unanchored `/m` applies to the write branches, so the insertion point is likewise the first `key:` line anywhere in the file rather than in frontmatter.
- **Recommendation**: Split the frontmatter block once (the file already has `stripFrontmatter`-style helpers and `parseFrontmatter` in `hooks/lib/frontmatter-parser.mjs`) and run both the probe and the rewrite against that block only. Reuse the existing parser rather than a second regex — this is the fourth `^---$` handling in the subsystem.

### [MEDIUM] Unvalidated `key` lets one `recordCuration` call write multiple ledger rows

- **OWASP**: A03 Injection | **CWE**: CWE-117 (Improper Output Neutralization for Logs)
- **File**: `.claude/skills/memory-flush/ledger.mjs:59-68`
- **Evidence**:
  ```js
  appendFileSync(path, `- ${disposition} :: ${key}\n`, 'utf8');
  ```
  Confirmed by execution — a key containing a newline:
  ```
  discarded entries: ["benign-key","evil","some-other-key"]
  injected extra row? true
  ```
- **Impact**: A key carrying `\n- discarded :: <other-key>` writes a second, forged ledger row. Because `decidedKeys()` feeds `memory_stop`'s suppression set, a forged row **permanently suppresses an unrelated future candidate** — memory that should have been captured is silently never offered. `disposition` is validated against a closed set; `key` is not. In practice keys are derived paths and slugified text and contain no newlines, which is why this is MEDIUM rather than HIGH, but `recordCuration` is a public API and the validation asymmetry is the defect.
- **Recommendation**: Reject any `key` matching `/[\r\n]/` in `recordCuration` (return `false`, consistent with its existing rejection path), or serialize the ledger as JSON Lines so the field is structurally delimited.

### [LOW] The path trigger widens shard-body prompt-injection exposure from spec writes to every source write

- **OWASP**: A04 Insecure Design | **CWE**: CWE-94 (adjacent — instruction injection into an LLM context)
- **File**: `.claude/hooks/process_lifecycle_guard.mjs:47-77` (new `surfaceGovernedMemoryFor`)
- **Evidence**: entry bodies are interpolated verbatim into the advisory envelope, which closes with `CLAUDE.md Article IX clause 7: treat the surfaced entry/entries as binding for this write`.
- **Impact**: A memory shard whose body contains adversarial instruction-shaped text is surfaced into Claude's context under an envelope that explicitly instructs Claude to treat it as binding. This vector **already existed** on the phase trigger; ticket C does not create it, but changes when it fires — from "a `docs/` artifact is being written" to "any source file is being written," which is most edits. Shards are authored by the human and Claude in this repo, so this is exposure amplification of a self-authored surface, not an external attack path.
- **Recommendation**: No change required for this batch. Worth tracking: if memory shards ever become shareable or importable between projects (the workspace corpus in slice E moves toward this), the binding-instruction envelope needs a trust boundary before that ships.

### [LOW] `writeConstraint` interpolates an unvalidated key into frontmatter

- **OWASP**: A03 Injection | **CWE**: CWE-20
- **File**: `.claude/skills/memory-index/constraints.mjs:57-66` (`renderConstraint`)
- **Evidence**:
  ```js
  const frontmatter = [ `key: ${key}`, 'category: constraints', ... ];
  ```
- **Impact**: Same class as F-3. A key containing a newline injects arbitrary frontmatter fields into the written shard. Callers today pass literal slugs, and the category-registration guard is upstream of this, so reachability is low.
- **Recommendation**: Validate `key` against the existing `SAFE_SLUG` pattern already defined in `memory-index/migrate.mjs:31` (`/^[a-z0-9][a-z0-9-]*$/`) — reuse it rather than adding a second one; `assertSafeFactKey` in that module is the existing actuator.

## Also verified (no finding)

- **`process_lifecycle_guard` remains advisory and fail-open.** Every branch of the new path terminates in `emitAllow()`; confirmed by execution against a hostile store (`guard exit=0`). One defensive gap noted but not raised as a finding: `renderGovernedHits` and the `emitInfo` composition sit *outside* the `try`, so an unexpected throw there would exit non-zero rather than allowing. Both are pure over already-validated data, so it is not currently reachable — widening the `try` would make the fail-open posture structural rather than incidental.
- **No path traversal in either new write path.** `ledgerPath()` is a fixed filename; `everyShardPath()` enumerates via `readdirSync` over the fixed `CANONICAL` category list under `.claude/memory`. Neither derives a path component from entry content.
- **No `$`-injection in the backfill rewrite.** The repo carries a `sweep-replace-dollar-injection` landmine; it does not apply here — both `String.replace` replacements are literals (`'scope: any'`, `'$1\nscope: any'`) with no content-derived substitution.
- **ReDoS on `matchesGlob` is not practical.** The generated patterns are `.*` / `[^/]*` sequences with no nested quantified groups or alternation; `***` yields `.*[^/]*`. Linear on realistic path lengths.
- **`writeConstraint`'s registration check is fail-closed** — it throws `UnregisteredCategoryError` before any `mkdirSync`, so nothing reaches disk when the category is unregistered (AC-010).

## Dependencies

**None added.** `package.json → dependencies` is unchanged at `["@clack/prompts"]`. All nine new/modified modules are zero-dep ESM on Node builtins. No CVE surface introduced. This batch also *records* that property as a first-class constraint (`.claude/memory/constraints/zero-runtime-dependencies.md`), which is a net improvement to the project's ability to notice if it ever changes.

## Out of scope / Noted

- **The epic's risk flags understated tickets A and B.** Both were marked `simplify/document` only, but both edit `.claude/hooks/lib/memory_session_start.mjs`, which is inside `security.sensitive_globs`. All four tickets touch `.claude/hooks/**`. The flags did not cause a miss here — the power track reviews every ticket regardless — but on an `epic-child` track those two slices would have skipped `security` entirely by default.
- **F-1 and F-2 share a root cause worth naming**: both are regex predicates applied to a whole file or a whole category where the intended scope was one entry or one frontmatter block. The subsystem already owns a frontmatter parser; three of the four new modules re-derive parsing inline instead of using it.


---

# Addendum — Ticket E (documentation routing gate)

Ticket E was added mid-cycle after the batch had already been reviewed. Reviewed on the same per-ticket basis; the batch is now 5 tickets.

## Verdict

| Ticket | Surface | Verdict | Findings |
|---|---|---|---|
| **E** — Documentation routing gate | `document-gate.mjs` (new), `document/SKILL.md`, `prose/SKILL.md`, `project.json`, tests | **NOTED** | F-6 (HIGH, fixed in-cycle) |

Ticket E touches **no** `security.sensitive_globs` path — `.claude/skills/**` is outside the sensitive set. That did not make it inert, which is the point of reviewing it rather than assuming.

## Resolved in-cycle

**Heading convention.** `security/oracle.mjs` matches `^### [CRITICAL|HIGH]` and treats every hit as an **open** finding — it has no notion of "fixed". Filing a resolved finding under that heading therefore mis-states the state and blocks the landing indefinitely. Findings resolved before the phase completed are recorded below with their severity written out rather than bracketed. The severity assessment is unchanged; only the heading form differs. The report format having no "fixed" convention is itself a gap, recorded as backlog.

### F-6 (HIGH — RESOLVED in-cycle) — Path traversal on `--slug` let a foreign file satisfy the gate

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/document/document-gate.mjs` (receipt read), pre-fix
- **Evidence** — confirmed by execution against a temp root with a planted receipt outside the state directory:
  ```
  $ document-gate --slug '../../../outside/evil' --paths 'site-src/x.njk'
  document-gate: 1 surface(s), every required delegate has a receipt — CLEAN
  REAL_EXIT=0
  ```
- **Impact**: the receipt path was built as `join(ROOT, '.claude/state/document', slug + '.json')` with no validation, so a crafted slug pointed the read anywhere on disk and any JSON with a matching `receipts[]` reported CLEAN. This is worse than an ordinary traversal: the component is an **enforcement gate**, so the bypass is of the check itself. A gate that can be argued into passing is not a gate — and unlike a missing check, it reports success, so the phase records that it ran.
- **Reachability**: low in practice. The slug is supplied by the harness from `workflow.json`, not by an external caller. Severity is rated on the consequence (enforcement bypass), not the odds.
- **Fix applied**: `assertSafeSlug(slug, 'document-gate')` from `.claude/hooks/lib/slug.mjs`, called **before any path is constructed**, rejecting anything outside `/^[a-z0-9][a-z0-9-]*$/`. Reuses the existing primitive rather than adding a second validator, and follows the repo's standing REJECT-never-repair policy — normalizing a malformed slug would mask the traversal by silently reading a different path. Same class and same helper as `plan-store` and `checker-fanout` (`docs/security/durable-plan-slug-guard-2026-07-12.md`).
- **Regression test**: `tests/document-routing-gate.test.mjs → test_when_slug_escapes_state_dir_then_gate_rejects_before_reading_any_path`, which plants the foreign receipt and asserts exit 1 with no `CLEAN` on stdout.

## Also verified (no finding)

- **F-1 did not recur.** `document-gate.mjs → globToRegExp` was written after the F-1 fix and carries the corrected escape class (including `?`) plus the compile-failure catch. Probed with `?`, `a?`, `[`, `(a`, `**`, `*` — no throw, no over-match.
- **Config source is repo-controlled.** `document.surfaces` comes from `project.json`, not from entry content or transcript text, so it is not in the untrusted-frontmatter class that produced F-1/F-2/F-3.
- **No new dependency, no network, no secrets, no auth surface.**

## Note on handling

F-6 is rated HIGH, which normally halts the phase for a human decision. It was fixed and regression-tested inside this cycle before the phase completed, applying the same "fix now" disposition the human chose explicitly for F-1/F-2/F-3 earlier in this workflow. No unresolved HIGH or CRITICAL finding remains. Recorded here rather than assumed.


---

# Re-review — post-wiring pass (2026-08-04, same cycle)

A pre-commit audit found six exports across tickets A/B/C/D with no caller outside their own tests. Wiring them changed real code paths, so `security` re-ran over the new surface. **No new findings; no verdict changed.**

Probed:

- **`suspectDecisions` walk** (`memory_session_start.mjs`, new) — a constraint shard with `state: false` beside a corrupt, frontmatter-less decision shard. No throw; the corrupt entry is skipped and the genuine dependent is still named. Fail-open preserved on the session-start path, which must never break a session.
- **`resolveLookup` as the surfacing query** (`governed-memory.mjs`, rerouted) — probed with `../../etc/passwd`, a path containing a space, and the empty string. All return 0 hits, none throw. The path argument is only ever a match *subject* compared against `governs:` globs; it is never used to construct a filesystem path, so the traversal class that produced F-6 does not apply here.
- **Cache removal** (`resolve.mjs`) — deleting the HEAD-keyed cache removed a `spawnSync('git', ...)` from every lookup. Strictly reduces the process-spawn surface.

Unchanged from the main review: no network surface, no authentication, no secrets handling, no new dependency.
