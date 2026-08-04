# Security reports — workspace-corpus-seed

## workspace-corpus-seed-2026-08-04.md

# Security Review — workspace-corpus-seed — 2026-08-04

## Summary

Overall risk: **LOW**. No CRITICAL or HIGH findings. Two LOW observations, both accepted. Every
prior-cycle finding class was re-probed against the code this cycle changed and all are closed.

No file in this diff intersects `security.sensitive_globs` (`.claude/hooks/**`,
`.claude/commands/**`, `src/cli/**`, `bin/**`, `**/auth/**`, `**/*.env*`). As last cycle, that means
this review was risk-driven rather than glob-triggered — the glob list would not have flagged the new
path-building code in `removeElement`.

## Scope

`.claude/skills/workspace/{flags,seed-elements}.mjs` (new), `.claude/skills/workspace/{contribute,store}.mjs`
(modified), `.claude/project.json` (two keys), `.claude/skills/{scout,code-structure}/SKILL.md` (flag
gates), two spec C4 repairs, three test files.

## Prior-finding classes re-probed

| Class | Origin | Probe result |
|---|---|---|
| CWE-22 path traversal via an id interpolated into a path | F-1, `placement.mjs` | **Closed.** `removeElement` is new this cycle and builds `elements/<id>.md`. `assertSafeFactKey(id)` runs before `join`; `removeElement(mem, '../../victim/keep')` throws and the victim file is untouched. |
| CWE-74 forged frontmatter via unvalidated field name or value | F-2, `renderElement` / `renderConstraint` | **Closed.** All 14 seed ops carry zero newline-bearing field names or values, and `writeElement` still routes every field through `assertSafeFieldValue`. |
| CWE-1333 catastrophic backtracking via a crafted glob | F-3, `matchesGlob` | **Not reachable from new code.** The 14 anchors are authored constants, each ≤ 3 wildcards, far under `MAX_WILDCARDS`. |
| Unbounded key reaching a line-delimited store | F-3/F-5 | **Closed.** Every `target_id` matches `/^[a-z0-9][a-z0-9-]*$/`. |

## Findings

### [LOW] Feature-flag readers trust local config without schema validation

- **OWASP**: A05 Security Misconfiguration | **CWE**: CWE-1188
- **File**: `.claude/skills/workspace/flags.mjs:30`
- **Evidence**: `config?.memory?.[name]?.enabled === true`
- **Impact**: speculative, and stated as such. `project.json` is a local, developer-owned file already
  trusted for `test.cmd` — a writer who can change it has stronger primitives than a feature flag. The
  strict `=== true` comparison means every exotic shape (string, object, number, null) resolves
  `false`, so the failure direction is off rather than on, which is the safe one. Probed with a nested
  object payload: returns `false`.
- **Recommendation**: none required. Recorded so a future reader knows the check is deliberate rather
  than accidental.

### [LOW] `applyContribution` resolves refs across the whole contribution before writing

- **OWASP**: A04 Insecure Design | **CWE**: n/a
- **File**: `.claude/skills/workspace/contribute.mjs:29`
- **Evidence**: `ops.flatMap((op) => resolveRefs(memDir, op.fields ?? {}).unresolved)`
- **Impact**: this is a correctness property, noted here because it is easy to "optimize" into a
  vulnerability. Resolving per-op and writing as it goes would make a partial corpus reachable when a
  later op fails — the atomicity that `detectConflicts` already guarantees would be silently lost for
  the refs path. The whole-contribution check preserves it.
- **Recommendation**: keep the two-pass shape. If a future change makes this lazy or streaming, the
  atomic-rejection invariant needs an explicit test.

## Dependencies

No new packages. Zero runtime dependencies; `node:fs` and `node:path` only. The
`zero-runtime-dependencies` constraint was re-verified for this cycle.

## Out of scope / Noted

- **`detectConflicts` sibling-blindness remains open.** A single contribution can still create a
  duplicate-anchor state it would reject on re-apply. Not a security issue — an availability/
  correctness one — and documented in the approved spec as deliberately out of scope. It is the reason
  the element set is 14 rather than 17.
- **The two shipped defects fixed this cycle were not security findings** but are worth recording next
  to them: `applyContribution` never called `resolveRefs` (so an element could cite a governing
  decision that does not exist), and `remove` was a silent no-op. Both from `6fc019d`; both now tested.
- `.claude/project.json` gained two keys, both defaulting `false`. A consumer pulling the template gets
  no behaviour change until it opts in — which is the entire point of D5.

