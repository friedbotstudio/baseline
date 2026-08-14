---
key: de-indexing-a-skill-breaks-its-skill-tool-callers-4d1f
category: landmines
scope: [chore, tdd, document, simplify]
source: assistant-deferral
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 8201af6
last-touched: 2026-08-14
governs: .claude/skills/*/SKILL.md, .claude/workflows.jsonl, .claude/commands/init-project.md
---

> My original check — grepping hooks and commands for `Skill(x)` — was too narrow twice over: it missed prose phrasing like "invoke the `gitignore` skill", and it never looked at `workflows.jsonl` at all.

- **The trap.** Adding `disable-model-invocation: true` to a SKILL.md removes it from the warm skill index — and also makes it unreachable through the Skill tool. Any caller that invokes it programmatically breaks silently: nothing fails at edit time, no test complains, and the break only shows when that SOP next runs.
- **Three caller shapes, and a grep for the first alone is insufficient.** `Skill(<slug>)` is the obvious one. The two that hide are (a) prose — `/init-project` step 5a says *"invoke the `gitignore` skill"* and never writes `Skill(`; and (b) a **track node** — `.claude/workflows.jsonl` names `org-dispatch` as the `org` track's Phase 6, which the harness invokes by node id.
- **Measured cost.** Four of sixteen skills de-indexed in `warm-context-diet` had a live caller: `claude-automation-recommender` and `gitignore` (`/init-project` steps 4 and 5a), `rca` (`verify/SKILL.md`'s repeat-FAIL recommendation), and `org-dispatch` (the `org` track). All four had to be restored; the final count was twelve, not sixteen.
- **The check that catches all of them** is `test_when_skill_is_de_indexed_then_nothing_invokes_it_through_the_skill_tool` in `tests/warm-context-diet.test.mjs`: it unions every `workflows.jsonl` node id / `metadata.phase` / `skill` / `sub_track`, then scans every `.md` under `.claude/commands/` and `.claude/skills/` for three invocation shapes.
- **Verify a new guard bites before trusting it.** The first version of that test caught only two of the four — the track-node case and the explicit "via the Skill tool" case — because the prose pattern was too narrow. Replaying it against all four known-bad slugs is what exposed the gap.
- **What is safe to de-index.** A skill the human types (`/standup`, `/companion on`), or one reached only through a Bash `cli.mjs` call (`/archive` runs `system-reconcile/cli.mjs report`, which is unaffected).
