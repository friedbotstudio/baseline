# Security reports — tdd-subtick-stamping

## tdd-subtick-stamping-2026-06-21.md

# Security Review — tdd-subtick-stamping — 2026-06-21

## Summary

Overall risk: **LOW** — and strictly *lower* than the prior `phase-timer-bash-trigger` baseline, because this diff introduces **no payload-controlled data at all**. The new input (`workflow.json → tdd_ticks[]`) is trusted local workflow state written by the harness via the Edit tool, at the exact same trust level as the existing `completed[]` array it sits beside. The labels are persisted through `JSON.stringify` (injection-safe) and consumed by plain string operations. No Critical/High/Medium findings. Two LOW notes, both accepted.

## Findings

### [LOW] `tdd_ticks` labels flow into the rendered markdown cell (trusted source; same pattern as `completed[]`)
- **OWASP**: A03 – Injection | **CWE**: CWE-1236 (Formula/CSV-style injection) — *not realized*
- **File**: `.claude/hooks/lib/timing.mjs:121` (label build), `:216-219` (markdown row), `:135/:143` (JSONL persist)
- **Evidence**:
  ```js
  const freshSub = subtickEnabled && Array.isArray(wf.tdd_ticks)
    ? wf.tdd_ticks.map((t) => `tdd:${t}`).filter((label) => !stamped.has(label))
    : [];
  // ...
  appendFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  // render: `| └ ${r.phase} | ${r.model} | ... |`
  ```
- **Impact**: A tick label containing a `|` or newline could garble the local `timing.md` markdown table. But (a) `tdd_ticks` is written by the harness from a fixed vocabulary (`scenario`/`implement`/`verify`/`design-ui`/`drift-check`/`finalize`) — trusted local state, never a Bash/hook payload; (b) `completed[]` phase names already flow into the same markdown cell identically, so this is not a new trust boundary; (c) the persisted JSONL is injection-safe because every row goes through `JSON.stringify`, which escapes control characters — a crafted label cannot forge a second JSONL record. `timing.md` is a local dev artifact (not browser-rendered), so there is no XSS/script sink.
- **Recommendation**: Accept. If hardening is ever wanted, the same single `^[a-z0-9:-]+$` label guard would cover both `completed[]` and `tdd_ticks[]` — but the trusted source makes it unnecessary now.

### [LOW] Default-on flag semantics (`!== false`) enable sub-stamping when the key is absent
- **OWASP**: A05 – Security Misconfiguration | **CWE**: CWE-1188 (Insecure Default) — *intentional*
- **File**: `.claude/hooks/phase_timer.mjs:35`
- **Evidence**:
  ```js
  const subtickEnabled = projectGet('.artifacts.subtick_timing.enabled') !== false;
  ```
- **Impact**: Sub-stamping is on unless `artifacts.subtick_timing.enabled` is explicitly `false`. This is the deliberate default-on design (matches the `artifacts.compression` precedent). It cannot be subverted by a payload — `projectGet` reads `project.json` from disk under `CLAUDE_PROJECT_ROOT`; a project that sets `enabled: false` is honored (`subtickEnabled` becomes `false` → zero sub rows, regression-tested by `test_when_subtick_flag_off_then_no_sub_rows`). No security consequence — sub rows carry only token *counts*, never content.
- **Recommendation**: Accept. Default-on is the intended behavior and the off-switch is verified.

## Dependencies

No new packages. `timing.mjs` imports only `node:fs` / `node:path` / `node:url` (stdlib). `phase_timer.mjs` adds `projectGet` from the existing in-repo `./lib/common.mjs`. No CVE exposure.

## Out of scope / Noted

- **No ReDoS / prototype-pollution**: `subRowsForParent` filters with `s.phase.startsWith(\`${parentPhase}:\`)` — a plain string method, not a regex. `wf.tdd_ticks.map(...)` is gated by `Array.isArray`, and labels are stored as Set *values* (never used as object keys), so a `__proto__`-style payload cannot pollute.
- **No transcript-content leak**: sub rows carry `...currentTokens` (out/in/cache *counts*), identical to completed rows — confirmed no message text reaches the JSONL.
- **Bootstrap**: the introducing run does not populate `tdd_ticks[]`, so its own `timing.md` shows the collapsed `tdd` rollup (no sub rows). First real sub-resolution sample is the next tdd run. This is a correctness/observability note, not a security one.
- Carries forward the `phase-timer-bash-trigger` baseline (LOW): observation-only, never blocks, `process.exit(0)`, slug-derived write path. This diff does not regress any of those properties.

