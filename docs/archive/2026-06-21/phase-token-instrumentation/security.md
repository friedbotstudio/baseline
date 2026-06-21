# Security reports — phase-token-instrumentation

## phase-token-instrumentation-2026-06-21.md

# Security Review — phase-token-instrumentation — 2026-06-21

## Summary
Overall risk: **LOW**. The change adds best-effort token accounting to an existing observation-only PostToolUse hook. It reads the session transcript path supplied by the Claude Code runtime (a trusted local path, not external input), extracts only numeric `usage` counts, and writes integer token fields into the existing per-run timing JSONL. No new trust boundary, no network egress, no secret material persisted. No CRITICAL/HIGH/MEDIUM findings.

## Findings

### [LOW] Transcript read loads the whole file into memory
- **OWASP**: A04 - Insecure Design (resource use) | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: .claude/hooks/lib/timing.mjs:~70 (`sumTranscriptTokens` → `readFileSync(transcriptPath, 'utf8')`)
- **Evidence**:
  ```
  raw = readFileSync(transcriptPath, 'utf8');
  ...
  for (const line of raw.split('\n')) { ... JSON.parse(line) ... }
  ```
- **Impact**: A very large session transcript is read fully into memory and split, an O(filesize) allocation. The source is the session's own transcript (bounded by the session), the hook runs locally, and any failure is swallowed (returns null) — so the practical blast radius is a transient memory spike on the developer's own machine, never a service.
- **Recommendation**: Acceptable as-is for local tooling. If transcripts ever grow pathologically, switch to a streaming line reader (`readline` over a stream). Not required now (YAGNI).

### [LOW] `slug` is interpolated into the timing path without sanitization (pre-existing)
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: .claude/hooks/lib/timing.mjs (`timingPath` = `join(rootDir, '.claude/state/timing', `${slug}.jsonl`)`) — **pre-existing, not introduced by this diff**
- **Evidence**:
  ```
  const timingPath = (rootDir, slug) => join(rootDir, '.claude', 'state', 'timing', `${slug}.jsonl`);
  ```
- **Impact**: A `slug` containing `../` could direct the append outside the timing dir. `slug` originates from `workflow.json`, written by `/triage` (trusted) — not from external input. This code path predates the change; the diff only adds token fields to the records written there.
- **Recommendation**: Out of scope for this workflow. If hardened later, validate `slug` against `^[a-z0-9-]+$` at the `timingPath` boundary. Tracking-worthy, not blocking.

## Dependencies
No new packages. `sumTranscriptTokens` uses only Node stdlib already imported by the module (`node:fs` `existsSync`/`readFileSync`, `Date.parse`, `JSON.parse`). No CVE surface added.

## Out of scope / Noted
- **No secret leakage**: the parser reads only `message.usage.{output,input,cache_read}_tokens` (integers). Transcript message *content* (which may contain secrets) is never read, summed, or written. Confirmed by inspection of the only fields accessed.
- **Never-throw contract preserved**: `sumTranscriptTokens` guards `readFileSync` (try/catch → null) and each `JSON.parse` (try/catch → skip line); `Date.parse` returns NaN rather than throwing; `stampFromWorkflow` is additionally wrapped in `try/catch` inside `phase_timer.mjs`. A malformed/missing/oversized transcript degrades to absent token data, never disturbing the workflow.
- **Integrity**: token fields are advisory measurement data feeding `timing.md`; they gate nothing and are not read by any consent/verify guard.

