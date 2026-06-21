# Security reports — phase-timer-bash-trigger

## phase-timer-bash-trigger-2026-06-21.md

# Security Review — phase-timer-bash-trigger — 2026-06-21

## Summary

Overall risk: **LOW**. The diff adds a PostToolUse `Bash` leg to the observation-only `phase_timer` hook plus the matching `settings.json` wiring (and its byte-equal template mirror). The new code introduces no new sink: it reuses the existing idempotent `stampFromWorkflow`, derives its write path from trusted local state (`workflow.json → slug`), and persists only integer token *counts* — never transcript content. No Critical/High/Medium findings. Two LOW items are noted, both pre-existing in `lib/timing.mjs` (out of this diff) and merely exercised more often by the new leg.

## Findings

### [LOW] Hook executes after every Bash tool call (added attack surface = self-DoS only)
- **OWASP**: A04 – Insecure Design | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/settings.json:55-60`, `.claude/hooks/phase_timer.mjs:24-34`
- **Evidence**:
  ```json
  { "matcher": "Bash",
    "hooks": [ { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/phase_timer.mjs" } ] }
  ```
- **Impact**: One `node` process spawns after every Bash invocation. `stampFromWorkflow` reads two small files (`workflow.json`, the slug timing JSONL), diffs `completed[]` against already-stamped phases, and returns **before** the (potentially large) transcript read when there are no fresh phases. The transcript is read only on the rare turn a phase actually completes. Cost is bounded and PostToolUse cannot deny — a thrown error is swallowed by the `try/catch` and the hook `process.exit(0)`s, so Bash is never blocked or failed by it. Worst case is a few tens of ms of added latency per Bash call on the local developer machine; there is no remote or multi-tenant exposure.
- **Recommendation**: Accept. The early-return-before-transcript-read design already bounds the cost; no change needed. If per-Bash latency is ever measured as material, gate the leg on `existsSync(workflow.json)` before spawning logic (micro-optimization, not a security fix).

### [LOW] `slug` used unsanitized in the timing file path (pre-existing; trusted source)
- **OWASP**: A03 – Injection | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/hooks/lib/timing.mjs:31` (`timingPath`) — **not in this diff**; reached via the new Bash leg
- **Evidence**:
  ```js
  const timingPath = (rootDir, slug) => join(rootDir, '.claude', 'state', 'timing', `${slug}.jsonl`);
  ```
- **Impact**: `slug` is interpolated into the write path without a `^[a-z0-9-]+$` guard. A traversal slug (e.g. `../../x`) would redirect the append. However, `slug` is read from `workflow.json` (written by `/triage` and the harness under `CLAUDE_PROJECT_ROOT`) — it is **trusted local workflow state, never the Bash payload**. The new Bash leg does not pass any payload-controlled value into the path; it only changes *how often* this trusted-source code runs.
- **Recommendation**: Optional hardening — validate `slug` against `^[a-z0-9-]+$` in `stampFromWorkflow` before the path join (mirrors the guard `resolvePointer` already applies to `spec_slug`). Track as a follow-up; not blocking, since the source is trusted.

### [LOW] Arbitrary file read from payload `transcript_path` (counts-only, no content disclosure)
- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-200 (Exposure of Sensitive Information) — *not realized*
- **File**: `.claude/hooks/lib/timing.mjs:74-105` (`sumTranscriptTokens`), reached with `transcriptPath = payloadGet(payload, '.transcript_path')` at `phase_timer.mjs:34`
- **Evidence**:
  ```js
  function sumTranscriptTokens(transcriptPath, beforeMs) {
    if (!transcriptPath || !existsSync(transcriptPath)) return null;
    raw = readFileSync(transcriptPath, 'utf8');
    // ... sums usage.{output,input,cache_read}_tokens for type==='assistant' lines
    return seen ? { out_tokens, in_tokens, cache_tokens } : null;
  }
  ```
- **Impact**: `transcript_path` is payload-supplied, so the hook reads whatever path the runtime provides. Even if that value were attacker-influenced, the function only **sums integer token counts** from lines matching `type==='assistant' && message.usage`; it never emits file *content* into the timing JSONL. Worst case is three integers derived from an arbitrary file — no content disclosure, no write. The payload itself originates from the Claude Code runtime, not from external/network input.
- **Recommendation**: Accept. The output channel (integer counts) structurally prevents content exfiltration. No change required.

## Dependencies

No new packages. The hook imports only `node:path` (stdlib) and two in-repo Foundation libs (`./lib/common.mjs`, `./lib/timing.mjs`). The `emitAllow` import was *removed* (now unused), reducing surface. No CVE exposure.

## Out of scope / Noted

- The two LOW path/read items live in `.claude/hooks/lib/timing.mjs`, which this diff does not modify. They are pre-existing and only surfaced because the Bash leg invokes the same code more frequently. If a hardening follow-up is desired, a single `^[a-z0-9-]+$` guard on `slug` in `stampFromWorkflow` closes the CWE-22 note cheaply.
- Secrets hygiene: confirmed the timing JSONL persists only `{phase, event, ts, out_tokens, in_tokens, cache_tokens}` — no transcript text, no tokens/keys. Clean.
- The `settings.json` ↔ `src/settings.template.json` byte-equal mirror was kept in sync in this same change (verified by `tests/template-drift.test.mjs`), so consumer installs receive the identical wiring.

