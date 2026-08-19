---
key: roadmap list prints the plan path without the shared sanitizer
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-19
raised-in-context: roadmap-front-door
verified-at: 45b9b22
last-touched: 2026-08-19
governs: .claude/skills/roadmap/render.mjs
---

- **The gap.** `.claude/skills/roadmap/render.mjs` builds its header as `Roadmap — ${view.path}` while every title beside it passes through `clip`. `view.path` comes from `.claude/project.json → roadmap.path`, so a repository-controlled string reaches the terminal unneutralised.
- **The fix.** `Roadmap — ${clip(view.path)}`. One call.
- **deferred: risk.** Deliberate, and the reason is that the threat model is empty rather than that the work is large. Writing `project.json` also sets `test.cmd`, which the harness executes, so the only reachable input already implies command execution. It is consistency work against AC-006 of the roadmap-front-door spec, not remediation.
- Raised by the security review at `docs/archive/2026-08-19/roadmap-front-door/security.md`, its single finding, severity LOW.
- Related: [[claude-skills-lib-terminal-text-mjs]].
