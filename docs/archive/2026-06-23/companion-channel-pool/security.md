# Security reports — companion-channel-pool

## companion-channel-pool-2026-06-23.md

# Security Review — companion-channel-pool — 2026-06-23

## Summary

Overall risk: **LOW**. The new project-local `sprint-pool` channel adds three MCP tools and a per-session push bridge over a **single-machine, local-filesystem** coordination store. Every peer-supplied id that reaches a path is validated through the reused baseline `isSafeId` (CWE-22) gate before any fs operation; there are no network trust boundaries, no secrets, no crypto, and no new dependencies. The one real trust decision — launching an unlisted channel via `--dangerously-load-development-channels` — is the operator's own code, run attended, and is documented.

## Findings

### [LOW] Channel push content is derived from local state, not untrusted input
- **OWASP**: A03 Injection (prompt-injection-adjacent) | **CWE**: CWE-20
- **File**: `.claude/mcp/sprint-pool/server.mjs:~95` (`startWatchLoop` → `mcp.notification`)
- **Evidence**:
  ```
  content: `pool ${event.event}: ${event.task_id}`,
  meta: { event: event.event, task_id: event.task_id },
  ```
- **Impact**: channel events become session context. If free-form text reached `content`, it could steer the peer session. Here `event.task_id` is `isSafeId`-validated at `enqueue_task` time (`[A-Za-z0-9_-]+`), and the free-form `brief` is **not** pushed — the peer reads it from `tasks.json` only after claiming. So the push surface carries no attacker-controlled free text.
- **Recommendation**: keep `content`/`meta` limited to validated ids + fixed event names (current behavior). Do not interpolate `brief` or other free text into the notification.

### [LOW] Task integrity depends on local-filesystem trust
- **OWASP**: A08 Software & Data Integrity Failures | **CWE**: CWE-913
- **File**: `.claude/mcp/sprint-pool/watcher.mjs`, `handlers.mjs` (channel store under `.claude/state/sprint/<id>/`)
- **Evidence**: a peer claims and executes the recipe of any `pending` task in `tasks.json`; the store is a local file-locked directory.
- **Impact**: anyone who can write `tasks.json` could enqueue a task whose `brief`/`write_set` a peer would act on. This requires local fs write access (already a full compromise) and is bounded by (a) attended peers — tool use still hits permission prompts, (b) the bounded-executor contract — a peer yields un-decided forks and stays within `write_set`.
- **Recommendation**: keep peers **attended** (the spec's OQ-2 decision — no `--dangerously-skip-permissions`). Revisit only if unattended/permission-relay peers are ever introduced.

### [LOW] `--dangerously-load-development-channels` loads unlisted channel code
- **OWASP**: A05 Security Misconfiguration / A08 | **CWE**: CWE-829
- **File**: launch path documented in `.claude/skills/companion/SKILL.md`
- **Impact**: the flag bypasses the Anthropic channel allowlist. It is required because the channel is a custom project-local server. The code loaded is the operator's own, in their own repo.
- **Recommendation**: documented as the launch prerequisite; gated additionally by `velocity.sprint_mode.enabled` (the registrar refuses to start when off). No change needed for the prototype; if it ever ships, an org `allowedChannelPlugins` entry replaces the dev flag.

## Dependencies

No new packages. `@modelcontextprotocol/sdk@1.29.0` is already a project devDependency and present in `node_modules`; the channel reuses it. `npm audit` not run for new packages (none added).

## Out of scope / Noted

- Input validation is consistent: `enqueue_task` / `release_task` validate `task_id`, `leave_peer` validates `peer_id`, and `channelRoot()` validates `sprint_id` — all via `isSafeId` before any fs write (verified by `test_when_enqueue_task_with_traversal_id_then_rejected` and `test_when_leave_peer_with_traversal_id_then_rejected`).
- Cross-machine peers are an explicit non-goal; no network listener is opened (unlike the channels-reference webhook example's `Bun.serve`). This avoids the SSRF/open-port surface entirely.
- `registerPoolPeer` writes `pclass:"session"` peers only; the swarm-worker path is untouched (no privilege confusion between the two peer classes).

