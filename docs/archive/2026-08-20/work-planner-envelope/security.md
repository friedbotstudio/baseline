# Security reports — work-planner-envelope

## work-planner-envelope-2026-08-20.md

# Security Review — main (work-planner-envelope) — 2026-08-20

## Summary

Overall risk: **LOW**. The change adds no network, credential, or crypto surface and
no dependency. Two findings, both MEDIUM/LOW, both in files this workflow created and
both fixed by reusing a helper the repository already ships.

## What was checked

- `git diff` over 20 changed files: 7 new `.claude/skills/harness/*.mjs` modules, 5
  test files, 2 SKILL.md procedures, 3 config/data files, 4 workflow artifacts.
- Trust boundaries: the `work-planner.mjs check` CLI entry point (argv), the
  archived-corpus reader (repository-controlled `docs/archive/**`), the backlog
  reader (repository-controlled `.claude/memory/backlog/*.md` frontmatter), and two
  writers of `.claude/state/workflow.json`.
- OWASP A01/A03/A04/A05/A08 against those boundaries; path traversal on every
  slug-taking entry; ReDoS on all four new frontmatter regexes; secrets hygiene.
- Dependency delta: none. Every new module imports `node:fs`, `node:path`,
  `node:url` only, so no CVE surface and no advisory lookup applies.
- No security linter is configured in `project.json`.

## Findings

### [MEDIUM - RESOLVED] `workflow.json` is written non-atomically by two new writers

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-362
- **File**: `.claude/skills/harness/proposal.mjs:24`, `.claude/skills/harness/reentry.mjs:46`
- **Evidence**:
  ```js
  function writeWorkflow(rootDir, workflow) {
    workflow.updated_at = Math.floor(Date.now() / 1000);
    writeFileSync(workflowPath(rootDir), `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
  }
  ```
- **Impact**: `workflow.json` is the durable truth across sessions (Article V) and
  gates every phase-ordering decision `track_guard` makes. A crash during
  `writeFileSync` leaves a truncated file; the next read throws or parses short, and
  a workflow mid-landing loses `completed[]`, its exceptions, and
  `source_backlog_keys` — the last being what makes `/commit` stamp backlog closure.
  `reentry.mjs` is called precisely at re-entry, when the session is already unstable.
- **Recommendation**: use `writeJsonAtomic` from `.claude/hooks/lib/common.mjs:178`,
  which implements write-to-temp-then-rename with temp cleanup on failure. It exists
  and is exported; both new writers hand-rolled past it. A reuse-before-create miss,
  not a missing capability.

### [LOW - RESOLVED] Backlog keys reach the terminal without control-character neutralisation

- **OWASP**: A03 - Injection | **CWE**: CWE-150
- **File**: `.claude/skills/harness/work-planner.mjs:79`
- **Evidence**:
  ```js
  for (const c of verdict.proposal.candidates) lines.push(`  ${c.key}`);
  ```
- **Impact**: `c.key` comes from a backlog shard's frontmatter — repository-controlled
  content on its way to a terminal. An ANSI erase-line escape in a key rewrites the
  line above it, which in a proposal listing is the line naming another candidate, so
  the operator approves a set that differs from the one displayed. Operator-controlled
  input rather than remote, hence LOW.
- **Recommendation**: route the key through `clip` from
  `.claude/skills/lib/terminal-text.mjs:18`. Its header names this case: "an
  erase-line escape in any of them wipes the line printed above it and forges a
  passing row." The `roadmap` reader and the `backlog-deferral` checker already route
  the same class of content through it.

## Remediation

Both findings were fixed inside this workflow rather than deferred, because their
files were already in the write set: `security` had just read them and `integrate`
re-runs the suite regardless, so the marginal cost was near zero while a deferral
would have paid a full mechanical tail.

- **MEDIUM** — `proposal.mjs` and `reentry.mjs` now call `writeJsonAtomic` from
  `.claude/hooks/lib/common.mjs:178`. Neither file imports `writeFileSync` any more,
  so the non-atomic path is gone rather than merely unused.
- **LOW** — `work-planner.mjs` now routes each candidate key through `clip`.
  Measured against a crafted shard whose `key:` carries a literal erase-line escape:
  the escape survives `proposeWork` and is absent after `clip`.

## Dependencies

None added.

## Out of scope / Noted

- `assertSafeSlug` (`reentry.mjs:24`) rejects rather than repairs and is called before
  any path is constructed in `recordReentry`, `measurePayload` and `check`. Traversal
  via `--slug` is closed.
- `readCorpus` walks `docs/archive` with `readdirSync` + `join`, which cannot yield
  `..`, and reads only `timing.md` / `workflow.json` at fixed names.
- The four new frontmatter regexes were checked against the
  `adjacent-unbounded-quantifiers-are-quadratic-even-when-anchored` landmine. None
  places two unbounded quantifiers over the same class separated only by an optional
  token: `[\s\S]*?` carries a required terminator at a single anchored start, and the
  two `\s*` in `^status:\s*open\s*$` are separated by a mandatory literal.
- `^status:\s*open\s*$` with `/m` matches across newlines because `\s` includes `\n`.
  Not a security issue — a malformed shard reads as open rather than being skipped —
  but the matcher is looser than it appears.
- `readJson` swallowing parse errors is deliberate: the planner is fail-open by
  Rollout prerequisite 1, and an unreadable config must not take the harness loop down.

