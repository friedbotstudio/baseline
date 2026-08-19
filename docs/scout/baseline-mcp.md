# Codebase Scout Report — baseline-mcp

Corpus reconciliation (`memory.workspace.enabled: true`): `reconcile --touched <slice>` returned `mode: "reconcile"` with an empty delta — `changed: []`, `unreferenced: []`. The structural corpus at `docs/system/` is current for this slice, so what follows is the reconciled map rather than a rediscovery.

Annotation scan (`memory.annotations.enabled: true`): `resolved: 0`, `dangling: 0`. No source file in this repository carries a tracking annotation yet, in or out of the slice.

## Primary touchpoints

**The server being renamed and widened**

- `.claude/mcp/sprint-channel/server.mjs:15` — `STATE_ROOT = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'state', 'sprint')`. The single line behind the split-store defect: a peer in a linked worktree resolves a different root and gets a private store.
- `.claude/mcp/sprint-channel/server.mjs:82` — `new McpServer({ name: 'sprint-channel', version: '0.1.0' })`, the declared server identity.
- `.claude/mcp/sprint-channel/server.mjs:39,84` — the tool table and its single `registerTool` loop; every tool is registered from one array with a shared `{sprint_id, ...rest}` signature, so a default-channel change has one seam rather than thirteen.
- `.claude/mcp/sprint-channel/handlers.mjs` — thirteen exported handlers. The five that are already a task manager: `enqueueTask:145` (takes `task_id`, `brief`, `write_set`, `depends_on`, `assignee`), `claimTask:43`, `signalDone:73`, `releaseTask:192`, `sprintStatus:128`.
- `.claude/mcp/sprint-channel/lib/store.mjs` — the file-backed store; `appendMailbox:33` is its only export, so read/write paths are internal.
- `.claude/mcp/sprint-channel/lib/lock.mjs`, `lib/safe-id.mjs`, `lib/schema.mjs` — the atomic lock, id validation, and the closed message-type enum that Article X §5.6 binds.

**The push transport being retired**

- `.claude/mcp/sprint-broker/broker.mjs:16` — `createBroker({channelRoot, sockPath, onEvent})`; `listen` carries the anti-hijack probe.
- `.claude/mcp/sprint-broker/sock-path.mjs:12` — `resolveSockPath` prefers `$SPRINT_BROKER_SOCK`, else `XDG_RUNTIME_DIR`/`TMPDIR`/`/tmp`. Its header states the intent: "deliberately OUTSIDE any repo clone, so peers in separate working trees reach the same broker." The transport is already worktree-correct; only the file store is not.
- `.claude/mcp/sprint-broker/{client,codec,atomic-store}.mjs` — client connection, wire codec, atomic writes.
- `.claude/mcp/sprint-pool/{server,handlers,registrar}.mjs` — the unregistered push accelerator. `server.mjs:214,225` call `resolveSockPath`; `server.mjs:35` derives `PROJECT_DIR` the same `CLAUDE_PROJECT_DIR || cwd` way as the channel.

**The org path that has no worktrees**

- `.claude/skills/org-dispatch/org-mode.mjs:12` — `orgDispatchGate({project, isGitRepo})` returns `{ok, reason}`.
- `.claude/skills/org-dispatch/org-mode.mjs:25` — `toLaneTasks` carries `write_set` through onto each lane task and audits nothing against it.
- `.claude/skills/org-dispatch/org-mode.mjs:40` — `classifyFork`, the in-lane/escalate decision.
- `.claude/skills/org-dispatch/SKILL.md:23-33` — the lead run loop; step 7 is the round-boundary commit rule, the one Epic 11 slice D AC already satisfied.
- `.claude/skills/companion/SKILL.md` prerequisite 3 — "Same repo, same machine as the lead", the statement that contradicts the worktree-isolation claim elsewhere.
- `.claude/skills/org-dispatch/{peer-select,yield-arbiter}.mjs` — pod selection and yield recording.

**The merge audit slice E lifts from**

- `.claude/skills/swarm-dispatch/swarm_merge.mjs` — CLI-only, `swarm_merge.mjs <plan-path> <task-id> <worktree-path>`. Its documented behaviour is exactly slice E's AC-12: load `write_set`, diff the worktree against `active_wave.json → baseline_ref`, fail loud and preserve the worktree on any file outside the set, otherwise `git diff | git apply` onto main and remove the worktree. Exit 0/1/2.
- `.claude/skills/swarm-dispatch/swarm_wave_audit.mjs:27` — `auditWave(changedPaths, unionWriteSet)`, the only exported function in either file.
- `.claude/skills/swarm-dispatch/worktree-safety.mjs`, `parse_worker_result.mjs` — the isolation helpers slice E would reuse.

**The epic-close defect blocking an honest row-D record**

- `.claude/skills/commit/epic_close.mjs:48-50` — `openChildren` is `children.filter((c) => c.status !== 'committed')`.
- `.claude/skills/commit/epic_close.mjs:53-55` — `committedSliceIds` is `c.status === 'committed'`. The two read the same literal independently, which is the drift the backlog entry warns about.
- `.claude/skills/commit/SKILL.md:19` — Step 2.8, the pre-commit child flip that slice E must reconcile with a single pod-wide gate C.

**The rename's governance chain**

- `.claude/skills/audit-baseline/expected-baseline.mjs:53` — `EXPECTED_MCP_SERVERS = new Set(['plantuml','playwright','sprint-channel'])`.
- `.claude/skills/audit-baseline/checks/mcp-servers.mjs` — reads `.mcp.json`, asserts every `EXPECTED_MCP_SERVERS` name is declared, reports `DEFAULT_MCP_SERVERS` when present.
- `.claude/skills/audit-baseline/checks/docsite-drift.mjs:43` — `names: (n) => n.mcpServers`, reconciling the rendered site against `.mcp.json`.
- `scripts/bundle-mcp-servers.mjs:26-27` — the bundle list, naming `sprint-channel` and `sprint-pool` by directory path.
- `docs/init/seed.md:344` and its byte-mirror `src/seed.template.md:344` — the §12 paragraph naming the thirteen tools, the state root, and the research-preview reason `sprint-pool` ships unregistered.

## Entry points that reach this code

- **MCP stdio launch** — `.mcp.json → mcpServers.sprint-channel` runs `node .claude/mcp/sprint-channel/server.mjs`. This is the only runtime entry to the channel; there is no CLI.
- **`/companion on <channel_id> [peer_id]`** — `.claude/skills/companion/SKILL.md`, how a human session joins as a peer.
- **`/org-dispatch`** — the `org` track's Phase-6 node in `.claude/workflows.jsonl`, gated by `orgDispatchGate`.
- **`node .claude/skills/org-dispatch/org-mode.mjs gate`** — the SOP's documented preflight.
- **`node .claude/skills/commit/epic_close.mjs <epic>`** — invoked from `commit/SKILL.md` Step 2.8 and standalone as the recovery path.
- **`node .claude/skills/audit-baseline/audit.mjs`** — CI drift gate; reaches every governance touchpoint above.
- **`scripts/build-template.sh` Stage 1.7** — invokes the bundler, which reaches both first-party servers.

## Existing tests

Forty-two test files touch this slice. The ones that constrain the change:

- `tests/sprint-channel.test.mjs` — the channel's core handler behaviour. Passing.
- `tests/sprint-channel-escalation.test.mjs` — `ask_lead`/`answer_peer`, the Article X escalation surface. Passing.
- `tests/sprint-broker.test.mjs` — broker lifecycle and codec. Passing.
- `tests/org-broker-hijack.test.mjs` — pinned by annex §5.6 as the one-lead-per-channel security regression. Passing; retiring the broker must not silently drop this guarantee.
- `tests/sprint-pool-handlers.test.mjs`, `tests/sprint-pool-watcher.test.mjs` — cover the server slice D retires.
- `tests/org-dispatch.test.mjs`, `tests/org-allocation.test.mjs`, `tests/org-escalation-channel.test.mjs`, `tests/org-track.test.mjs` — the org path; `org-track` pins the DAG shape slice E's "exactly one integrate" AC needs.
- `tests/org-charter-constitution.test.mjs` — asserts the Article X charter text. The closed-schema constraint lives here.
- `tests/org-consumer-shipping.test.mjs` — what reaches a consumer install; the rename's blast radius check.
- `tests/epic-close-helper.test.mjs`, `tests/epic-close-governance.test.mjs`, `tests/epic-close-commit-sop.test.mjs` — the closed-status repair must keep all three green.
- `tests/bundle-mcp-servers.test.mjs` — asserts the bundler's server list.
- `tests/upgrade-mcp-noop.test.mjs` — AC-004 of `upgrade-version-aware-noop`: a byte-identical `.mcp.json` merge classifies NOOP, and a template that adds a baseline-named server still produces SPECIAL_MERGE.
- `tests/audit-baseline-docsite-drift.test.mjs`, `tests/audit-consumer-install.test.mjs`, `tests/mcp.test.mjs` — the governance reconciliation.

No test in this slice is skipped or marked flaky.

## Constraints and co-changes

- **`.mcp.json` + `src/.mcp.template.json`** — must change in lockstep; the template is what a consumer install copies.
- **`docs/init/seed.md` and `src/seed.template.md`** — byte-equal mirrors, amended first per Article I.4.
- **`CLAUDE.md` + `src/CLAUDE.template.md`** — byte-equal mirrors; Article XII.4 requires it and `audit-baseline` verifies it. `CLAUDE.md` also carries a 40,000-character cap.
- **`.claude/CONSTITUTION.md` §5.6** — the Article X rule table; retiring `sprint-pool` and the broker touches four of its rows, including the hijack row that cites a security regression.
- **`docs/system/elements/sprint-channel-{server,handlers,lib}.md` and the three matching `.puml` diagrams** — the structural corpus renames with the directory or the next reconcile reports drift.
- **`site-src/mcp.njk`, `site-src/org/setup.njk`, `site-src/_data/mcpnotes.json`** — the rendered docs site; `docsite-drift` reconciles it. These sit inside `project.json → tdd.ui_globs`, so `spec_design_calls_guard` will require a `## Design calls` section in the spec.
- **`velocity.org_mode.enabled` is `false` in this repo** — slices A through D are reachable with it off; slice E's criteria can only be exercised with it on.
- **`velocity.sprint_mode.enabled` is `true`** — annex §5.6 records that pool coordination is enabled by `org_mode` **or** `sprint_mode`, so the pool path is live here even with org mode off.
- **`git.workflow_model` is `direct-to-main`, `protected_branches` is `null`** — work lands on `main` and every commit needs fresh `/grant-commit`.
- **`CHANGELOG.md` mentions `sprint-channel`** and is owned by semantic-release; it is not part of the rename.

## Patterns in use here

Handlers are pure functions taking `{channelRoot, ...args}` and returning plain objects; the server is a thin registration loop that injects `channelRoot(sprint_id)` and wraps every result in `reply(...)`. Nothing in `handlers.mjs` reads config or touches process state, which is why the whole file is unit-testable without a running server.

Helpers follow the repository's "front door" convention: a pure exported function plus an `import.meta.url` guard that gives it a CLI (`org-mode.mjs:95`, `swarm_merge.mjs`). New work should keep the pure function exported and the CLI a thin wrapper over it.

Governance facts are single-sourced and then reconciled by `audit-baseline` rather than duplicated — `EXPECTED_MCP_SERVERS` is the one list, and the site, seed and constitution are checked against reality rather than trusted.

## Risks / landmines

- **`org-mode.mjs:91` reads a field the gate never returns.** The CLI prints `verdict.allowed ? 'allowed' : 'refused'`, but `orgDispatchGate` returns `{ok, reason}`. The human-readable path therefore always prints `refused`, including when the gate allows. The `--json` path is correct. `SKILL.md:16` tells the reader to run exactly the broken form.
- **The `.mcp.json` upgrade merge never deletes.** `src/cli/mcp.js:46-49` builds `mergedServers = {...tgtServers}` then overlays template entries. A rename would leave a consumer carrying **both** `baseline` and a stale `sprint-channel` pointing at a deleted directory, which fails to start on every session. Intake AC-4 cannot be satisfied by the existing merge path alone; a deletion step is required.
- **"Worktree isolation" is asserted in three places and implemented in none.** `org-mode.mjs:11,17`, `SKILL.md:19,41`. A repository search for `worktree add` finds no call site outside `swarm-dispatch`. A reader trusting the SOP would believe isolation exists.
- **`swarm_merge.mjs` exports nothing.** It is a CLI-only script, so slice E "lifting `swarm_merge` write-set discipline" means extracting a function first, not importing one.
- **Retiring the broker drops a pinned security guarantee.** `tests/org-broker-hijack.test.mjs` and its annex §5.6 row cover one-lead-per-channel with no silent socket takeover. Native messaging has no equivalent concept, so the guarantee needs an explicit disposition rather than deletion by omission.
- **`sprint-pool` and `sprint-channel` both derive their root from `CLAUDE_PROJECT_DIR || cwd`** (`sprint-pool/server.mjs:35`, `sprint-channel/server.mjs:15`). Fixing one and not the other leaves the split-store defect half-repaired.
- **`epic_close.mjs` reads the `'committed'` literal in two independent places** (lines 50 and 55). The backlog entry's fix explicitly requires both to read one exported constant.
- **Epic 11 will close the moment row D is recorded.** Slices A, B, C are `committed` and E is `committed`+`superseded`; recording D makes every child closed, so `epic_close.mjs` fires and archives the epic's discovery bundle in that same commit. That is intended, but it means slice E's commit is also Epic 11's closing commit.
