---
key: plantuml-composition-fails-three-ways-before-it-renders
category: landmines
scope: any
governs: .claude/skills/workspace/render.mjs,.claude/skills/workspace/shards.mjs
load_bearing: true
verified-at: 35212e8
last-touched: 2026-08-05
---

- Composing a PlantUML diagram from `!includesub` shards and rendering it locally failed three separate ways on 2026-08-05, each after the previous fix, and **none of them was caught by the default test suite** because the render test is opt-in behind `PLANTUML_TESTS`.
- **1. `Bad sub name` — PlantUML rejects a hyphen in a `!startsub` name.** Element ids here are kebab-case by `assertSafeFactKey` (`^[a-z0-9][a-z0-9-]*$`), so the raw id can never be the section name. The section is the id with hyphens swapped for underscores; the map is injective only because an id can never contain an underscore. Verified directly: `!startsub with-hyphen` errors, `!startsub with_underscore` renders.
- **2. `cannot include <path>` — `-pipe` gives PlantUML no base directory.** Relative `!includesub` paths in a piped document resolve against the *process working directory*, not against the document. Fix is `spawnSync(..., { cwd: memDir })`. The alternative, `-Dplantuml.include.path`, bakes an absolute path into include resolution while the wrapper text stays relative.
- **3. `Unable to access jarfile` — the cwd fix broke the jar path.** Running from `memDir` also re-resolves a *relative* `jarPath` against `memDir`, so a caller passing the repo-relative `.claude/bin/plantuml.jar` gets a jar error instead of a render. `resolve(jarPath)` BEFORE the spawn. The render test only passed because it happened to use an absolute path.
- The pattern across all three: each fix moved the failure one layer down, and the layer below was only reachable by actually running the JVM. **Run the opt-in test after touching this path** (`PLANTUML_TESTS=1 node --test tests/workspace-shards.test.mjs`) — a green default suite says nothing about rendering.
- `%loadfile` does not exist on `plantuml@1.2026.2` (rejected as an unknown built-in), which is what kept a `title`-injection finding at MEDIUM rather than confirmed file disclosure. That is a property of this jar version, not a guarantee — re-test if the jar is upgraded.
