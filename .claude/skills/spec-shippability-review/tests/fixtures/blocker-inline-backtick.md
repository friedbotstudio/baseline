---
name: planted-inline-backtick
owner: baseline
description: Fixture SKILL.md that places a dev-tree runtime reference inside an inline single-backtick block (not a triple-fence). Exercises analyzer.mjs's collectInlineBackticks pathway.
---

# Blocker: dev-tree reference inside an INLINE BACKTICK (not a shell fence)

This fixture exercises the new inline-backtick detection in scan-shipped-skills.mjs.
Today's scanner only inspects ```bash / ```sh / ```shell fences; this prose
slips through. The hardened analyzer must also inspect single-backtick blocks
inside *.md files.

## Procedure

3a. **Pre-§18 workflow.json migrator.** If `workflow.json` carries the pre-§18 shape, run a one-shot migrator before continuing: `node -e "import('./src/cli/workflow-migrator.js').then(m => m.migrateWorkflowJsonInPlace('.claude/state/workflow.json'))"`. The migrator derives `track_id` from `entry_phase`.

3b. **Secondary leak in a single-backtick example.** Run `node ./scripts/build-manifest.mjs obj/template` to refresh the manifest after edits.
