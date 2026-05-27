# Security reports — fix-shipped-src-cli-import-leaks

## fix-shipped-src-cli-import-leaks-2026-05-27.md

# Security Review — fix-shipped-src-cli-import-leaks — 2026-05-27

## Summary

Risk: **LOW.** The diff vendors five existing src/cli/ modules under .claude/skills/{triage,harness}/ via a new build-time sync step, fixes two shipping leaks where consumer installs received references to dev-tree paths, and hardens the spec-shippability-review scanner. No new trust boundaries, no new dependencies, no new authentication / authorization / crypto surface. The vendored mirrors are byte-identical to their canonical sources and enforced via a sha256 byte-equality test that runs on every CI invocation.

## Findings

*(No findings at CRITICAL / HIGH / MEDIUM / LOW.)*

## Checks performed

- **OWASP A01 (Broken Access Control).** No auth-affecting changes. No new endpoints, no role checks added or removed. N/A.
- **OWASP A02 (Cryptographic Failures).** `node:crypto.createHash('sha256')` used by `tests/vendored-mirror-bytes.test.mjs` for drift detection only — not as a security control. Standard sha256 usage. No homegrown crypto, no weak algorithms.
- **OWASP A03 (Injection).** `scripts/build-template.sh` Stage 0b runs `cp "$PKG_ROOT/src/cli/<literal>.js" "$PKG_ROOT/.claude/skills/<literal>/<literal>.js"`. All path components are literals; only `$PKG_ROOT` is variable, and it is computed from the script's own location via `cd "$SCRIPT_DIR/.." && pwd` at line 19 (already-existing pattern). No user input reaches the cp args. No shell injection surface introduced.
- **OWASP A04 (Insecure Design).** Stage 0b assumes `src/cli/` is the trusted canonical source. This is consistent with the existing project model (`src/cli/` is the maintainer's own dev tree, not third-party). The byte-equality test (S4) detects any drift, including a malicious or accidental edit of a vendored mirror that doesn't match canonical.
- **OWASP A05 (Security Misconfiguration).** The hardened scanner deliberately restricts walking to baseline-owned skill dirs (`owner: baseline` frontmatter) and top-level skill files only — non-baseline skill content (e.g., user-added skills, references/ subdirs) is excluded. This is an explicit allowlist, not an implicit one.
- **OWASP A06 (Vulnerable & Outdated Components).** No new package.json dependencies. The diff adds no third-party libraries; all new code uses node:* builtins (fs/promises, crypto, child_process, path, url) and project-internal modules.
- **OWASP A07 (Authentication Failures).** N/A — no auth code touched.
- **OWASP A08 (Software & Data Integrity Failures).** Strengthened, not weakened. The new `tests/vendored-mirror-bytes.test.mjs` enforces sha256 byte-equality between each canonical src/cli/ source and its shipped mirror on every CI run. Drift surfaces immediately as a test failure. Stage 0b re-syncs from canonical at every build, so the only way to introduce a divergent mirror is to edit it after build AND skip CI — a maintainer-side error class, not a remote attack vector.
- **OWASP A09 (Logging & Monitoring).** No logging changes.
- **OWASP A10 (SSRF).** N/A — no outbound HTTP touched.
- **Secrets hygiene.** Grepped diff for `(api[_-]?key|token|secret|password|private[_-]?key|begin\s+[a-z]+\s+private)`. No matches.
- **Input validation at trust boundaries.** The scanner reads files via `readFile`/`readdir` from the project root passed in by the test harness (mkdtemp) or the build script. No untrusted input reaches `readFile` paths; all paths are joined from script-internal constants.
- **`npm audit`** not re-run (no package.json change).

## Dependencies

No new packages introduced. `package.json` and `package-lock.json` are unchanged.

## Out of scope / Noted

- The plantuml-jar always-download + java-runtime rewire (parked for a separate spec-track workflow) will have its own security review when it lands. That work adds a Java requirement to the install flow and rewrites two hook/render scripts; pin enforcement on the jar via the existing PINNED_SHA256 will become load-bearing rather than decorative.
- The hardened scanner's helper-file walk is intentionally non-recursive (top-level skill files only). If a future baseline skill ever adopts a `lib/` subdirectory containing runtime helpers (analogous to `.claude/skills/<slug>/lib/foo.mjs`), the scanner will need an extension to recurse one level deeper into known runtime-relevant subdirs. Worth flagging as a backlog item; not a current risk.

