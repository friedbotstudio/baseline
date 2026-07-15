# Security reports — spec-quality-floor

## spec-quality-floor-2026-07-15.md

# Security Review — spec-quality-floor (roadmap B1) — 2026-07-15

## Summary

Overall risk: **LOW**. The change adds a pure, stdlib-only markdown parser (`design-calls.mjs`) and rewires a governance enforcement hook + a lint checker to it. There is no runtime-exposed endpoint, no secret, no crypto, no new dependency, and no injection sink. The two named risks — ReDoS and guard fail-open — were tested and do not hold. No CRITICAL/HIGH/MEDIUM findings.

## Findings

### [LOW] Regex parsing of author-controlled spec markdown — ReDoS surface
- **OWASP**: A04 Insecure Design | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **File**: `.claude/hooks/lib/design-calls.mjs:13-15` (`SECTION_RE`, `NONE_RE`, `PLACEHOLDER_RE`)
- **Evidence**:
  ```
  const SECTION_RE = /^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im;
  const PLACEHOLDER_RE = /^\*?\(?\s*(?:—|-|none|tbd|n\/a)\s*\)?\*?$/i;
  ```
- **Impact**: A catastrophically-backtracking regex over attacker-controlled input can hang the process. Measured against 50k-char pathological inputs (unterminated section, all-pipes, dense newlines, 5k-char placeholder cell): worst case **19ms**, all linear — no nested unbounded quantifiers, `[\s\S]*?` is lazy with a simple anchored lookahead. The input is a spec file authored in-session (bounded, not a network principal), and the hook is a dev-time PreToolUse guard, not a runtime endpoint.
- **Recommendation**: None required. The regexes are linear; documented here for completeness. If ever reused on unbounded external input, cap input length first.

### [LOW] Guard enforces completeness, not truthfulness of the Reference target
- **OWASP**: A04 Insecure Design | **CWE**: CWE-20 (Improper Input Validation — accepted by design)
- **File**: `.claude/hooks/spec_design_calls_guard.mjs:109-118`
- **Evidence**:
  ```
  const defects = findRowDefects(section);
  if (defects.length === 0) emitAllow();
  ```
- **Impact**: An author can satisfy the guard by writing any non-placeholder string in the Reference target / Quality criteria cells (e.g. a bogus URL). This is not a privilege boundary: the spec author IS the trust principal, and truthfulness of the rubric is judged by the human at gate A (`/approve-spec`), not by this mechanical presence check. The guard's job is to make the omission impossible, which it does. Malformed and short rows fail **closed** (deny), verified: a row with missing cells yields `missing: [Reference target, Quality criteria]`.
- **Recommendation**: None. Presence-enforcement is the intended contract (roadmap B1); rubric quality is a human gate-A judgment.

### [INFO] Author slug interpolated into the deny message
- **File**: `.claude/hooks/spec_design_calls_guard.mjs:115`
- The row `slug` (author-controlled) is interpolated into the deny reason string. The sink is a plaintext hook message rendered in the terminal — not HTML, SQL, or a shell. No injection target. Noted, no action.

## Dependencies

No new packages. `design-calls.mjs` imports only Node stdlib (implicitly, via string/regex ops — no `import` of any module). The guard imports the new local lib + existing `./lib/common.mjs`; lint imports the new local lib + existing `write-set-profile.mjs`. No CVE surface.

## Out of scope / Noted

- `write_set` extraction and glob→regex are duplicated across the guard, lint, and `write-set-profile.mjs` (pre-existing, flagged by `/simplify` for a follow-up). Not a security issue — three copies of the same linear parser.
- `src/settings.template.json` change is a mirror sync (removes two `Write(.env*)` permission-deny lines to match live `.claude/settings.json`); it tightens nothing and loosens nothing at runtime (the live settings already dropped them in commit `32b83c2`).

