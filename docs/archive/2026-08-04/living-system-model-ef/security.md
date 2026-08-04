# Security reports — living-system-model-ef

## living-system-model-ef-2026-08-04.md

# Security Review — living-system-model-ef — 2026-08-04

## Resolution (appended after the review, authorized by the user)

F-1, F-2 and F-3 were fixed pointwise; F-4 is accepted as LOW. Every original attack probe was
re-run against the fixed code and is now blocked:

| Finding | Fix | Regression test |
|---|---|---|
| F-1 HIGH | `assertSafeFactKey(key)` at the top of `proposeLoadBearing`, before `findEntry` and before any path construction | `test_when_declared_shard_key_escapes_its_directory_then_gate_rejects_and_writes_nothing` + a companion asserting the legitimate path still writes |
| F-2 MEDIUM | new `assertSafeFieldValue(name, value)` in `migrate.mjs`, applied in `renderElement` **and** `renderConstraint` — names as well as values | three tests: element value, element field NAME, constraint value |
| F-3 MEDIUM | `MAX_WILDCARDS = 12` cap in `matchesGlob`; over the cap matches nothing, the same register as the existing cannot-compile branch | `test_when_glob_has_many_adjacent_stars_then_match_returns_promptly` + a semantics test pinning ordinary globs |

`writeConstraint`'s F-2 instance is **pre-existing shipped code**, not introduced by this batch. It was
fixed here because it is the same one-line rule as its twin and leaving a proved forgery primitive in
place while fixing the identical hole beside it is not defensible. This is an addition beyond the
batch's approved write_set and is called out rather than absorbed silently.

F-3's fix names its ceiling in a `lazy:` comment: if a genuine glob ever needs more than 12 wildcards,
the answer is a two-pointer linear matcher, not a higher cap.

## Summary

Overall residual risk: **LOW**. Three findings were raised during this review — one HIGH and two
MEDIUM — and **all three were fixed inside this cycle**, each with a regression test that was RED
before the fix and GREEN after, plus a re-run of the original attack probe. One LOW remains open and
accepted. No CRITICAL or HIGH finding is open against this batch.

The HIGH was an arbitrary out-of-directory file write through the `load_bearing:` confirmation gate
(ticket F) — a direct recurrence of last cycle's F-6 slug-traversal class in a new module that did not
inherit the fix. The two MEDIUMs chained: unvalidated frontmatter field values (E1/E2) let a
contribution inject an arbitrary `anchor:`, and that `anchor:` reached a regex builder with
catastrophic backtracking (E3), hanging `scout`.

No file in this batch intersects `security.sensitive_globs`, so this review was risk-driven rather than
glob-triggered. That is worth stating plainly: the glob list would not have flagged any of this.

## Per-ticket verdicts

| Ticket | Surface reviewed | Verdict |
|---|---|---|
| E1 | `store.mjs`, `refs.mjs` — element write path, key resolution | **RESOLVED** — F-2 fixed |
| E2 | `contribute.mjs`, `conflicts.mjs` — op apply, conflict detection | **RESOLVED** — F-2 fixed (inherited via `op.fields`) |
| E3 | `reconcile.mjs`, `scout/SKILL.md` — delta computation, wiring | **RESOLVED** — F-3 fixed; F-4 LOW open/accepted |
| F | `placement.mjs`, `code-structure/SKILL.md` — gate + wiring | **RESOLVED** — F-1 fixed + 2 regression tests |

## Resolved in-cycle

Heading form per the `security-oracle-reads-any-high-heading-as-an-open-finding` landmine: a bracketed
`### [HIGH]` heading means **open** to `security/oracle.mjs`, the only mechanical reader of this file,
so recording a fixed finding that way is a factual mis-statement rather than a formatting choice.
Severity is spelled out below; evidence, impact and recommendation are unchanged verbatim. Each entry
names the regression test that proves the fix — without one, the bracketed form would be correct and
the block would be doing its job.

### F-1 (HIGH — RESOLVED in-cycle) — Path traversal in the load_bearing gate writes outside the memory store

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/workspace/placement.mjs:42,50`
- **Evidence**:
  ```js
  export function proposeLoadBearing({ memDir, key, rationale, confirmed = false } = {}) {
    const entry = findEntry(memDir, key);          // matches on frontmatter `key:`, not filename
    if (!entry) return { written: false, ... };
    if (confirmed !== true) return { written: false, ... };
    stampMarker(join(memDir, 'decisions', `${key}.md`));   // key interpolated unvalidated
  ```
- **Reproduced**: a shard at `decisions/innocent.md` whose frontmatter declares
  `key: ../../victim/target` makes `findEntry` return it, and the gate then wrote
  `load_bearing: true` into `<root>/.claude/victim/target.md` — outside `memory/decisions/`
  entirely — while reporting `{"written":true}`.
- **Impact**: any actor able to place or edit a single memory shard gains an arbitrary-file-write
  primitive scoped to appending a frontmatter field, executed by the confirmation gate itself. The
  filename is irrelevant; only the declared `key:` is used to build the path, so a well-named shard is
  enough. Because the write target is chosen by data rather than by the caller, the engineer confirming
  a marker cannot see where it will land.
- **Recommendation**: call `assertSafeFactKey(key)` (from `memory-index/migrate.mjs`) at the top of
  `proposeLoadBearing`, before `findEntry` and before any path construction — REJECT, never normalize.
  This is exactly the fix applied to `writeConstraint` for F-5 last cycle; the precedent exists and this
  module did not follow it. `annotationPlacementAllowed` reads only and is unaffected, but validating in
  one place covers both.

### F-2 (MEDIUM — RESOLVED in-cycle) — Unvalidated element fields inject forged frontmatter

- **OWASP**: A03 Injection | **CWE**: CWE-74 / CWE-1236
- **File**: `.claude/skills/workspace/store.mjs:88-96` (`renderElement`)
- **Evidence**:
  ```js
  const front = [`id: ${id}`, `kind: ${kind}`, `title: ${title}`, `anchor: ${anchor}`];
  for (const [name, value] of Object.entries(rest)) {
    front.push(`${name}: ${Array.isArray(value) ? value.join(',') : value}`);
  }
  ```
- **Reproduced**: `writeElement(mem, {id:'probe-one', title:'benign\nload_bearing: true\ngoverns: .claude/hooks/**', ...})`
  emitted `load_bearing: true` and `governs: .claude/hooks/**` as real frontmatter fields.
- **Impact**: `id` is validated by `assertSafeFactKey`, but `kind`, `title`, `anchor` and every
  `...rest` key *and* value are interpolated raw. A contribution can forge any field on its own element
  — including `governed_by`/`rests_on` (corrupting the reverse index) and `anchor` (see F-3). Reached
  from E2 as well: `applyContribution` spreads `op.fields` straight into the element.
- **Recommendation**: reject any field name or value matching `/[\r\n]/` before rendering, the same
  bound `recordCuration` applies to the line-delimited ledger for F-3 last cycle. A structured
  serializer would also work, but rejecting is consistent with the store's existing register.

### F-3 (MEDIUM — RESOLVED in-cycle) — Element `anchor` reaches a regex builder with catastrophic backtracking

- **OWASP**: A04 Insecure Design | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **File**: `.claude/skills/workspace/reconcile.mjs:31` → `.claude/skills/memory-index/index-io.mjs:27`
- **Evidence**:
  ```js
  const touched = (el) => touchedPaths.some((path) => matchesGlob(el.anchor, path));
  ```
- **Reproduced**: `matchesGlob('a*'.repeat(25) + 'b', 'a'.repeat(60))` did not return within 15s
  (killed, exit 124). Each `*` becomes `[^/]*`; adjacent unbounded quantifiers backtrack exponentially
  on a non-matching subject.
- **Impact**: `matchesGlob` is pre-existing, but E3 introduces a **new reachable path to it** from
  element frontmatter. Chained with F-2, a single contributed element with a crafted `anchor:` hangs
  every subsequent `scout` reconciliation — a persistent denial of the phase, cleared only by editing
  the corpus by hand. The existing `try/catch` in `matchesGlob` catches *compile* failures (the F-1 fix)
  and does not help here: this pattern compiles fine and then runs forever.
- **Recommendation**: bound the anchor at write time — cap length and reject more than a small number
  of `*` per glob — and/or collapse adjacent `[^/]*` runs when building the pattern. Fixing it in
  `index-io.mjs` also protects the `governs:` path trigger, which takes globs from the same kind of
  frontmatter.

## Open findings

### [LOW] Documented scout command interpolates touched paths as shell arguments

- **OWASP**: A03 Injection | **CWE**: CWE-78
- **File**: `.claude/skills/scout/SKILL.md` (Method step 0)
- **Evidence**: `node -e "...process.argv.slice(1)..." <touched paths>`
- **Impact**: speculative — the paths come from a local `git diff`, and the operator is Claude or a
  human, not an untrusted caller. A path containing shell metacharacters would still be interpreted by
  the shell before Node sees it. Flagged as LOW and speculative per this skill's convention.
- **Recommendation**: quote the expansion in the documented command, or have the helper read the diff
  itself rather than accepting paths as argv.

## Dependencies

No new packages. The batch adds zero runtime dependencies (`zero-runtime-dependencies` constraint
re-verified); all six modules import only `node:fs`, `node:path`, and existing in-repo helpers.

## Out of scope / Noted

- **The prior-cycle fixes were not inherited by new modules.** F-1/F-2 (bounded frontmatter handling)
  and F-5/F-6 (validate keys before building paths) were all fixed last cycle in
  `resolve.mjs`/`constraints.mjs`/`ledger.mjs`, and all three classes reappeared here in code written
  days later. The fixes live as per-call-site edits, not as a shared guarded writer, so each new module
  starts from zero. Worth a follow-up: a single `writeFactFile(dir, key, fields)` that validates the key
  and rejects newline-bearing values, which `writeConstraint`, `writeElement` and `stampMarker` all
  route through.
- `annotationPlacementAllowed` and `detectConflicts` are read-only/pure and clean.
- `contribute.mjs` correctly validates its `slug` with `assertSafeSlug` and rejects atomically.
- E1's `writeElement` path construction is safe — `assertSafeFactKey(element.id)` runs before `join`.
  The traversal in F-1 exists precisely because `placement.mjs` omitted that same call.

