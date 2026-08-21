# Security reports — unsanitised-path-pair

## unsanitised-path-pair-2026-08-21.md

# Security Review — main (unsanitised-path-pair) — 2026-08-21

## Summary

Overall risk: **MEDIUM**. The change under review is itself a security fix, and it
closes the hole it names: a repository-controlled path reaching a printed advisory
can no longer carry a terminal escape or close a markdown backtick span. Two
residuals remain in the same sanitiser. The larger one is that `clip` neutralises
C0/C1 controls only, so bidirectional-override and zero-width characters survive
into the same advisory text the fix exists to protect. Nothing in the other three
concerns in this tree reaches a trust boundary: no new dependency, no new
execution sink, no secret, and `npm audit` reports 0 vulnerabilities.

Reviewed: 25 changed files plus 3 new ones, 584 changed lines, across four
unrelated concerns (path sanitisation, an output-style prose file, work-planner
defaults with a new read-only `ratio.mjs`, and a static-site batch).

## Findings

### [MEDIUM] Bidi and zero-width characters survive the path sanitiser

- **OWASP**: A03 - Injection | **CWE**: CWE-451 (User Interface Misrepresentation of Critical Information); related CWE-94 (Trojan Source, CVE-2021-42574)
- **File**: `.claude/skills/lib/terminal-text.mjs:15`
- **Evidence**:
  ```js
  const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f]', 'gu');

  export function clip(text, width = DEFAULT_WIDTH) {
    const flat = String(text ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
    return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
  }
  ```
  Measured through `clipInline`, code points of the output:

  | input | survives as |
  |---|---|
  | `U+202E` RIGHT-TO-LEFT OVERRIDE | `202e` |
  | `U+2066` / `U+2069` isolates | `2066` … `2069` |
  | `U+200B` ZERO WIDTH SPACE | `200b` |
  | `U+200D` ZERO WIDTH JOINER | `200d` |
  | `U+00AD` SOFT HYPHEN | `00ad` |

  C0, C1, DEL, `U+2028`, NBSP and the backtick are all correctly neutralised.

- **Impact**: git permits these bytes in a filename, so the input is
  attacker-controllable by anyone who can land a path in the repository (a PR, a
  vendored dependency tree, a generated artifact). The sink is
  `process_lifecycle_guard`'s `emitInfo` block, whose closing line reads "CLAUDE.md
  Article IX clause 7: treat the surfaced entry/entries as binding for this write".
  An RLO inside the path reorders the rendered text after it, and a zero-width
  character splits a token so a human reads one thing while the parser sees
  another. That is the same outcome the backtick substitution was added to
  prevent — forged instruction text in a block the reader is told is binding —
  reached by a different character class. It does not gain code execution, which is
  why this is MEDIUM and not HIGH.

- **Recommendation**: widen `CONTROL_CHARS` to cover the bidi-control and
  invisible-format ranges alongside C0/C1, replacing each with a space so the
  existing collapse absorbs it. Added to the existing class, as escapes:
  `­`, `​-‏`, `‪-‮`, `⁠-⁤`, `⁦-⁯`, `﻿`.
  Add the RLO and ZWSP cases to `tests/unsanitised-path-sinks.test.mjs` next to the
  ESC case already there. This is a one-line change to the shared Foundation module,
  so both oracles and all four guard sites inherit it.

### [LOW] Truncation can split an astral character into a lone surrogate

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-176 (Improper Handling of Unicode Encoding)
- **File**: `.claude/skills/lib/terminal-text.mjs:20`
- **Evidence**:
  ```js
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
  ```
  `String.prototype.slice` indexes UTF-16 code units, so a character above the BMP
  straddling offset 95 is cut in half. Measured: `clip('y'.repeat(94) + '\u{1F600}z')`
  returns a 96-unit string that tests true against `/[\uD800-\uDFFF]/`.

- **Impact**: cosmetic in the terminal (a replacement glyph). It does not corrupt
  the JSON the oracles emit, because Node implements well-formed `JSON.stringify`
  and escapes a lone surrogate as `\udXXX`, which round-trips. No parser downstream
  of the fan-out is broken by it. Recorded because the sanitiser's whole purpose is
  that its output is safe to print, and this is the one input class where it is not.

- **Recommendation**: slice by code point — `[...flat].slice(0, width - 1).join('')` —
  or cheaply, drop a trailing lone high surrogate before appending the ellipsis.

## Dependencies

No dependency change. `package.json` and `package-lock.json` are untouched by this
diff. `npm audit --omit=dev` reports 0 vulnerabilities.

## Out of scope / Noted

- **The fix's own coverage is sound where it applies.** `clipInline` correctly
  substitutes rather than deletes the backtick, so the width bound still measures
  what prints; the ordering comment in the module header is accurate (controls are
  replaced before the whitespace collapse, which is what lets the collapse absorb
  them).
- **`clip` versus `clipInline` at the two oracle sites is the right split.** The
  oracle findings leave as JSON on stdout and are not wrapped in a backtick span by
  the emitter, so the backtick substitution would buy nothing there. Agreed with the
  recorded decision not to clip the reason cell: it is reviewer prose, not a
  repository-controlled path.
- **`ratio.mjs` path handling is guarded.** Both entry points into a slug-derived
  path — `measurePayload` and `measureLivePayload` — call `assertSafeSlug` before
  any `join`, so `--slug ../../etc` throws rather than traversing. The module opens
  no network socket and spawns no process.
- **Argument parsing in `ratio.mjs:88` is positional.** `at('--slug')` returns the
  next argv element without checking that it is not itself a flag, so
  `--slug --track x` reads a slug of `--track`. That fails closed at
  `assertSafeSlug`, so it is a usability wart, not a vulnerability.
- **`site-src/assets/site.js`**: `command_kind` is read from a `data-` attribute in
  the site's own templates and handed to `gtag`, which does not evaluate parameter
  values. No sink. The default of `"command"` means a forgotten attribute
  under-counts rather than over-counts the install conversion, which is the
  conservative direction.
- **`site-src/_layouts/base.njk`**: the JSON-LD property change (`codeRepository` to
  `sameAs`) is a schema.org correctness fix, not a security-relevant one. The value
  is a build-time constant from `_data/site.cjs`.
- **`site-src/install.njk:71`**: agreed, the `<!--email_off-->` wrapper is a
  Cloudflare Scrape Shield opt-out and changes no code path.
- **Not re-raised, per the review brief**: the unreachability of the newline half of
  backlog entry `-8c7e` through the `governs:` glob leg. Independently consistent
  with what the guard does — that leg exits at `emitAllow` with no blocks.

