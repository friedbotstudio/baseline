# Security reports — plantuml-jar-always-download

## plantuml-jar-always-download-2026-05-27.md

# Security Review — plantuml-jar-always-download — 2026-05-27

## Summary

Risk: **LOW.** The diff rewires PlantUML execution from "system plantuml CLI if available, otherwise a downloaded jar that nothing reads" to "always-download + `java -jar` at runtime." No new trust boundaries are introduced; the existing PINNED_SHA256 mechanism (unchanged) now actually enforces a version at runtime where previously it was decorative. No new npm dependencies. The only new system dependency is Java (an opt-out via `--no-plantuml`, with graceful guide-mode degradation when missing).

## Findings

*(No findings at CRITICAL / HIGH / MEDIUM / LOW.)*

## Checks performed

- **OWASP A01 (Broken Access Control).** No auth surfaces touched. N/A.
- **OWASP A02 (Cryptographic Failures).** The PINNED_SHA256 mechanism for jar integrity is unchanged; what changed is its *enforcement*. Previously, runtime invoked whatever `plantuml` happened to be on PATH (could be any version, signature unverified). After this diff, runtime invokes the pinned jar via `java -jar .claude/bin/plantuml.jar`, so the sha256 pin actually decides what PlantUML version runs. Net improvement in integrity story.
- **OWASP A03 (Injection).**
  - `src/cli/plantuml.js → runJavaPreflight()` calls `spawnSync('java', ['-version'], { stdio: 'ignore' })`. argv array — no shell interpolation. The probe ignores stdout/stderr.
  - `.claude/hooks/plantuml_syntax_guard.sh` invokes `java -jar` via Python's `subprocess.run(["java", "-jar", os.environ["HOOK_PLANTUML_JAR"], ...], ...)`. argv list, no shell.
  - `.claude/skills/spec-render/render.sh` invokes `java -jar "$PLANTUML_JAR" -tsvg -o "$OUT" "$puml"` with all paths quoted; PlantUML_JAR resolves to `"$ROOT/.claude/bin/plantuml.jar"` where ROOT comes from `${CLAUDE_PROJECT_DIR:-$(pwd)}`. Anyone able to set CLAUDE_PROJECT_DIR already has shell-level control over the install context; not a new attack surface.
- **OWASP A04 (Insecure Design).**
  - Java preflight policy is "exit 0 is enough" (D1). A Java 6 install would pass preflight even though PlantUML 1.2026.2 needs Java 8+. Acceptable: a stricter probe would require version-parsing the noisy `java -version` output (printed to stderr in different formats per vendor). The runtime failure is surfaceable via the guide-mode path.
  - Graceful degradation: jar-missing and java-missing both fall to guide mode in the hook (allow + info) and to exit-2 with a named remedy in the render skill. No silent failures.
- **OWASP A05 (Security Misconfiguration).** The CREATE_BASELINE_JAVA_PROBE_OVERRIDE env var is a test hook honored by `runJavaPreflight()`. Values "present" / "missing" bypass the real probe. A malicious actor setting this in production could force the preflight verdict, but anyone who can set env vars on the install command can also pass `--no-plantuml` directly. Not a new attack vector.
- **OWASP A06 (Vulnerable & Outdated Components).** No new npm dependencies (`package.json` and `package-lock.json` unchanged). Java becomes a system-level dependency — the consumer's JRE version isn't checked. PlantUML's diagram parser historically supports `!include` and similar directives; vulnerable Java + plantuml-asl could theoretically pose XXE risk if a consumer renders untrusted spec content. Existing posture is unchanged: plantuml-asl already disables external entity loading by default, and this baseline only renders specs the maintainer authored.
- **OWASP A07 (Authentication Failures).** N/A — no auth code touched.
- **OWASP A08 (Software & Data Integrity Failures).** Strengthened. Before this change, the pinned sha256 in `src/cli/plantuml.js` was decorative because runtime never invoked the jar. After this change, runtime invokes the pinned jar exclusively (or falls to guide mode if absent), so the pin's failure mode is now load-bearing.
- **OWASP A09 (Logging & Monitoring Failures).** The hook logs `GUIDE (no plantuml.jar)` and `GUIDE (no java)` entries to `.claude/state/logs/plantuml_syntax_guard.log` — same shape as existing log lines. No PII.
- **OWASP A10 (SSRF).** The fetcher (`src/cli/plantuml.js → defaultHttpsFetch`) fetches from a hardcoded pinned URL (`https://github.com/plantuml/plantuml/releases/download/v1.2026.2/plantuml-asl-1.2026.2.jar`). No user-controlled URL. The redirect cap is 5 hops — unchanged from before.
- **Secrets hygiene.** Grepped the diff for `(api[_-]?key|token|secret|password|private[_-]?key|begin\s+[a-z]+\s+private)`. No matches.
- **Input validation at trust boundaries.** The new Java preflight reads CREATE_BASELINE_JAVA_PROBE_OVERRIDE for test-mode bypass; only literal values "present" and "missing" branch the logic, all other values fall through to the real spawnSync probe. No env-var content reaches a shell or argv.
- **PATH-hijacking risk.** `runJavaPreflight()` resolves `java` via spawnSync's default PATH lookup. A malicious `java` binary earlier on PATH would be executed. This is the same posture as every other PATH-dependent invocation in the baseline; it requires prior compromise of PATH, which already grants arbitrary code execution. Not a new attack surface.

## Dependencies

No new packages introduced. `package.json` and `package-lock.json` are unchanged. `node:child_process.spawnSync` and `node:fs/promises` are built-in.

## Out of scope / Noted

- A future hardening pass could add a Java version probe (parse `java -version` output and assert major version ≥ 8). The cost is brittle parsing — Adoptium / Zulu / OpenJDK / Oracle each format the line differently — and the benefit is only meaningful for consumers running pre-8 JREs, which is rare in 2026. Not worth doing reactively; revisit if a specific consumer hits the failure mode.
- The Java system dependency is now opt-out via `--no-plantuml` (existing flag, repurposed). Worth surfacing in the README install section: "PlantUML diagram support requires Java 8+. Pass `--no-plantuml` to skip if you don't need diagram validation/rendering." That's a `/document` phase concern.
- The CREATE_BASELINE_JAVA_PROBE_OVERRIDE env var is a deliberate test hook (mirror of CREATE_BASELINE_TEMPLATE_DIR). Documenting it in the test-mode notes (CREATE_BASELINE_TEST_MODE etc.) would be useful for maintainers — also a `/document` phase concern.

