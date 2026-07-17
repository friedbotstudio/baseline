---
key: diagram-profile-reduction-was-dead-on-arrival
category: landmines
scope: [scout, spec, tdd, security, integrate]
file: `.claude/hooks/lib/write-set-profile.mjs`, `.claude/skills/spec-lint/lint.mjs`, `.claude/project.json` (artifacts.diagram_profiles)
symptom: the write_set-gated diagram-profile reduction (artifact-compression "Lever 4") shipped its config but NEVER fired — every spec still required all 6 C4 diagrams.
root-cause: `resolveProfile`'s `extractWriteSet` regex required `write_set:` (colon), but real specs declare it in prose — `The write_set is \`...\``. Unit tests used the colon form, so they were green while every production spec fell through fail-open to the full set. Compounded by: the non-arch profile `when[]` omitted `tests/**`/`obj/**`/governance mirrors (real write_sets always touch those → coverage failed); and `spec-lint/lint.mjs` ran its OWN diagram-presence check bypassing `resolveProfile` (so it contradicted the hook).
lesson: a feature whose trigger NO artifact ever emits is dead config. Test the real-world input form, not just the canonical one; when two checkers gate the same property, route both through one resolver.
verified-at: 9ba38f1
last-touched: 2026-06-22
---

- fix (2026-06-22, `checker-graduation-fanout` ad-hoc): regex accepts colon / `is` / `**Write set**:` forms; profile `when[]` += `tests/**`,`obj/**`,`src/*.template.md`,`.claude/*.md`; spec template prompts the declaration; `spec-lint` delegates to `resolveProfile`. Also beware: a Write-set declaration line trailing explanatory prose with OTHER backticked paths (e.g. `\`src/**\``) poisons extraction — keep the declaration path-only.
