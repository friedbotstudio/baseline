---
key: no-jvm-available
category: constraints
state_verified_at: 79e41cb
scope: []
state: false
governs: .claude/hooks/plantuml_syntax_guard.mjs, .claude/skills/spec/**, docs/specs/**
verified-at: 69c3259
last-touched: 2026-08-19
---

- Constraint: `state: false` means the constraint DOES NOT hold. This environment has a JVM. Flipped 2026-08-13 by the entry's own re-verification command: `java -version` reports OpenJDK 17.0.17 (Zulu17.62+17-CA) at `/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home/bin/java`, and `plantuml` is on `PATH` at `/usr/local/bin/plantuml` (a shell wrapper) reporting PlantUML 1.2026.2.
- Consequence: `plantuml_syntax_guard`'s strict `java -checkonly` path CAN succeed here. It stays advisory by default, but that is now a choice rather than a forced fallback, and `plantuml.strict_syntax_check: true` is a usable setting rather than one that cannot work.
- What this invalidates: the entry previously asserted no JVM on `PATH`, and it was cited that way for months. The Structurizr adoption call (semantics adopted, dependency rejected) named the JVM requirement as a primary rejection reason. That decision is now resting on a false premise and SHALL be re-examined before it is cited again. No entry currently names this key in a `rests_on:` field, so nothing else re-opens mechanically.
- What the false entry cost: JVM-gated tests are skipped by an opt-in env var (`PLANTUML_TESTS=1`) rather than by probing, so nothing failed loudly. During the 2026-08-12 security review this entry said the renderer could not run, while `plantuml -checkonly` ran and produced the evidence that `!include` inside a quoted C4 argument is inert and that `Component(` inside a quoted description crashes the preprocessor. An entry that says a tool is unavailable stops a reader reaching for it.
- Re-verification: run `java -version`. If a JVM is ever absent again, flip `state` back to `true` and re-stamp `state_verified_at`.
