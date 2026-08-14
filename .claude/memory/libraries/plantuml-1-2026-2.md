---
key: plantuml@1.2026.2
category: libraries
scope: [spec, research]
verified-at: 8201af6
last-touched: 2026-08-14
caveat: NOT an npm dep — a vendored jar at `.claude/bin/plantuml.jar` (19 MB) plus a system JVM; no lockfile pin possible. Re-verify the jar version with `java -jar .claude/bin/plantuml.jar -version` before relying on preprocessor behaviour.
---

- Role: diagram-as-code renderer and syntax validator. Consumed by `plantuml_syntax_guard` (strict mode only), `/spec-lint`, and `spec-render`. Version verified 2026-08-05: **PlantUML 1.2026.2 / bb8550d (2026-02-27), APACHE source distribution**.
- Load-bearing API fact (context7-verified 2026-08-05): the preprocessor supports **sub-file and sub-section composition** — `!include <file>`, `!startsub NAME` / `!endsub` to delimit a section, and `!includesub <file>!NAME` to pull in one delimited section. This is what makes a diagram decomposable into per-element shards rather than one monolithic fence.
- Verified end-to-end locally 2026-08-05, not just read from docs: a view composed from a separate element shard passed `java -jar .claude/bin/plantuml.jar -checkonly` (includes resolved) and rendered via `-tsvg` (7,984-byte SVG).
- Landmine — the JVM IS present here, contrary to an archived claim. `java` resolves to OpenJDK **17.0.17 Zulu** (`/Library/Java/JavaVirtualMachines/zulu-17.jdk`). `docs/archive/2026-08-04/living-system-model/research.md:36` states `plantuml_syntax_guard` is advisory "because there is no JVM" — that is false on this machine. The guard is advisory because `project.json → plantuml.strict_syntax_check` defaults `false`. Local render, cross-file include resolution, and `-checkonly` validation are all available.
- Caveat — the `plantuml` MCP server in `.mcp.json` targets the remote `https://www.plantuml.com/plantuml` server, which **cannot resolve local `!include` paths**. Any workflow that composes shards from disk must invoke the local jar, not the MCP tool.
