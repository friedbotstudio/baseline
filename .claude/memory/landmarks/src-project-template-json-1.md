---
key: src/project.template.json:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: pristine ship-time template for `.claude/project.json` — the per-project config the CLI installs with `configured: false`, then `/init-project` populates after running the recommender. Declares `test`/`lint` runners, `tdd` source/test/ui globs, `destructive` Bash patterns, `swarm` config (`min_tasks_worth_swarming`, `isolation`, `exempt_path_prefixes`), `git` branch policy (`protected_branches`, `branch_pattern`), and the consent gate TTL.
- Companion: `src/settings.template.json:1` (hook wiring), `src/cli/install.js:79` (CLI overlay logic).
- Caveat: `configured: false` is the project-agnostic operating state (Art. III). `setup_guard` surfaces a one-shot reminder when it sees this; other guards bind regardless. `git.protected_branches: null` (the default) means every branch is consent-gated — set explicitly to `["main", "release/*"]` to loosen.
