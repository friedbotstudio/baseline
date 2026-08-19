# Turn `sprint-channel` into the `baseline` MCP server and land org-mode worktree isolation on it

<!--
Intake document. Produced by the `intake` skill.
Epic track — five slices. Supersedes Epic 11 row D.
-->

## Problem

Three separate defects share one root, and a fourth thing is missing.

**Peer sessions cannot share a channel store across worktrees.** `.claude/mcp/sprint-channel/server.mjs:15` resolves its state root as `join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'state', 'sprint')`. A peer session started inside a linked git worktree therefore gets its own private `.claude/state/sprint/` directory. The pod silently splits into two stores with fresh state and no error is raised.

**Org mode has no worktree isolation at all.** `org-mode.mjs:11` and `org-dispatch/SKILL.md:19,41` all say "worktree isolation requires git", but nothing in the org path creates a worktree — a repository-wide search for `worktree add` finds no call site outside `swarm-dispatch`. `companion/SKILL.md` prerequisite 3 states the actual arrangement: "Same repo, same machine as the lead." Peers write concurrently into one shared working tree, isolated only by a declared `write_set` that nothing audits.

**Epic 11 slice D was specified against a component that no longer exists.** Its four acceptance criteria name `sprint-dispatch`, which is retired and off disk (`docs/specs/mvp-sprint-parallel-cycles.md:367`, write surface `.claude/skills/sprint-dispatch/merge*.mjs`). Measured against `org-dispatch` on 2026-08-17, one AC was already satisfied and three described behaviour that does not exist. Building it as written would target nothing.

**There is no cross-session task list.** Claude Code's native `TaskCreate`/`TaskUpdate` tools are session-scoped, and from v2.1.233 they are withheld entirely on Opus 4.8, Sonnet 5, Fable 5, Mythos 5 and later unless a session opts in. For a flat pod of up to four independent peer sessions, native tooling cannot hold a shared list at all. The requester's framing:

> once we get into freeform, or when we need to define dynamic tasks, it will become challenging. Ideally our `sprint-channel` mcp should become `baseline` mcp that can have additional features like task management, and other features needed later

and the reason it is not speculative:

> this will help us later as we will move to building multi session orchestration (creating a tasklist and assigining it to individual session can be power feature, with centralized task tracking)

The machinery for that already exists and is under-used. `enqueue_task` accepts `assignee` and `depends_on`, `claim_task` is file-locked and single-winner, and `sprint_status` is the authoritative reconcile — a dependency-aware task manager wearing a sprint-shaped name, reachable only when `velocity.org_mode.enabled` is on, which it is not.

## Goal

A single first-party MCP server named `baseline` holds cross-session task state that works on every track, and org-mode peers work isolated worktrees whose output is write-set-audited before it lands, integrated once, and committed under one consent gate.

## Non-goals

- **Not restoring the native session task panel.** MCP servers return content to the model; they cannot paint Claude Code's UI. Whatever this builds is rendered as text. Restoring the panel is `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` at session start and is orthogonal to this work.
- **Not replacing `sprint-channel`'s closed message schema with native free-text.** The requester's decision: "I will keep what exist today in sprint-channel, but also add native mesaging when available considering it will be faster." Article X and annex §5.6 bind the closed type set; native messaging is plain text by design and cannot carry that guarantee.
- **Not making native cross-session messaging a hard dependency.** It requires v2.1.224+, runs on macOS and Linux only, is absent on Bedrock, AWS, Google Cloud and Microsoft Foundry, and switches off whenever `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `DISABLE_GROWTHBOOK` disables feature-flag evaluation. The file-based channel is the availability floor.
- **Not building the "other features needed later" the requester mentioned.** Article VI.4 gates abstractions added for hypothetical future use. A server named `baseline` has room for what comes; the room is not built now.
- **Not amending Article II.** This is the inter-session axis (Article X). The subagent count stays 1 per session and no new subagent is declared.
- **Not hand-editing `CHANGELOG.md`.** semantic-release owns it in CI.
- **Not changing the broker socket contract.** `sock-path.mjs` already resolves outside any repo clone so peers in separate trees reach one broker; that is correct and stays.

## Success metrics

- Peer sessions in two linked worktrees of one repository sharing one channel store — baseline: 0 (each creates a private store), target: 1, measured via: a test that starts two peers in separate worktrees and asserts a single state root.
- Org-mode peer write-set violations caught before landing on the primary tree — baseline: 0 (no audit exists), target: all, measured via: a merge-audit test that writes outside a declared `write_set` and asserts nothing lands.
- Task tools usable without `velocity.org_mode.enabled` — baseline: 0 of 5 (`enqueue_task`, `claim_task`, `signal_done`, `release_task`, `sprint_status` all require a channel), target: 5, measured via: a solo-session test that enqueues and claims against a default channel.
- Registered MCP servers in `.mcp.json` — baseline: 4 (`context7`, `plantuml`, `playwright`, `sprint-channel`), target: 4 (`baseline` replaces `sprint-channel`), measured via: `audit-baseline`.
- Bundled-but-unregistered servers — baseline: 1 (`sprint-pool`, unregistrable because Claude Code channels are in research preview), target: 0, measured via: `scripts/bundle-mcp-servers.mjs` output and `seed.md` §12.
- Open rows on Epic 11 — baseline: 1 (row D), target: 0, measured via: `/standup`.
- Files referring to `sprint-channel` outside `docs/archive/` — baseline: 46, target: 0 plus one migration note, measured via: `grep -rl`.

## Stakeholders

- **Requester**: Tushar Srivastava (`razieldecarte@gmail.com`) — sole maintainer of this baseline; every decision recorded below is theirs.
- **Reviewer**: Tushar Srivastava, at gate A. This epic's gate A approves all five slices at once; there is no per-slice approval afterwards.
- **Operator**: Tushar Srivastava, plus every downstream consumer of the published baseline package, who takes a breaking `.mcp.json` change when slice A lands.

## Constraints

- **Article I.4 amendment order is binding.** `docs/init/seed.md` changes first, then `CLAUDE.md` and `.claude/CONSTITUTION.md`, then the `src/*.template.md` mirrors, which must stay byte-equal to their shipped counterparts.
- **The closed message schema is a constitutional property.** Annex §5.6: "the message types are a closed set; coordination travels over it, judgment does not." Any native-messaging path must preserve it structurally, not by instruction.
- **Native delivery is not guaranteed.** A message is delivered, held, or refused; a held message in a `bypassPermissions` session drops after `dialogExpiry` (five minutes by default). `sprint_status.all_done` therefore remains the authoritative never-dropped completion check, exactly as `org-dispatch/SKILL.md` step 4 already has it.
- **The rename breaks consumer installs.** `EXPECTED_MCP_SERVERS` hard-requires the name and `src/.mcp.template.json` ships it. A migration path is required, not optional, and the commit must be marked breaking so semantic-release majors the release.
- **`spec_design_calls_guard` will fire on the spec.** The rename touches `site-src/mcp.njk` and `site-src/org/setup.njk`, both inside `project.json → tdd.ui_globs`, so the spec must declare a `## Design calls` section even though these are text edits.
- **Git model is `direct-to-main` with `protected_branches: null`.** Work lands on `main` and every commit needs fresh `/grant-commit` consent. Article VII binds this over any generic branching instinct.
- **Epic 11 cannot be closed by writing `status: "superseded"`.** `epic_close.mjs:50` filters on `c.status !== 'committed'`, so any other value counts as open and would deadlock the epic permanently. This is a known defect (backlog `epic-close-has-no-superseded-status`) that must be repaired before row D can be recorded honestly.
- **Effort is explicitly not a constraint.** The requester, on the 46-file rename: "The fact that it's a big refactor is irrelevant."

## Acceptance criteria

1. Given a peer session running inside a linked git worktree, when it reads or writes channel state, then it resolves the same state root as a peer in the primary tree, and a root that escapes the repository or that git cannot report fails loud rather than falling back to a private store.
2. Given an ordinary non-worktree checkout, when channel state resolves, then it resolves to exactly the path it resolves to today, pinned by a test.
3. Given the renamed server, when `audit-baseline` runs, then it passes with `baseline` in `EXPECTED_MCP_SERVERS`, the docsite-drift check reconciled, and no non-archive file referring to `sprint-channel` except a migration note.
4. Given an existing consumer install on the old name, when `upgrade-project` runs, then its `.mcp.json` migrates to `baseline` without hand-editing; and given a consumer that never migrated, when a session starts, then it gets a named error rather than a silently absent server.
5. Given a session with no sprint or channel id, when it enqueues, lists, claims, updates or cancels a task, then the operation succeeds against a default channel.
6. Given a task, when it is claimed but not started, then its status is distinguishable from in-progress and from done; and given a cancelled task, then it is never claimable, never blocks a dependent, and is distinguishable from a completed one.
7. Given existing org-mode task state written before the widening, when it is read afterwards, then it is readable unchanged, and `enqueue_task`'s `assignee`/`depends_on` semantics and `claim_task`'s single-winner guarantee are preserved.
8. Given a task becoming claimable or done and native messaging available, when the event fires, then the target session is woken by `SendMessage` carrying a pointer to the channel record and never the payload.
9. Given a platform, provider, or flag configuration where native messaging is unavailable, when the same event fires, then behaviour degrades to today's reconcile-only path with no error and no lost work.
10. Given every native message dropped, when the pod runs to completion, then it still completes, proven by a test that suppresses all native delivery.
11. Given org mode dispatching lanes, when peers execute, then each works an isolated git worktree, and the gate refuses with a named reason when isolation cannot be established rather than silently sharing a tree.
12. Given a peer whose output changes a file outside its lane's declared `write_set`, when the merge audit runs, then it fails loud, preserves the worktree, and lands nothing on the primary tree.
13. Given a completed pod, when the workflow proceeds, then exactly one integrate pass runs over the merged result and a single `/grant-commit` covers the whole landing, reconciled with `commit/SKILL.md` Step 2.8 and `epic_close.mjs`.
14. Given an epic with one slice resolved without a commit, when `epic_close.mjs` evaluates it, then a shared closed-status set including `superseded` lets the epic close; and given an epic with any genuinely open child, then it does not close.
15. Given this epic lands, when `/standup` runs, then Epic 11 row D reads as superseded by `baseline-mcp` with its reason cited, and Epic 11 has no open rows.

## Open questions

- Does slice A hard-break the server name, or ship a one-major-version compatibility alias so a consumer that misses the migration keeps working? Metric 5 and AC-4 assume a hard break with a named error; an alias would change both.
- What identifies the default channel in AC-5 — one per repository, one per session, or a fixed literal? This decides whether two concurrent solo sessions in one repo share a task list or get separate ones, and the answer changes the store layout.
- Does `crossSessionInbound: accept` go into the shipped `src/project.template.json`, or stay documented-only for org-mode operators to set? Shipping it changes inbound behaviour for every consumer taking the new template, including those who never use org mode.
- Which of the five slices, if any, may land while `velocity.org_mode.enabled` remains `false`? Slices A through D are reachable with org mode off; slice E's acceptance criteria can only be exercised with it on, so verifying E may require flipping the flag in this repo.
