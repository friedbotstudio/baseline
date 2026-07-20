---
key: live-template-config-drift-silent
category: landmines
scope: [chore, tdd, spec]
verified-at: 86a2bb3
last-touched: 2026-07-18
---

- Path: `.claude/project.json` (live, dogfood) vs `src/project.template.json` (shipped to consumers, copied verbatim to `obj/template/.claude/project.json` by `scripts/build-template.sh`).
- Trap: the two files are **hand-maintained and must be kept in sync manually**. They drift silently — a `velocity.*` oracle enabled in the live config but absent/false in the template ships **dark** to consumers (every oracle reader is fail-open: absent key → disabled). Real instances found: `velocity.code_review` was `enabled:true` live / absent template (consumers skipped the whole integrate code-review fan-out); `swarm.refuse_dirty_tree` was `false` live / `true` template (the broken original default — see [[swarm-refuse-dirty-tree-blocks-mid-workflow]]).
- Mitigation (landed epic3-template-gap): `checkConfigParity(live, template)` in `.claude/skills/audit-baseline/config-parity.mjs` (wired into the audit as `project.json <-> template: config parity`) deep-compares the `velocity` AND `swarm` blocks order-independently, FAILing on any drift outside `CONFIG_PARITY_ALLOWLIST` = `velocity.sprint_mode.enabled`, `velocity.power_mode.enabled`, `velocity.notifier.presence` (the intentional dogfood/consumer deviations). Adding a `velocity.*` flag → mirror it into BOTH files or add it to the allowlist if it is a deliberate dogfood-only knob.
