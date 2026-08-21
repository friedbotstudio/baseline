---
key: clip-neutralises-c0-c1-only-bidi-survives-4f21
category: backlog
scope: [simplify, integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: .claude/skills/lib/terminal-text.mjs
deferred: cost
---

> Deferred deliberately: the `/security` phase produces findings and never applies fixes.

- **The defect.** `terminal-text.mjs:15` builds `CONTROL_CHARS` from the C0/C1/DEL ranges only (U+0000-U+001F and U+007F-U+009F), so `clip` and `clipInline` pass bidirectional-control and invisible-format characters through untouched.
- **Measured** on 2026-08-21 through `clipInline`. Survive: U+202E (RLO), U+2066/U+2069 (isolates), U+200B (ZWSP), U+200D (ZWJ), U+00AD (soft hyphen). Correctly neutralised: C0, C1, DEL, U+2028, NBSP, and the backtick.
- **Reachable.** git permits these bytes in a filename, so any path that lands in the repository is attacker-controllable input to the sink.
- **Where it lands.** `process_lifecycle_guard`'s `emitInfo` advisory, whose closing line tells the reader to treat the block as binding under CLAUDE.md Article IX.7. An RLO reorders the text printed after the path; a zero-width character splits a token so a reader sees one thing and the parser another. Same forged-instruction outcome the backtick substitution was added to prevent, reached by a different character class.
- **Severity.** MEDIUM, not HIGH: it buys no code execution. CWE-451, related CWE-94 (Trojan Source, CVE-2021-42574). Full report in `docs/archive/2026-08-21/unsanitised-path-pair/security.md`.
- **Fix shape.** One line: widen the class in the shared Foundation module, which both review oracles and all four guard sites inherit. Add RLO and ZWSP cases to `tests/unsanitised-path-sinks.test.mjs` beside the existing ESC case.
- **Same module, lower severity** as [[clip-truncation-can-emit-a-lone-surrogate-9d38]]. Fix together.
