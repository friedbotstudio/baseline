---
key: a-skills-sop-prose-and-its-code-surface-can-disagree-with-nothing-catching-it-4c19
category: backlog
status: open
scope: [chore, tdd]
governs: .claude/skills/**/SKILL.md, .claude/skills/**/cli.mjs
source: user-instruction
raised-on: 2026-09-02
raised-in-context: gate-fidelity
verified-at: 02f3c68
last-touched: 2026-09-02
---

- The defect class: a skill's SOP prose describes a command, a flag, or a behavior that its shipped code does not expose, and nothing mechanical catches the disagreement. The reverse also happens: code ships a surface the prose never promised.
- Four existing entries are all instances of this one shape, which is why it is worth a mechanism rather than four more fixes: [[seven-skill-sops-under-describe-their-cli-2f7d]], [[roadmap-sync-skill-md-documents-an-audit-mode-the-cli-does-not-expose]], [[archive-leaks-the-swarm-jsonl-overlay-9e52]], [[nothing-catches-a-surface-that-shipped-without-being-promised]].
- Deliberately parked out of the `gate-fidelity` cycle (spec D1). That workflow closed the sibling class where a machine gate's *reader* and *writer* disagree; this one is prose against a code surface, which needs a different mechanism and a different fixture. Bundling them would have delayed the release.

> very well then let us keep it out for now

- The operator's decision above followed an explanation of the risk of including it. The four entries stay open; this entry is the umbrella that says they are one problem.
- Related, and the reason this is not hypothetical: `archive-leaks-the-swarm-jsonl-overlay-9e52` was re-read during this cycle's `/archive` and is still live — `swarm-plan/SKILL.md` says the `.jsonl` overlay is deleted by `/archive`, and `archive.sh`'s move table still has no `.jsonl` row.
