# Security reports — brainstorm-and-codesign

## brainstorm-and-codesign-2026-05-29.md

# Security Review — brainstorm-and-codesign — 2026-05-29

## Summary

Overall risk: **LOW**. The feature is entirely internal to the Claude Code baseline — no network surfaces, no third-party dependencies, no authentication or authorization flows, no secrets handling. All threat surfaces are local filesystem operations on user-derived strings. One MEDIUM finding (slug path-traversal) and two LOW findings (JSON robustness, markdown injection) identified. None are CRITICAL or HIGH; workflow may proceed to `/integrate`.

## Findings

### [MEDIUM] Path traversal via unvalidated `slug` parameter

- **OWASP**: A04 Insecure Design  ·  **CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)
- **Files**:
  - `.claude/skills/brainstorm/brief-writer.mjs:21` — `await mkdir(dirname(outPath), { recursive: true })`
  - `.claude/skills/brainstorm/skip-check.mjs:11` — `join(rootDir, 'docs/brief', \`${slug}.md\`)`
  - `.claude/skills/spec/codesign-state.mjs:13` — `join(rootDir, '.claude/state/codesign', \`${slug}.json\`)`
  - `.claude/skills/harness/codesign-reentry.mjs:9` — `join(rootDir, '.claude/state/codesign', \`${slug}.json\`)`
- **Evidence**:
  ```js
  // validate-call.mjs:14 — slug type-check only; no path-traversal filter
  if (typeof slug !== 'string' || slug === '') {
    return { final_state: 'needs_human', ... };
  }
  // brief-writer.mjs — outPath is constructed from slug by the caller
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, lines.join('\n'));
  ```
- **Impact**: A slug containing `../` would let the brainstorm helper write outside the intended `docs/brief/` and `.claude/state/codesign/` directories. The path goes through `node:path → join` which normalizes (so `../../etc/foo.md` resolves), and `mkdir` with `recursive: true` would create intermediate dirs. In the current baseline the slug originates from `/triage`'s LLM-driven derivation — not a direct user input — so exploit requires either (a) prompt-injection into `/triage` causing it to produce a malicious slug, or (b) a manually-edited `workflow.json`. Damage is bounded by the project root's filesystem permissions.
- **Recommendation**: Add a slug validator (one regex, two lines) in `validate-call.mjs` and apply it to every helper that joins slug into a path. Suggested rule: `/^[a-z0-9][a-z0-9-]{0,39}$/` — kebab-case, no `.`, `/`, or `..`. Reject with `final_state: "needs_human"`, reason `"invalid_slug"`. Same rule should apply at `/triage` time when writing `workflow.json → slug`. **Not blocking** — exploit path is narrow and damage is bounded; address in a follow-up quickfix workflow.

### [LOW] Malformed state JSON triggers unhandled exception

- **OWASP**: A04 Insecure Design  ·  **CWE**: CWE-755 (Improper Handling of Exceptional Conditions)
- **Files**:
  - `.claude/skills/spec/codesign-state.mjs:16` — `JSON.parse(readFileSync(statePath(rootDir, slug), 'utf8'))`
  - `.claude/skills/harness/codesign-reentry.mjs:10` — `JSON.parse(readFileSync(path, 'utf8'))`
- **Evidence**:
  ```js
  function loadState(rootDir, slug) {
    return JSON.parse(readFileSync(statePath(rootDir, slug), 'utf8'));
  }
  ```
- **Impact**: If `.claude/state/codesign/<slug>.json` is corrupted (truncated, manually edited to invalid JSON, or partially written after a crash), `loadState` throws a `SyntaxError` that propagates up through `loadForResume` / `attemptRevisit` / `writeRevisitContext` with no caller-side handling. In the harness flow this would surface as an unhandled exception killing the loop; user must manually delete or repair the state file.
- **Recommendation**: Wrap `JSON.parse` in try/catch in each loader; return a structured error (`{ final_state: "needs_human", message: "codesign state file corrupted at <path>" }`) so the harness can surface a clean message. Not security-critical — malformed state is more reliability than security — but improves operational behavior. Address opportunistically.

### [LOW] Markdown injection in brief output (informational)

- **OWASP**: A03 Injection (informational, low confidence)  ·  **CWE**: CWE-79 (XSS) — N/A, no HTML rendering
- **File**: `.claude/skills/brainstorm/brief-writer.mjs:24-34`
- **Evidence**:
  ```js
  function renderValue(value) {
    if (Array.isArray(value)) { ... }
    if (...) return ['*(not captured)*'];
    return [String(value)];  // verbatim, no markdown escape
  }
  ```
- **Impact**: Engineer's answers in Stage 2 of brainstorm are written verbatim into `docs/brief/<slug>.md`. If an answer contains markdown syntax (`# Imposter heading`, `[link](http://attacker.example)`, ` ```fence ` etc.), the brief renders that syntax when read by downstream phases or by humans in a markdown viewer. There is no HTML rendering pipeline — the brief is read as a markdown source file by `/intake`, `/spec`, `/tdd` skills as text. The "injection" is therefore a *display* concern (a confusingly-formatted brief) rather than a security boundary crossing. Could be used socially to embed misleading content in archived briefs.
- **Recommendation**: Optional. If briefs are ever rendered as HTML (e.g., shipped to a docs site), escape markdown control characters. For the current local-markdown-only flow, accept as-is and note in `brainstorm/SKILL.md` that briefs reproduce user input verbatim.

## Dependencies

No new packages introduced. The implementation uses only Node.js built-ins:
- `node:fs` / `node:fs/promises` (filesystem I/O)
- `node:path` (path joins)

No CVE check required.

## Out of scope / Noted

- **`flag-parser.mjs` regex DoS**: The two regex patterns (`/--no-brainstorm\b/g`, `/--codesign\b/g`) are linear-time word-boundary matches with no nested quantifiers or alternation backtracking. ReDoS-safe. Verified by inspection.
- **`discipline.mjs` regex DoS**: Same pattern. Eight simple regex matches per turn, no nested quantifiers. ReDoS-safe.
- **Prototype pollution via `JSON.parse`**: Reviewed. The current code accesses properties directly on parsed objects (`state.decisions`, `state.revisit_context`) without using `Object.assign` or similar pollution-vulnerable merge utilities. A crafted JSON with `__proto__` payload would create an own-property called `__proto__`, not pollute `Object.prototype`. No exploit path found.
- **Pre-existing scope**: 14 pre-existing test failures in the repo reference renamed files (`audit.sh`→`audit.mjs`, `lint.sh`→`lint.mjs`, `render.sh`→`render.mjs`); not within this workflow's scope. Out of band.

