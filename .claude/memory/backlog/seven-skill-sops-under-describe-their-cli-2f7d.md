---
key: seven-skill-sops-under-describe-their-cli-2f7d
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 7f7b582
last-touched: 2026-08-09
governs: .claude/skills/memory-sync/SKILL.md, .claude/skills/document/SKILL.md, .claude/skills/harness/SKILL.md, .claude/skills/spec/SKILL.md, .claude/skills/memory-index/SKILL.md, .claude/skills/audit-baseline/SKILL.md, .claude/skills/standup/SKILL.md
---

> The gate only sees pages. Seven skills now have SOP prose that under-describes their own CLI.

- **The drift.** `read-front-door-sweep` added CLI verbs without touching any SKILL.md, because no SKILL.md was in its approved write set. The SOPs now enumerate fewer verbs than the dispatchers expose:

  | Skill | SOP names | Missing |
  |---|---|---|
  | `memory-sync` | 6 verbs | `sweep` |
  | `document` | `receipt`, `surfaces` | `gate` |
  | `harness` | `migrate` | `rightsize`, `state` |
  | `spec` | `optimize` | `review` |
  | `memory-index` | *(never mentions cli.mjs)* | `query`, `scope-narrow` |
  | `audit-baseline` | *(never mentions cli.mjs)* | `report` |
  | `standup` | `recap` | should point at the new `roadmap/cli.mjs` |

- **Why `document` did not catch it.** `document-gate` computes required delegates from `project.json → document.surfaces`, which lists page surfaces only (`site-src/**/*.njk`, `docs/{runbooks,references}/**`, `docs/*.md`, `**/README.md`). SKILL.md prose is not a declared surface, so the gate correctly returned `required: [] ok: true`. The oracle is not wrong; its scope simply excludes SOP text.
- **The right track is `chore`** — documentation edits with no failing test to drive.
- **Watch the rebuild tax.** SKILL.md files are baseline-owned and manifest-hashed, so that chore must re-run `scripts/build-template.sh --manifest-only` as its LAST step before staging or the Article XII hash check fails. See [[manifest-restamp-is-the-last-step-before-staging-6a41]].
