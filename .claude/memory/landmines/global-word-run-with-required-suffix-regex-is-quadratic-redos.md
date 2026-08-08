---
key: global-word-run-with-required-suffix-regex-is-quadratic-redos
category: landmines
scope: [implement, tdd]
verified-at: 32b83c2
last-touched: 2026-07-15
---

- Path: spec/diff oracle regexes over author-controlled content, e.g. `.claude/skills/spec-diagram-review/oracle.mjs` (`checkClassDDL`) and any `content.matchAll(/…(\w+)\s*:…/g)` scanning a whole document.
- Trap: a **global** (`/g`) regex whose body is `(\w+)` (or `\w+`, `[^x]*`) followed by a **required suffix** (`\s*:`, `<<…>>`, a delimiter) is **O(n²)** on a long run of the character class with the suffix absent. The engine matches the word-run at position 0 (O(n)), fails the suffix, then **restarts at position 1** and re-matches the run (O(n)), … n times → n². Measured live 2026-07-15 (`enforcement-oracle-framework`, C4 security review): a 50k-word-char class field made `checkClassDDL` take **~2.4 s** (CWE-1333). Input was author-authored spec content (dev-time, self-inflicted), so MEDIUM not HIGH — but a governance checker runs on every spec.
- Mitigation: **line-scope + `^`-anchor** the scan. Split on `\r?\n` and match `^\s*…(\w+)\s*:…` per line — the `^` pins a single start position per line, so there is no cross-position backtracking; total cost is O(n). This is the same family as [[spec-lint-and-guard-section-regexes-are-not-line-anchored]] (both diagram-oracle regexes; that one is prose-hijack, this one is ReDoS) — the shared fix is *line-scope the regex, don't scan the whole document globally*.
- Reflex: when adding a regex that scans author-controlled document content, stress it with a 50k-char adversarial input in the `/security` phase (ReDoS probe) before landing; `<4ms` is fine, seconds is a finding.

---
