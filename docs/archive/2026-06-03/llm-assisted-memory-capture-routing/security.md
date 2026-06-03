# Security reports — llm-assisted-memory-capture-routing

## llm-assisted-memory-capture-routing-2026-06-03.md

# Security Review — main (llm-assisted-memory-capture-routing, Tier 1) — 2026-06-03

## Summary
Overall risk: **LOW**. Tier 1 adds a pure string-head predicate (`isBoilerplate`) + a shared `NOISE_PREFIXES` constant in `common.mjs`, and a capture-time filter in `shelve_capture.extract`, with `memory_stop`/`resume_writer` converged onto the shared source. No new I/O, no path handling, no network, no model call, no parsing of untrusted structured input beyond head-of-string prefix checks. The change runs in headless hooks over the local transcript on the developer's own machine.

## Findings

### [LOW] Regex on attacker-influenced text in `isBoilerplate`
- **OWASP**: A03 — Injection (ReDoS class) | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **File**: `.claude/hooks/lib/common.mjs` (`isBoilerplate`)
- **Evidence**:
  ```
  const head = text.replace(/^\s+/, '').slice(0, 64);
  if (head.startsWith(SKILL_SOP_MARKER)) return true;
  return NOISE_PREFIXES.some((p) => head.startsWith(p));
  ```
- **Impact**: The only regex is `/^\s+/` (anchored leading-whitespace, single `+`, no alternation or nesting) applied to the full `text`. Linear-time; no catastrophic backtracking is possible from this shape even on a multi-MB all-whitespace string. The subsequent work is bounded to a 64-char head. No ReDoS.
- **Recommendation**: None required. (If desired, `.slice(0, 64)` before the trim would bound the regex input too, but the current shape is already linear.)

### [LOW] Filter could drop legitimate authorship that mimics boilerplate
- **OWASP**: A04 — Insecure Design (availability of captured signal) | **CWE**: CWE-693 (Protection Mechanism Failure, over-block direction)
- **File**: `.claude/hooks/lib/shelve_capture.mjs` (`extract` user branch)
- **Evidence**:
  ```
  if (text && !isBoilerplate(text)) { cues.push(...) }
  ```
- **Impact**: A genuine user message whose head literally starts with `<system-reminder>`, `<command-name>`, `<local-command-`, or `Base directory for this skill:` would be dropped from cues. These are runtime-injected markers; a human authoring such a prefix verbatim is implausible, and `memory_stop`/`resume_writer` already filtered the tag prefixes pre-change. Worst case is a missed cue (no data integrity or disclosure impact), and the human still curates at `/memory-flush`.
- **Recommendation**: Accept. The over-block direction is safe for a capture filter; the boilerplate set is the runtime's own injected markers.

## Dependencies
No new packages. Node stdlib only (`node:fs`, `node:path`, `node:crypto` already in use). No `@anthropic-ai/sdk` / network — Option 1C was rejected at research.

## Out of scope / Noted
- Article IX.3 (human-curation gate) and IX.6 (verbatim) are unaffected by Tier 1: the capture filter only drops injected boilerplate before staging; it never writes canonical memory and never alters a preserved verbatim.
- Tiers 2 & 3 (flush-time routing, durable thread, `_resume` rework) are deferred to follow-up workflows and out of scope for this review.

