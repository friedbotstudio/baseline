# Security reports — planner-cli-output

## planner-cli-output-2026-08-20.md

# Security Review — main (planner-cli-output) — 2026-08-20

## Summary

Overall risk: **LOW**. The diff is 40 lines across two files and adds no network, filesystem, credential, or crypto surface. One finding: the fix revives a dead output path that prints repository-controlled task ids to a terminal without neutralising control characters, where the sibling `roadmap` reader does neutralise them.

## What was checked

- `git diff` against the working tree base: `.claude/skills/sprint-planner/planner.mjs` (+6/-4), `tests/cli-pattern-b.test.mjs` (+34/-0).
- Trust boundary: the `select` CLI entry point. Tainted inputs are the input document (literal JSON argv, a file path, or stdin) and the `--capacity` flag.
- OWASP A01/A03/A04/A05/A08 against that boundary; secrets hygiene across both files; dependency delta.
- No new dependencies, so no CVE check applies. No security linter is configured in `project.json`.

## Findings

### [LOW] Task ids reach the terminal without control-character neutralisation

- **OWASP**: A03 - Injection | **CWE**: CWE-150 (improper neutralization of escape sequences)
- **File**: `.claude/skills/sprint-planner/planner.mjs:75-78`
- **Evidence**:
  ```js
  function renderProposal({ features }) {
    if (!features.length) return '(no dependency-ready task)\n';
    return features.map((feature) => `  ${feature.id}`).join('\n') + '\n';
  }
  ```
- **Impact**: An id carrying an ANSI erase-line escape rewrites the line printed above it. In a proposal listing that is the line naming another task, so a crafted roadmap or tasks file can make the printed sprint disagree with the one selected. The id originates in a document the operator supplies, so this is operator-controlled content rather than remote attacker input — hence LOW, not MEDIUM.
- **Recommendation**: Route the id through `clip` from `.claude/skills/lib/terminal-text.mjs`, which exists for exactly this case. Its header names the failure: "an erase-line escape in any of them wipes the line printed above it and forges a passing row." The `roadmap` reader already routes every rendered line through it, and `planner.mjs` renders the same class of content.
- **Note on when this became reachable**: the pre-fix renderer read a property the return value never carried, so `chosen` was always empty and this path printed nothing. The defect masked the exposure. Fixing the render is what makes the path live.

## Dependencies

None added. `planner.mjs` imports only `node:fs`, `node:url`, and `node:path`.

## Out of scope / Noted

- `readInput` treats an argument starting with `{` as literal JSON and anything else as a file path, so a caller can read any path the process can read. That is the intended contract of a local operator CLI and predates this diff.
- `--capacity` is coerced with `Number` and admitted only when `Number.isFinite`, so a non-numeric flag falls back to the input document's value rather than producing `NaN`.

