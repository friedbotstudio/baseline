---
key: roadmap-sync-skill-md-documents-an-audit-mode-the-cli-does-not-expose
category: backlog
load_bearing: false
scope: [triage, spec, implement]
governs: .claude/skills/roadmap-sync/**
status: open
raised-on: 2026-08-17
raised-in-context: unify-epic-heading-grammar
source: assistant-deferral
verified-at: 19631b7
last-touched: 2026-08-17
---

> The SKILL.md's Constraints section says: "Advisory `--audit` mode (`auditRoadmap`) reports heading/task-body inconsistencies + malformed lines; it never mutates. Use it to re-validate the roadmap". Running `node .claude/skills/roadmap-sync/cli.mjs --audit` prints `unknown subcommand --audit` and a usage block listing exactly one subcommand: `backfill`.

- **The gap.** `auditRoadmap` is implemented and works — it is exported from `sync.mjs` and returned `{anomalies: []}` against the live 12-epic plan on 2026-08-17. It is simply unreachable from the front door. The only way to run it is to import `sync.mjs` directly, which the SOP elsewhere tells you not to do.
- **Why it matters.** The audit is the advisory that tells a curator the roadmap's headings and task bodies disagree. A documented-but-unreachable diagnostic is worse than an undocumented one: the reader believes coverage exists.
- **Two candidate fixes, unresolved.** Add an `audit` subcommand to `cli.mjs` (matches the `backfill` precedent, one small edit), or delete the claim from SKILL.md. The first is the likely right call, since the capability exists and is tested — but that is a decision, not a foregone conclusion.
- Found at Phase 10.6 of `unify-epic-heading-grammar`, which exercised the module but did not touch `cli.mjs`. Out of that workflow's write surface; deliberately not fixed there.
