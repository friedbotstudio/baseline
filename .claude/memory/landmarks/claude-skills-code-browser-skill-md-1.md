---
key: .claude/skills/code-browser/SKILL.md:1
category: landmarks
scope: [scout]
caveat: Per-language fast-path adapters (Python/Go/Rust) are DEFERRED — `walk.mjs` resolves only `.ts/.js/.tsx/.jsx`, not `.mjs`, so on non-JS/TS repos code-browser uses the manual universal walk. "Primary" is doctrine (binding prose), not a structural hook; no test gates the model's actual tool choice.
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: The navigation skill, rewritten (`code-browser-primary-navigation`, 2026-06-04) so the language-agnostic **universal walk** (entry → imports → IO boundary) is the PRIMARY, framework-independent path and the JS/TS `walk.mjs`/`discover.mjs` are an OPTIONAL accelerator (not a precondition). The frontmatter `description:` is the auto-invoke trigger — now language-agnostic (frontend or backend) and names the `Explore` agent alongside grep. Grep carve-outs preserved: pure full-text search + direct type/util definition lookups stay grep's domain (not navigation). Bound by CLAUDE.md Article X.5.
- Companion: CLAUDE.md Article X.5 (the binding rule), `docs/init/seed.md §4.3` + `.claude/CONSTITUTION.md` Appendix B (deframed narration + mirrors), `.claude/skills/code-browser/walk.mjs` + `discover.mjs` (the optional JS/TS accelerator — UNCHANGED, byte-identical), `.claude/skills/scout/SKILL.md:28` (sole workflow invocation site), `tests/code-browser-primary-navigation.test.mjs`. Decision: `decisions.md → navigation-routing-code-browser-primary-2026-06-04`.
