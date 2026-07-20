---
key: sprint-mode-mcp-channel-architecture-pivot-2026-06-23
category: decisions
scope: [spec]
verified-at: be0b767
last-touched: 2026-06-23
source: user-instruction. Approved spec + epic state `.claude/state/epic/mvp-sprint-parallel-cycles.json`; gate-A approval 2026-06-23. Children claim `-4c43` (RALPH, Slice C) and `-9360` (charter, Slice E).
---

> verbatim (user, AskUserQuestion + gate-A free answers, 2026-06-23):
> substrate → "Custom MCP channel"; stance → "Keep axiom, sandbox the feature"
> Q1 → "we will use swarm worker if we don't have human-launched sessions, else human-launched sessions"
> Q2 → "if human-launched session is in same workspace (same directory); then we use 1 commit; else each workspace make its own commit on a separate branch which is then merged via PR"
> Q5 → "Make your channels feature is available in 1.29 ... pin it hard"

- Decision: the `mvp-sprint-parallel-cycles` epic (v1 umbrella `-9d4c`) builds a BASELINE-OWNED MCP coordination channel for parallel bounded workers — NOT native Agent Teams (rejected: experimental, env-flag-gated, hard to sandbox), NOT a seed §4.2 rewrite. Sprint mode is an opt-in SANDBOX governed by a new **§II.B bounded charter** (the §II.A pattern); the founding "one subagent / decisions in main context" axiom is PRESERVED. Approved sliced spec: `docs/specs/mvp-sprint-parallel-cycles.md` (5 slices: A completeness-oracle, B channel-server, C dispatch+RALPH-yield, D merge+topology-commit, E charter).
- Key parameters: (Q1) **dual-class peers** — human-launched Claude Code sessions used when connected, else lead-spawned bounded `swarm-worker` subagents; both register on the channel with a `pclass`. (Q2) **commit by workspace topology** — same workspace → 1 commit (one gate-C); separate workspaces → per-branch commits merged via PR using `git.workflow_model`. (Q5) MCP SDK hard-pinned `@modelcontextprotocol/sdk@1.29.0` exact. Channel carries ONLY mechanical coordination (claim/done/conflict/yield) — never design directives (zod-validated closed message enum). An MCP server cannot spawn sessions → the lead spawns; the channel is transport only.
- Rationale: a baseline-owned, portable (`.mcp.json`) substrate over an experimental first-party feature; keep the constitution's spine via a fenced charter exception rather than rewriting §4.2. The separate-workspace-per-branch-PR path also sidesteps [[multi-wave-worktree-is-an-agent-tool-constraint]] (each workspace commits independently).
- Rejected: native Agent Teams (peer decision-makers break §4.2 harder); worktree subagent waves (no mid-flight coordination, wave-barrier not pipeline); custom MCP as full orchestrator (MCP can't spawn sessions).
- Reference: Agent Teams docs https://code.claude.com/docs/en/agent-teams ; multi-agent coordination patterns https://claude.com/blog/multi-agent-coordination-patterns ; community message-bus MCPs (claude-peers-mcp, Interagent).
