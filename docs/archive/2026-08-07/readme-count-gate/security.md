# Security reports — readme-count-gate

## readme-count-gate-2026-08-07.md

# Security Review — main (workflow `readme-count-gate`) — 2026-08-07

## Summary

Overall risk: **LOW**. The diff adds one read-only Domain export (`checkReadmeCounts`), corrects two numerals in a README, fixes a stale comment, amends spec prose, and adds seven tests. No new dependency, no network call, no credential handling, no write outside `docs/` and the test tree. One real finding: the new code is the **only** caller in the repo that passes a non-literal directory name into `listWorkspaceFiles`, whose `join()` carries no traversal guard of its own. Traversal is structurally impossible today because the regex capture class excludes every character needed to escape — but the safety lives in the regex rather than at the sink, which is one plausible edit away from breaking.

## Findings

### [LOW] Path safety at `listWorkspaceFiles` rests on a regex character class, not on a guard at the sink

- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)
- **File**: `.claude/skills/workspace/readme-gate.mjs:76-79`, sink at `.claude/skills/workspace/store.mjs:42-47`

- **Evidence**:
  ```js
  // readme-gate.mjs — `directory` originates in a README table cell
  const COUNT_ROW = /^\|\s*`([a-z0-9_-]+)\/`\s*\|[^|]*\|\s*(\d+)\s*\|\s*$/;

  function storedCount(specDir, directory) {
    const extension = DIRECTORY_EXTENSION[directory] ?? RECORD_EXTENSION;
    return listWorkspaceFiles(specDir, directory, extension).length;
  }

  // store.mjs — no assertNoTraversal, unlike readSourceText/writeWorkspaceFile
  export function listWorkspaceFiles(specDir, kind, ext) {
    const dir = join(specDir, kind);
    ...
  }
  ```

- **Impact**: None reachable today. The capture class `[a-z0-9_-]+` admits no `.`, `/`, `\` or `:`, so it can produce neither a `..` segment nor an absolute prefix, and `assertNoTraversal`'s two rejection rules are both unreachable by construction. Even granting a traversal, the operation is a directory listing — it returns filenames, reads no content and writes nothing — and the taint source is `docs/system/README.md`, a version-controlled file. An attacker who can edit it already has repository write access.

  The finding is about **durability, not exploitability**. `readSourceText` and `writeWorkspaceFile` both call `assertNoTraversal`; `listWorkspaceFiles` is the one corpus primitive that does not, and this diff is what first hands it a value derived from file content. Widening the class to something natural like `[\w.-]+` to accept a dotted directory name would silently make `..` reachable with no guard behind it, and no test would fail.

- **Recommendation**: Call the existing guard at the sink rather than relying on the caller's regex — `assertNoTraversal(kind)` as the first line of `listWorkspaceFiles`, matching what `writeWorkspaceFile` already does two functions below it. That is one line, fixes both callers and every future one, and follows the repo's stated REJECT-never-normalize doctrine. Deferring is defensible given zero reachability; if deferred, it belongs in the backlog rather than nowhere.

## Dependencies

No packages added, removed or upgraded in this diff. `npm audit --omit=dev` reports **0 vulnerabilities**.

## Out of scope / Noted

- **Fail-open on an absent README is deliberate and not a weakness.** `checkReadmeCounts` returns `{ok: true, mismatched: []}` when no README exists, matching `checkReadmeFields`' ratified contract. Deleting a tracked README to suppress the gate is a visible diff on a version-controlled file, not a silent bypass. Same for a README carrying no count rows: nothing claimed, nothing to contradict.
- **`COUNT_ROW` was checked for catastrophic backtracking and is linear.** Every adjacent quantified class is disjoint from the literal that follows it (`\s*` before `|`, `[^|]*` before `|`, `[a-z0-9_-]+` before `/`), so no input produces ambiguous partitioning. It is applied per line, not to the whole file.
- **Enumerated and found clean**: no secrets or credentials in the diff; no crypto; no authN/authZ surface; no HTTP, SSRF or deserialization sink; no shell interpolation; no logging of sensitive values. The two non-code corrections (`docs/system/README.md`, `docs/specs/system-spec-delta.md`) are prose and numerals with no executable effect.
- **Pre-existing, not introduced here**: the two untracked memory entries and `.claude/output-styles/` in the working tree are curation artifacts carried by this workflow, reviewed and free of secrets.

