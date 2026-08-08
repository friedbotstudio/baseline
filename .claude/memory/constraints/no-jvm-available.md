---
key: no-jvm-available
category: constraints
scope: []
state: true
state_verified_at: f7da5a7
governs: .claude/hooks/plantuml_syntax_guard.mjs, .claude/skills/spec/**, docs/specs/**
verified-at: f7da5a7
last-touched: 2026-08-04
---

- Constraint: this development environment has no JVM on `PATH`. `state: true` means the constraint HOLDS (no JVM available).
- Consequence: `plantuml_syntax_guard` is advisory by default rather than strict; strict `java -checkonly` runs only when `plantuml.strict_syntax_check` is explicitly true, which cannot succeed here.
- Decisions resting on this: the Structurizr adoption call (semantics adopted, dependency rejected) cites the JVM requirement as a primary rejection reason. Any future proposal to vendor a JVM-based model or diagram tool inherits this constraint.
- Re-verification: run `java -version`. If a JVM is installed later, flip `state` to `false`, re-stamp `state_verified_at`, and every decision naming this key in `rests_on` becomes suspect and must be re-examined — the advisory-by-default choice in particular may no longer be the right call.
