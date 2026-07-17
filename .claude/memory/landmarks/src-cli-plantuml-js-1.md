---
key: src/cli/plantuml.js:1
category: landmarks
scope: [scout]
---

- Role: always-fetch logic for the upstream PlantUML jar (sha256-pinned, redirect-handling, mock-friendly via `opts.fetch`) PLUS `runJavaPreflight()` — a Foundation primitive that spawnSync-probes `java -version` for the install-time preflight in bin/cli.js + src/cli/tui/install.js. Honors `CREATE_BASELINE_JAVA_PROBE_OVERRIDE` env override (values `present` / `missing`) for deterministic testing, same pattern as `CREATE_BASELINE_TEMPLATE_DIR`. Detection of system plantuml on PATH was removed 2026-05-27 (workflow plantuml-jar-always-download) — the pinned jar is now the sole runtime target, invoked via `java -jar` by .claude/hooks/plantuml_syntax_guard.sh and .claude/skills/spec-render/render.mjs.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: pinned constants (`PINNED_SHA256`, `UPSTREAM_URL`, `PINNED_SIZE`) must update in lockstep with `.claude/bin/NOTICE` when the upstream PlantUML version bumps
