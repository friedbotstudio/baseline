---
key: .claude/skills/conformance/cli.mjs
category: landmarks
scope: [tdd, integrate, chore]
governs: .claude/skills/conformance/cli.mjs
verified-at: 02f3c68
last-touched: 2026-09-02
---

- Role: Orchestration, 35 lines. The published front door for the reader-conformance run: `node .claude/skills/conformance/cli.mjs [--json]`.
- Exits non-zero on a disagreeing reader **or** on a run that measured nothing (`ConformanceUnmeasured`). The second exit is the point: a green run over an empty fixture is the failure this whole mechanism exists to prevent.
- Named in `docs/init/seed.md` §18.9 so the command is discoverable from the governing document rather than only from the code.
- Deliberately has **no SKILL.md**. `.claude/skills/lib/` is the precedent, and adding one would change the skill roster the manifest pins (Art. XII).
