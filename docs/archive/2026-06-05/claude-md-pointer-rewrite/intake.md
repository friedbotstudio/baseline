# Restore headroom under the CLAUDE.md cap by relocating non-binding material to the annex

<!--
Intake document. Produced by the `intake` skill.
Brainstorm brief: docs/brief/claude-md-pointer-rewrite.md
Backlog: rebalance-claude-md-vs-constitution-annex-budget-b4d1
-->

## Problem

`CLAUDE.md` (the in-session constitution, Articles I–XI) is **38,479 chars against a 40,000-char hard cap** (Art I.6) — only **1,521 chars of headroom**. A prior workflow already set a soft target of `CLAUDE_TARGET_MAX = 38500` (`tests/code-browser-primary-navigation.test.mjs:39`, AC-007) and shipped "a minimal offsetting trim" to stay under it. The file is loaded into context every session and is the auto-loaded source of truth for Claude's in-session behavior.

The concrete scenario: the maintainer adds a new binding rule (a new Article X.N project amendment, or a clause to an existing Article) and the change pushes CLAUDE.md over 40,000 chars. Today that forces an ad-hoc trim of existing prose under time pressure, risking accidental loss of binding content — the `audit-baseline` cap check (`audit.mjs:334`) and three governance tests (`thread-shelving-governance.test.mjs:49`, etc.) hard-FAIL above 40,000. There is no comfortable margin to absorb growth.

The annex `.claude/CONSTITUTION.md` (24,607 chars, **no byte cap**) already holds reference appendices, enforcement narration, and amendment history — it is the designed home for read-on-demand material. CLAUDE.md still carries narrative/reference prose that does not need to be always-loaded.

## Goal

Restore comfortable headroom under the 40,000-char CLAUDE.md cap by relocating non-binding, narrative, and reference material into the uncapped annex — without any rule losing binding force.

## Non-goals

- Changing the precedence chain `seed.md > CLAUDE.md > implementation` (Art I.4).
- Changing the 22-hook → Article enforcement mapping (Art VIII); no enforcement weakens.
- Downgrading any rule to advisory by moving it to the annex; binding rules stay binding wherever they live.
- Dropping `audit-baseline` required citations (Article XI in CLAUDE.md, §17 in seed.md) or breaking the byte-equal `src/CLAUDE.template.md` mirror.
- Minimizing always-loaded token count as an end in itself — the maintainer did **not** select "fewer always-loaded chars" as a success measure; headroom under the cap is the goal, not minimal size.

## Success metrics

- CLAUDE.md char count — baseline: 38,479, target: comfortably below the cap with a larger margin than the current 1,521 (exact target an open question), measured via: `wc -c < CLAUDE.md` and the budget test.
- Binding-rule survival — baseline: all of Articles I–XI present and binding, target: identical binding force after the change (no rule lost or downgraded), measured via: `audit-baseline` PASS + `REQUIRED_ARTICLE_HEADINGS` test markers.
- Byte-equal mirror — baseline: CLAUDE.md == src/CLAUDE.template.md, target: still byte-equal, measured via: `tests/appendix-a-mirror.test.mjs` / audit.
- `audit-baseline` verdict — baseline: PASS, target: PASS, measured via: `node .claude/skills/audit-baseline/audit.mjs` exit 0.

## Stakeholders

- **Requester**: Tushar Srivastava (maintainer, razieldecarte@gmail.com).
- **Reviewer**: Tushar Srivastava (solo governance owner; approves the spec at gate A).
- **Operator** (who runs it in prod): Claude-in-session (reads CLAUDE.md every session) + CI (`audit-baseline`, governance tests).

## Constraints

- **Art I.4 precedence — seed.md changes first.** This is a constitution-architecture change, so `docs/init/seed.md` (and its mirror `src/seed.template.md`) must be amended before/with CLAUDE.md; CLAUDE.md then conforms.
- **Byte-equal template mirror.** Any CLAUDE.md edit must be applied identically to `src/CLAUDE.template.md` (audit enforces byte-equality).
- **Existing cap enforcement is multi-sited.** The 40,000 cap is asserted in `audit.mjs:334`, `tests/code-browser-primary-navigation.test.mjs:38`, `tests/thread-shelving-governance.test.mjs:49`, and referenced in `tests/appendix-a-mirror.test.mjs:5`. Any target-margin change must reconcile all sites.
- **Article XI / §17 citations are audited.** The audit verifies CLAUDE.md contains the Article XI citation and seed.md contains the §17 citation; both must survive.
- **Annex has no cap but is read-on-demand.** Material moved there stops being in-context by default — only move what does not need to be always-loaded.

## Acceptance criteria

1. Given the restructured constitution, when `wc -c < CLAUDE.md` is measured, then it is ≤ a new soft target that leaves materially more headroom than the current 1,521 chars under the 40,000 hard cap.
2. Given every binding rule present in the pre-change CLAUDE.md, when the change lands, then each rule is still binding — either retained in CLAUDE.md or relocated to the annex with binding force intact, and none downgraded to advisory.
3. Given the byte-equal mirror invariant, when CLAUDE.md is edited, then `src/CLAUDE.template.md` is byte-identical to CLAUDE.md.
4. Given `audit-baseline`, when run after the change, then it exits 0 (PASS) — Article XI citation in CLAUDE.md, §17 citation in seed.md, and all hook/skill/command names + counts intact.
5. Given the precedence chain (Art I.4) and the hook→Article enforcement mapping (Art VIII), when the change lands, then both are unchanged in substance.
6. Given Art I.4 (seed-first), when this lands, then `docs/init/seed.md` and `src/seed.template.md` are amended to authorize/describe the restructure before CLAUDE.md conforms to it.
7. Given the governance test suite (`thread-shelving-governance`, `code-browser-primary-navigation`, `appendix-a-mirror`), when run after the change, then all pass, with the cap/target constants reconciled across every site that asserts them.

## Open questions

- What is the target headroom margin? The existing soft target is 38,500 (1,500 headroom); "comfortable" implies a lower ceiling — candidate targets to settle in `/research` or at codesign (e.g. ≤ 34,000 giving ~6k, or ≤ 32,000 giving ~8k).
- Are quick-reference cards (e.g. a memory-system cheat sheet) an in-scope deliverable of this workflow, or deferred? The brainstorm success measures did not include "faster lookup", so cards are currently candidate-only. If in scope, where do they live (annex section vs new file) and are they always-loaded or on-demand?
- Should CLAUDE.md literally become a thin "pointer/index" (the original framing), or stay a full binding document that is merely trimmed of narration? These are materially different end-states — decide in `/spec`.
