# Pattern Research — baseline-mcp

Four axes, one per open design question from `docs/intake/baseline-mcp.md`. Structured the way `docs/archive/2026-06-23/sprint-pool-broker-transport/research.md` structured its five, because this is the same subsystem and the same reviewer.

## Prior art (retrieved)

`retrieve.mjs` scanned 232 sources and returned 230 term hits and 0 structural hits. `structuralUnresolved` reports one entry — element `sprint-channel-server` names `source_spec: mvp-sprint-parallel-cycles`, which resolves to no archived spec because Epic 11 is still open and its spec is live at `docs/specs/mvp-sprint-parallel-cycles.md`. That is a benign explanation, not corpus drift.

**Already answered upstream, reused rather than re-derived:**

- `docs/archive/2026-06-23/sprint-pool-broker-transport/research.md` (via terms, score 14) — the transport axis was decided once already: UDS over TCP, NDJSON framing, in-process broker, file-backed durability, XDG/TMPDIR socket rendezvous. Its recommendation names the exact flip condition this epic triggers: *"cross-machine entering scope → A2 (TCP)"*. Native cross-session messaging supplies cross-machine through Remote Control, so the flip resolves without TCP.
- `.claude/memory/decisions/sprint-pool-broker-transport-2026-06-23.md` (via terms, score 14) — records that the clone-per-peer topology **already broke** the per-`PROJECT_DIR` `channelRoot` assumption: *"separate clones never shared `tasks.json`"*. The fix moved the **transport** out of the tree; the **file store** was left behind. Axis 1 below is finishing that job, not discovering it.
- `.claude/memory/decisions/sprint-channel-mcp-registration-2026-07-25.md` — enumerates the full MCP-count cascade surface and records that `audit-baseline` is **bidirectional**: a `.mcp.json` server absent from `EXPECTED_MCP_SERVERS` flags "unexpected". A rename is 4→4, so the count-word surfaces (`derive-counts.mjs` SPELLED map, `site-src/install.njk` literals, README and CONSTITUTION counts) do **not** change — only the name-bearing ones do. This materially narrows slice A.
- `docs/archive/2026-06-23/org-team-charter/spec.md` (via terms, score 14) — the Article X charter, source of the closed-schema constraint.

**One retrieved fact is stale and must not be cited as-is.** The 2026-06-23 transport decision states the ownership boundary as *"`.claude/mcp/sprint-pool/**` + new `.claude/mcp/sprint-broker/**` are PROJECT-LOCAL (not shipped, not in manifest)"*. Verified against `obj/template/.claude/manifest.json` on 2026-08-19: **all fourteen** MCP files ship, including all five `sprint-broker/` and all three `sprint-pool/` files. Retiring either server is therefore a consumer-visible manifest change, not a free project-local deletion. Per Article IX.2 this entry needs correction at `/memory-sync`; the delta below assumes the verified state, not the recorded one.

**Newly derived below:** all four axes. None of the retrieved sources decides the state-root resolution, the rename migration, the default-channel identity, or the native-accelerator attachment.

## Axis 1 — Channel state root across worktrees

Today: `.claude/mcp/sprint-channel/server.mjs:15` uses `CLAUDE_PROJECT_DIR || process.cwd()`. `sprint-pool/server.mjs:35` derives `PROJECT_DIR` identically, so any fix must cover both or the defect stays half-repaired.

### Candidate A1: resolve from `git rev-parse --git-common-dir`

- **Summary**: Shell out to `git -C <cwd> rev-parse --git-common-dir`; in a linked worktree this returns the **primary** repository's `.git`, whose parent is the primary tree. Anchor `.claude/state/sprint/` there.
- **API references (current)**: no library API — `git rev-parse --git-common-dir` is plumbing already relied on elsewhere in this repo (`hooks/lib/common.mjs → isPrimaryWorkTree`).
- **Fits**: yes. Scout notes `org-mode.mjs:78` already shells out to `git -C <root> rev-parse` with `spawnSync`, so the idiom and the error handling exist.
- **Tests it enables**: a real two-worktree fixture asserting one resolved root; a non-worktree checkout asserting today's path unchanged; a non-git directory asserting the named failure. No mocks — `git` is not an internal module.
- **Tradeoffs**: adds a subprocess to server startup, so a broken `git` becomes a startup failure rather than a silent private store. That is the intended trade, but it must fail loud rather than fall back, or the defect returns quietly.

### Candidate A2: keep `CLAUDE_PROJECT_DIR`, require peers to export it

- **Summary**: No code change. Document that a peer session in a worktree must start with `CLAUDE_PROJECT_DIR` pointed at the primary tree.
- **Fits**: poorly. `companion/SKILL.md` says a peer is *"an ordinary Claude Code session opened in the same repo"* with *"no launcher and no special flags"*. This adds the flag it promises there is none of.
- **Tests it enables**: none meaningful — it is a documentation change, and the failure mode it leaves in place is silent.
- **Tradeoffs**: zero implementation cost, and it re-creates the exact class of bug the 2026-06-23 decision already paid to remove once. A peer that forgets the export gets a split pod with no error.

### Candidate A3: relocate the store outside the repo, mirroring the socket

- **Summary**: Anchor channel state under `XDG_RUNTIME_DIR`/`TMPDIR` keyed by a repo identity hash, exactly as `sock-path.mjs:12-15` already anchors the socket.
- **Fits**: partially. It is the established in-repo idiom for the socket, and it solves worktrees and separate clones in one move.
- **Tests it enables**: same fixtures as A1, plus a separate-clone case A1 cannot serve.
- **Tradeoffs**: channel state stops being inspectable at `.claude/state/sprint/`, which every existing test, the `/companion` SOP, and `sprint_status`'s debuggability assume. It also makes state survive `git clean` and vanish on reboot under `TMPDIR` — the opposite durability profile from today's.

## Axis 2 — Rename migration

The blocker from scout: `src/cli/mcp.js:46-49` computes `mergedServers = {...tgtServers}` then overlays template entries. **It never deletes.** A consumer upgrading would end up with both `baseline` and a stale `sprint-channel` pointing at a removed directory.

### Candidate B1: hard break plus an explicit deletion step in the upgrade path

- **Summary**: Teach the `.mcp.json` merge a narrow, named removal — drop a server entry when it matches a recorded rename from the baseline's own migration list. `upgrade-project` runs it; a consumer who never upgrades gets a server that fails to start.
- **Fits**: yes, if the removal is keyed to an explicit rename record rather than a general "delete anything not in the template" rule, which would destroy a consumer's own third-party servers.
- **Tests it enables**: an upgrade fixture with the old name asserting it is gone and the new one present; a fixture with an unrelated third-party server asserting it survives; the existing `tests/upgrade-mcp-noop.test.mjs` NOOP classification staying green.
- **Tradeoffs**: adds deletion to a merge that has only ever added, which is a sharper tool than the codebase currently owns. The blast radius of getting the match wrong is a consumer's config.

### Candidate B2: ship both names for one major, alias the old to the new

- **Summary**: Register `baseline` and keep `sprint-channel` as a second entry pointing at the same server file for one major version, then remove it.
- **API references (current)**: `@modelcontextprotocol/sdk@1.29.0` — `registerTool` **throws** on a duplicate name (`if (this._registeredTools[name]) throw new Error(...)`), verified via context7 against the v1.29.0 source. Two distinct *server* entries are fine; duplicate *tool* names inside one server are not.
- **Fits**: yes, and it makes AC-4's "named error" unnecessary because nothing breaks.
- **Tests it enables**: a fixture asserting both entries resolve to a live server; a later fixture asserting the alias is gone.
- **Tradeoffs**: a consumer runs two MCP servers over one state root for a whole major version, which doubles the connection count and invites exactly the split-store question Axis 1 is fixing. It also defers the breakage rather than removing it, and `EXPECTED_MCP_SERVERS` would have to accept both, weakening the audit for the duration.

### Candidate B3: hard break with no migration, documented in release notes

- **Summary**: Rename, mark the commit breaking, and let the consumer edit `.mcp.json` by hand.
- **Fits**: no. `upgrade-project` exists precisely so consumers do not hand-edit baseline files, and `tests/audit-consumer-install.test.mjs` encodes that expectation.
- **Tradeoffs**: cheapest to build, worst to receive. Rejected below.

## Axis 3 — Default-channel identity

Intake AC-5 needs a session with no `sprint_id` to enqueue and claim. Scout notes the whole tool table registers through one loop injecting `channelRoot(sprint_id)` (`server.mjs:84`), so this is one seam.

### Candidate C1: one default channel per repository

- **Summary**: Absent `sprint_id`, resolve a fixed literal channel (say `default`) under the Axis-1 resolved root. Two concurrent solo sessions in one repo share one task list.
- **Fits**: yes, and it composes with Axis 1 — the repo-level root is already being made worktree-stable, so "per repository" becomes well-defined for free.
- **Tests it enables**: two sessions against one repo asserting a shared list; the single-winner claim guarantee holding across them.
- **Tradeoffs**: two unrelated pieces of work in one repo collide in one list. That is arguably correct for a shared task board and wrong for two independent explorations.

### Candidate C2: one default channel per session

- **Summary**: Key the default channel to the session id, so each session gets a private list.
- **Fits**: it reproduces the native `TaskCreate` semantics the intake says are inadequate for the multi-session case. It would satisfy AC-5's letter while giving up the cross-session property the epic exists for.
- **Tradeoffs**: sessions cannot see each other's tasks without an explicit channel, so the "centralized task tracking" the requester named is opt-in rather than default.

### Candidate C3: per-repository default, with an explicit channel always overriding

- **Summary**: C1's resolution as the default, with `sprint_id` still accepted on every tool exactly as today. A workflow that wants isolation names a channel.
- **Fits**: yes. It is C1 plus the existing parameter, so it adds no new concept and keeps every current org-mode call site working unchanged.
- **Tests it enables**: C1's fixtures, plus one asserting an explicit `sprint_id` still isolates.
- **Tradeoffs**: none identified beyond C1's — the collision case remains, but it now has a documented escape.

## Axis 4 — Native messaging attachment

Constraint from intake: the native message carries a pointer, never a payload, so the closed schema stays the only path judgment could travel.

### Candidate D1: fire-and-forget pointer on state transitions

- **Summary**: When `enqueueTask`, `signalDone` or `releaseTask` makes a lane claimable, the lead sends one `SendMessage` naming the channel and task id. The receiving peer reads the channel for the payload. Native availability probed once at startup; unavailable degrades to today's reconcile.
- **API references (current)**: Claude Code cross-session messaging — `ListAgents` for discovery, `SendMessage` for delivery, sessions addressed by name; delivery is one of delivered / held / refused; a held message in a `bypassPermissions` session drops after `dialogExpiry` (5 min default); requires v2.1.224+, macOS and Linux only, absent on Bedrock / AWS / Google Cloud / Microsoft Foundry, and off when `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `DISABLE_GROWTHBOOK` disables feature-flag evaluation. Source: https://code.claude.com/docs/en/cross-session-messaging (fetched 2026-08-19).
- **Fits**: yes. It is additive to handlers that already write the state transition, and it changes no return shape.
- **Tests it enables**: a suppress-all-delivery fixture asserting the pod still completes (intake AC-10); a capability-absent fixture asserting no error; an assertion that the sent text contains no payload field.
- **Tradeoffs**: the lead must know each peer's session name, which `ListAgents` supplies but the channel's `peer_id` does not — so peer registration needs to carry or resolve a session name, which is new state.

### Candidate D2: keep the broker, add native only for cross-machine

- **Summary**: Retain `sprint-broker` for same-machine push and use native messaging solely to reach peers on other machines via Remote Control.
- **Fits**: it preserves `tests/org-broker-hijack.test.mjs` and the one-lead-per-channel guarantee scout flags as at risk.
- **Tradeoffs**: two push paths to maintain, and the broker is the larger of the two. It keeps the research-preview problem that makes `sprint-pool` unregistrable, which is one of the things this epic set out to remove.

### Candidate D3: replace the reconcile with native delivery

- **Summary**: Treat native messages as reliable and drop the `sprint_status` reconcile loop.
- **Fits**: no. The docs are explicit that delivery is not guaranteed in every configuration, and annex §5.6 pins `all_done` on `sprint_status` as *"the authoritative, never-dropped completion check"* after a real regression. Listed only to record that it was considered and rejected.

## Recommendation

**A1 + B1 + C3 + D1.**

**A1** finishes the job the 2026-06-23 transport decision started, using an idiom already present at `org-mode.mjs:78`, and keeps state inspectable where every existing test and SOP expects it. A3 is the more general fix and the one to reach for if separate clones re-enter scope; it is more change than the acceptance criteria ask for today.

**B1** is the only candidate that satisfies AC-4 as written. The narrow risk — teaching an additive merge to delete — is contained by keying deletion to an explicit rename record rather than to template absence.

**C3** costs one resolution rule over C1 and preserves every current call site, because `sprint_id` stays accepted everywhere it is accepted now.

**D1** buys the latency the requester asked for while leaving the closed schema structurally intact, since the free-text path never carries a payload.

**What would flip each of these.** A1 → A3 if a peer ever needs to run from a separate clone rather than a worktree, which is the topology the 2026-06-23 decision was actually built for. B1 → B2 if the consumer base is large enough that a hard break is unacceptable, which is the requester's call and not a technical one. C3 → C2 if two concurrent solo sessions in one repository sharing a task list turns out to be surprising rather than useful. D1 → D2 if the one-lead-per-channel guarantee that `tests/org-broker-hijack.test.mjs` pins cannot be re-established without the broker.

## Open questions

These need a human decision before the spec is written. Each changes what gets built, not merely how.

- **Does the broker's one-lead-per-channel guarantee survive its retirement, and how?** `tests/org-broker-hijack.test.mjs` and annex §5.6 pin it as a MEDIUM security regression fix — a second broker on an occupied socket refuses rather than silently splitting the pod. Native messaging has no equivalent concept. Under D1 the broker goes, and nothing in the candidates above replaces that property. It needs either an explicit disposition (the guarantee is no longer needed because there is no socket to hijack) or a replacement in the channel store.
- **Does peer registration gain a session name?** D1 needs the lead to address peers by the name `ListAgents` reports, and `register_peer` currently records a `peer_id` chosen by the caller. Either registration carries the session name, or the lead resolves `peer_id` to name some other way. This is new state on a shipped tool.
- **Which slices may land while `velocity.org_mode.enabled` stays `false`?** Carried forward from intake and still open. Slices A–D are exercisable with the flag off; slice E's criteria are not, so verifying E means flipping the flag in this repository.
- **Is the stale ownership-boundary memory entry corrected in this epic or separately?** The 2026-06-23 decision records `sprint-pool`/`sprint-broker` as unshipped; the manifest says otherwise. Correcting it is a `/memory-sync` action, but the epic's slice D depends on the corrected fact.
