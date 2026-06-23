# Security reports — epic-close-slices-coverage-gate

## epic-close-slices-coverage-gate-2026-06-23.md

# Security Review — epic-close-slices-coverage-gate — 2026-06-23

## Summary
Overall risk: **LOW**. The change replaces the epic-close completion gate in `.claude/skills/commit/epic_close.mjs` with two pure array helpers (`committedSliceIds`, `uncoveredSlices`) and a slices-coverage check, plus a backward-compatible test fixture param. No new path construction, no command/shell surface, no new dependency, no secret. The only trust boundary — the developer-controlled, gitignored `.claude/state/epic/<epic>.json` — is unchanged in how it is read, and the new logic fails safe (toward "in flight", i.e. it blocks rather than wrongly closes) on malformed state.

## Findings

### [LOW] Epic-state shape is consumed without schema validation
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/commit/epic_close.mjs:46-57` (new helpers), `:106-129` (gate)
- **Evidence**:
  ```
  function committedSliceIds(state) {
    const children = Array.isArray(state.children) ? state.children : [];
    return new Set(children.filter((c) => c.status === 'committed').map((c) => c.slice));
  }
  function uncoveredSlices(state) {
    const slices = Array.isArray(state.slices) ? state.slices : [];
    const committed = committedSliceIds(state);
    return slices.filter((s) => !committed.has(s.id));
  }
  ```
- **Impact**: A malformed slice entry (missing `id`) or child (missing `slice`/`status`) is not rejected. In every malformed case the entry is treated as **uncovered** (an `undefined` id is not in the committed Set; a non-`committed` status is not counted), so the gate stays in flight and refuses to close — the safe direction. The pre-existing `Array.isArray(...)` guards already prevent a throw on non-array `slices`/`children`. There is **no** way for malformed state to cause a *wrong close*; the only effect is a (correct, conservative) refusal to close, which is recoverable by the maintainer.
- **Recommendation**: Accept as-is. The fail-safe direction matches the design intent (the whole bug being fixed was a *premature close*; biasing every ambiguity toward "stay open" is correct). The epic state is developer-controlled local runtime state written by `/triage`, not untrusted external input, so strict schema validation here would be defense-in-depth with no live threat. If a broader epic-state hardening pass happens later, fold a shared validator in then (cf. the unrelated durable-plan slug-guard backlog item).

## Dependencies
None added. The diff imports nothing new (`epic_close.mjs` still uses only `node:fs`/`node:path`/`node:child_process`/`node:url`; tests use the existing fixture helpers).

## Out of scope / Noted
- **No path/injection surface added.** The new helpers never touch the filesystem or build a path; `archiveBundle()` (the only path/`git mv` surface, via `archive.sh`) and the epic-name handling are unchanged by this diff.
- **Correctness of the gate (the actual point of the change):** verified by the regression suite — wrong-close is now prevented (lazy-registration test), the slices-gate does not over-block when coverage is complete, and legacy no-slice epics still close via the children fallback.
- The unrelated uncommitted `/memory-flush` edits and the pre-existing untracked `docs/archive/2026-06-22/mvp-sprint-parallel-cycles/` dir were explicitly out of scope and not reviewed here.

