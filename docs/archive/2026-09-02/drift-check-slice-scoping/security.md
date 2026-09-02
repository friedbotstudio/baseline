# Security reports — drift-check-slice-scoping

## drift-check-slice-scoping-2026-09-02.md

# Security Review — main (drift-check-slice-scoping) — 2026-09-02

## Summary

Overall risk: **LOW**. The change touches no trust boundary that faces untrusted input — `drift_check` reads the project's own spec, written by the team, and runs as a developer tool. One MEDIUM finding: the fix makes a pre-existing latent branch reachable for the first time, and that branch reports a clean gate having scanned no acceptance criterion. The two widened regexes are safe — the slice id is still fully escaped, and the new pattern backtracks strictly less than the one it replaces.

Reviewed: `.claude/hooks/lib/pinned-spec.mjs`, `.claude/skills/tdd/drift_check.mjs`, `site-src/memory.njk`, `docs/roadmap-execution-plan.md`, `tests/drift-check-slice-scoping.test.mjs` (new), `tests/epic-heading-grammar.test.mjs`, `tests/standup-roadmap-parity.test.mjs`. 124 insertions, 27 deletions across 7 files.

## Findings

### [MEDIUM] A slice label naming an unknown AC id reports a clean gate over an empty scan

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-754 (Improper Check for Unusual or Exceptional Conditions)
- **File**: `.claude/skills/tdd/drift_check.mjs:170`
- **Evidence**:
  ```js
  const scoped = sliceAcIds(section);
  if (scoped.length === 0) return { acs: [], scoping: 'acs-missing' };

  return { acs: all.filter((id) => scoped.includes(id)), scoping: 'scoped' };
  ```
  When the slice's label names ids that appear nowhere in the spec's top-level AC table — a typo, a renumbering, a slice whose ids were rewritten and whose label was not — the filter yields `[]` while `scoping` stays `'scoped'`. Zero AC rows are scored, no banner is emitted, and the run exits 0.

  Reproduced against a spec whose table holds `AC-001` and `AC-002` while its slice label reads `**ACs**: AC-999`:
  ```
  EXIT=0
  ## Acceptance criteria

  | kind | id | verdict | evidence |
  |---|---|---|---|
  ```

- **Impact**: The drift gate passes an epic-child having verified nothing. It is the same vacuous-green failure the module header already warns about twice, one branch further in. No attacker is involved — a spec-authoring mistake is enough, and the resulting green looks identical to a real one.

- **Reachability is new, the branch is not.** The old code carried the same filter, but no real spec ever reached it: `sliceSection` returned `null` for every titled heading on disk, so `scoped.length` was always 0 and the code took the widen-to-everything path instead. Running the pre-change modules against the same fixture returns exit 1 with both table ACs scored. Fixing the scoping is what puts this branch on the live path for the first time.

- **Recommendation**: Add a fifth scoping state for "the label named ids, none of which exist in the table". `parseAcs` already returns a named state per case, so this is one branch and one reason string alongside the two that exist:
  ```js
  const matched = all.filter((id) => scoped.includes(id));
  if (matched.length === 0) return { acs: [], scoping: 'acs-unknown' };
  ```
  with a reason naming the ids the label claimed. A partial mismatch (some ids resolve, some do not) deserves the same treatment and is not covered by the above.

## What was checked and found clean

- **Regex injection via the slice id (CWE-625).** `sliceId` is attacker-influenceable only through `workflow.json → pinned_artifacts.spec`, and reaches `new RegExp` through `String(sliceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. That set covers every RegExp metacharacter that is special outside a character class; `-` is special only inside one, and the id is never interpolated into a class. The escape is unchanged by this diff. `assertNoTraversal` still runs on both halves of the pin before either is used.
- **ReDoS on the widened heading pattern (CWE-1333).** The new `(?![\w-])[^\n]*$` replaces `\s*$`. Because `\s` matches `\n` and `[^\n]` cannot, the new pattern backtracks strictly less than the old one. Measured on a 400 KB body with no terminating heading: 3.6 ms both before and after. On 5000 near-miss headings: 0.3 ms both. The surrounding `([\s\S]*?)(?=^##\s|$(?![\s\S]))` is untouched.
- **The gate cannot go green on a scoping failure.** Both failure states return `acs: []` and are counted as one unresolved item before the exit code is computed (`drift_check.mjs:490`), so a failure exits 1 even when nothing else is scored. `tests/drift-check-slice-scoping.test.mjs` pins this.
- **Path handling in the new test file.** Fixtures use `mkdtempSync`, not a predictable temp path (CWE-377). No fixture escapes its temp root.
- **Secrets.** No tokens, keys, or credentials in the diff.
- **`site-src/memory.njk`.** A single frontmatter date character. No template expression added, so no new output-encoding surface.
- **`docs/roadmap-execution-plan.md`.** Prose only.

## Dependencies

No packages added. `package.json` is unchanged in this diff. No security linters are configured in this project (`lint.cmd` is `null`; no `.semgrep`/`.bandit` config present), so none were run — per the skill's constraint, none were installed.

## Out of scope / Noted

- The 400 KB timing above is a spot measurement on this machine, not a bounded proof. The pattern's shape argues the case more strongly than the number does.
- `sweepArchivedSpecs` uses its own `SLICE_HEADING_RE = /^##\s+Slice\s+\S/m`, which already matched titled headings and was deliberately left alone. It is a presence check, not a scoping one, so it does not share this finding.

