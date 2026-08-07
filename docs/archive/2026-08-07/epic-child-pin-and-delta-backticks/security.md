# Security reports — epic-child-pin-and-delta-backticks

## epic-child-pin-and-delta-backticks-2026-08-07.md

# Security Review — main (epic-child-pin-and-delta-backticks) — 2026-08-07

## Summary

Overall risk: **MEDIUM**. The diff adds one shared Foundation resolver and wires two existing consumers to it. The pin half is guarded well — `pinned_artifacts.spec` is attacker-shaped input (it becomes a filesystem path) and both its path and its fragment go through `assertNoTraversal` before anything is read. The `slug` half is not: `resolveSpecPath` interpolates the caller's slug into a path with no validation, so a malformed slug escapes `docs/specs/`. One finding, confirmed by execution.

The exposure is not newly *created* — `drift_check.loadSpec` built the same unguarded path before this change — but it is newly *shared*. A per-caller defect became a Foundation primitive that every future caller inherits, and one of its two current callers (`verifyAndApplyDelta`) is safe only because it happens to call `assertSafeSlug` first. That is the same shape as the phase-8 MEDIUM on `applyDelta` one workflow ago: a guard living in the caller rather than in the thing that builds the path.

Checked and clean: pin traversal on both path and fragment (four spellings, all rejected before any read); regex construction in `sliceSection` (metacharacters escaped, so a hostile slice id cannot alter the pattern's shape); `readWorkflow`'s `JSON.parse` (no prototype pollution — `__proto__` from JSON is an own property, and access is via optional chaining on two named fields); the backtick strip in `parseDelta` (anchored to the ends, `.replace` with a literal capture, no injection surface); `delta.mjs`'s read path (it passes `rel` to `store.readSourceText`, whose own `assertNoTraversal` is a second independent barrier). No secrets, no crypto, no network, no authN/authZ surface, no new dependencies.

## Findings

**Fixed in this workflow.** `assertSafeSlug(slug, 'spec slug')` is now `resolveSpecPath`'s first statement, imported from the sibling `hooks/lib/slug.mjs`. One scenario pins it closed (`test_when_the_slug_carries_a_traversal_then_it_is_rejected_before_any_read`), and the original exploit was re-run against the fix and rejected. Applied on the precedent set one workflow earlier, where the maintainer chose to close an identical class of finding in-slice rather than defer it. The finding body below is kept as written so the evidence stays readable.

### [MEDIUM] [FIXED] `resolveSpecPath` builds a path from an unvalidated slug

- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-22 (path traversal)
- **File**: `.claude/hooks/lib/pinned-spec.mjs:64` (`resolveSpecPath`), reached from `.claude/skills/tdd/drift_check.mjs:230`

- **Evidence**:

  ```js
  export function resolveSpecPath({ rootDir = process.cwd(), slug } = {}) {
    const relBySlug = `${SPEC_DIR}/${slug}.md`;
    if (existsSync(join(rootDir, relBySlug))) {
      return { path: join(rootDir, relBySlug), rel: relBySlug, sliceId: null, source: 'slug' };
    }
  ```

  The pin below it is guarded; the slug above it is not. Executed against a temp tree:

  ```
  resolveSpecPath({rootDir, slug: '../../secrets/private'})
    -> {"path":".../secrets/private.md",
        "rel":"docs/specs/../../secrets/private.md",
        "sliceId":null,"source":"slug"}
  READ: SECRET CONTENT
  ```

- **Impact**: arbitrary file read outside `docs/specs/`, bounded to files ending `.md` (the suffix is appended, so `/etc/passwd` is not reachable — `/etc/passwd.md` would be). `drift_check` then scores AC ids against that file's contents and writes the result to `.claude/state/drift/<slug>.md`, so content from outside the spec directory reaches a report that a workflow commits. The slug reaches `drift_check` from `--slug` (harness-supplied) or `workflow.json → slug`, so this is not externally reachable in normal operation; the realistic vector is a malformed slug introduced through repo content the model reads and echoes.

  `verifyAndApplyDelta` is **not** vulnerable: it calls `assertSafeSlug(slug, 'delta workflow slug')` before resolving, and separately passes `rel` through `store.readSourceText`, whose `assertNoTraversal` rejects the traversal a second time. Both are the caller's doing, not the resolver's.

- **Recommendation**: call `assertSafeSlug(slug, 'spec slug')` as `resolveSpecPath`'s first statement, importing it from the sibling `hooks/lib/slug.mjs`. That is one line, it matches what every other path-building primitive in this directory already does, and it moves the guard into the thing that constructs the path rather than leaving it distributed across callers. REJECT, never normalize — `canonicalSlug` in `common.mjs` is a normalizer and would mask the traversal by silently reading a different file.

## Dependencies

No new packages. The diff imports only `node:fs`, `node:path`, and in-repo modules. `npm audit` not run — no dependency manifest changed.

## Out of scope / Noted

- `sliceSection` builds a `RegExp` from the pin's fragment. Metacharacters are escaped so the pattern's shape cannot be altered, but the fragment has no length bound; a pathologically long slice id yields a large (still linear) pattern. Not exploitable as written — noting it because the bound is free if a future change makes the pattern non-linear.
- `assertNoTraversal` is now implemented twice: `workspace/tree.mjs:22` and `hooks/lib/pinned-spec.mjs:32`. Two copies of a security predicate drift independently, and the `/simplify` pass flagged the same duplication on layering grounds. The layering answer and the security answer point the same way — one implementation — so this belongs in the follow-up that resolves the layering question.
- The `rel` field returned by `resolveSpecPath` is deliberately un-normalized (`docs/specs/../../secrets/private.md` above). That is correct for a REJECT-never-repair contract, and `readSourceText` rejects it downstream — but a future caller that joins `rel` itself without a guard inherits the finding above. The recommended fix closes that too.

