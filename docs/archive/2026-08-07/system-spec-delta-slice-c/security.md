# Security reports — system-spec-delta-slice-c

## system-spec-delta-slice-c-2026-08-07.md

# Security Review — main (system-spec-delta-slice-c) — 2026-08-07

## Summary

Overall risk: **MEDIUM**. The slice adds the corpus's verify-then-apply path, and the entry point `verifyAndApplyDelta` is correctly hardened — it validates every row's element id, concept id and anchor before any read, and the architecture-map flag gate precedes all of it. The exposure is one layer down: `applyDelta` is a public export that writes to the filesystem and validates nothing, relying on a sibling function having been called first. Two findings, both reachable only by calling that export directly (or by a future caller wiring it into a phase), both confirmed by execution against a temp corpus.

**Both findings were fixed in this slice** at the maintainer's direction, in the same register slice B used for its phase-8 MEDIUM. `assertRowsAreSafe` now also rejects an anchor carrying `,` or `=`, and `applyDelta` calls it as its first statement. Three scenarios pin them closed (`tests/system-spec-delta-archive-verify.test.mjs` → `describe('phase-8 …')`), and both original exploits were re-run against the fix and rejected with the corpus byte-identical. The finding bodies below are kept as written, so the evidence stays readable.

Checked and clean: traversal handling on the entry point (CWE-22, rejected before any path is constructed), newline forgery into PlantUML shards and frontmatter (`assertSafeFieldValue` + slice B's `quotedArgument`), glob-pattern denial of service (`matchesGlob` caps wildcards, escapes metacharacters, and swallows compile errors), slug bounds on the workflow slug, and flag-off inertness. No secrets, no crypto, no network, no authN/authZ surface, no new dependencies.

## Findings

### [MEDIUM] [FIXED] A comma in an anchor forges an extra element declaration

- **OWASP**: A03 – Injection | **CWE**: CWE-74 (injection into a structured field)
- **File**: `.claude/skills/workspace/delta.mjs:168` (`declareAnchor`), reached from `applyDelta:192`

- **Evidence**:

  ```js
  const declaration = `${elementId}=${anchor}`;
  const result = writeConcept(specDir, conceptId, {
    anchors: [...declared, declaration].join(ANCHOR_SEPARATOR),
  });
  ```

  `concepts.readConceptMap` splits `anchors:` on `,` and each row on the first `=`. The anchor is interpolated into that delimited field with no check that it contains neither delimiter. `assertSafeFieldValue` (the only downstream guard) bounds `\r\n` and nothing else.

  Executed against a temp corpus, one delta row with anchor `src/foo.mjs,injected=src/secret.mjs`:

  ```
  applyDelta(...) -> {"applied":["foo-guard"],"shardsWritten":["diagrams/foo-guard.puml"]}
  elements: [ 'alpha.md', 'foo-guard.md', 'injected.md' ]
  anchors:  alpha=src/alpha.mjs,foo-guard=src/foo.mjs,injected=src/secret.mjs
  ```

- **Impact**: one declared row materializes two elements. The second is undeclared, absent from the delta table a reviewer reads at gate A, and anchored wherever the injected text points. Since the model routes reads by anchor, the forged element silently widens what the corpus claims to describe. `verifyAndApplyDelta` is **not** vulnerable — an anchor carrying a comma matches no touched path and no governed file, so `confirms()` rejects it. The exposure is the direct export.

- **Recommendation**: reject a `,` or `=` in an anchor in `assertRowsAreSafe`, in the REJECT-never-normalize register the module already uses for traversal. Stripping the delimiter would silently write an anchor other than the one the author named — the same reason `quotedArgument` rejects rather than escapes.

### [MEDIUM] [FIXED] A rejected traversal anchor is persisted before it is rejected

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-22 (residue of a rejected path)
- **File**: `.claude/skills/workspace/delta.mjs:192-200` (`applyDelta` write ordering)

- **Evidence**:

  ```js
  for (const row of confirmed) declareAnchor(specDir, row);   // writes the concept record
  materialize({ specDir, rootDir });                          // THEN validates the anchor
  ```

  `materialize` → `assertEveryAnchorResolves` is the first thing that inspects the anchor, and it runs after `declareAnchor` has already committed it to disk:

  ```
  applyDelta(anchor: "../../../etc/passwd")
    -> THREW: unresolvable anchors (materialization refused): foo-guard -> ../../../etc/passwd
  anchors: alpha=src/alpha.mjs,foo-guard=src/foo.mjs,injected=src/secret.mjs,foo-guard=../../../etc/passwd
  ```

- **Impact**: no file outside the tree is read or written — `stampElement` and `readSourceText` both refuse the path later. The damage is corpus poisoning: the traversal string is now a permanent row in the concept's authored `anchors:` field, and every subsequent `materialize` anywhere in the repo (`/archive` Step 5, `/spec-sync`, `/system-reconcile`'s callers) throws on it. One hostile row wedges the corpus until a human hand-edits the concept file. The throw looks like a bug in the next workflow rather than a rejected attack in this one.

- **Recommendation**: call `assertRowsAreSafe(confirmed)` as `applyDelta`'s first statement, so the public export validates its own input rather than inheriting validation from a caller that may not have run. That single line closes this finding and, with the delimiter check above, the previous one.

## Dependencies

No new packages. The slice imports only in-repo modules (`hooks/lib/slug.mjs`, `workspace/{concepts,coverage,digest,flags,materialize,shards,store}.mjs`) and `node:path`. `npm audit` was not run — no dependency manifest changed in this diff.

## Out of scope / Noted

- `assertSafeFieldValue` (`.claude/skills/memory-index/migrate.mjs:61`) bounds `\r\n` only. Every structured field in the corpus that carries its own delimiter — `anchors:` (comma + `=`), `members:` (comma), `governed_by` / `rests_on` (comma) — inherits the first finding's shape. Slice C only needs the anchor case fixed; the general question is whether the codec should own delimiter safety for `LIST_FIELDS` rather than each writer. Worth a follow-up spec, not this slice.
- `record-codec.renderRecord`'s `framedBody` (this diff) normalizes body whitespace on write. It is not a security control and does not weaken one; noted because it is the one change in this diff outside the slice's declared write surface.
- The `remove` verb parses and lints but is verified-not-applied by this slice (recorded in the implement report). No security consequence — the conservative direction is to not delete.

