---
key: .claude/skills/standup/gather.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/standup/**
source: inferred-from-code
verified-at: 87d3573
last-touched: 2026-08-13
---

- Role: Domain — the recap `/standup` reads. Gathers release state (last tag, commits-since classified by conventional-commit type, aggregate semver bump from `.releaserc.json`, pushed-vs-origin), the backlog bucketed open/picked-up/dropped with epic children nested under `parent`, condensed pending questions, and the roadmap epic rollup. Per Article II it gathers only — the "what to pick up next" judgment is main-context's.
- Entry point: `gatherSync({ rootDir, now, remote = false })` at `:28`. The parameter is `rootDir`, not `root`. Returns EXACTLY six top-level keys; `tests/standup-cli-recap.test.mjs:71` asserts it, so new data nests rather than adding a key.
- `remote: true` is the ONLY path that leaves the machine (`collectRemoteFreshness`, `:122`). It runs `git ls-remote` through `probeGit` (`:378`), which is separate from `gitOut` because a network call needs a bound: `timeout: PROBE_TIMEOUT_MS` (30s, measured — see [[network-git-timeouts-must-be-measured-not-guessed]]) plus `killSignal: 'SIGKILL'`, and `shell` left at its default false so remote-controlled ref names never reach argv.
- `compareHead` (`:157`) returns `{state, sha}` with FOUR states — `diverged | matched | unreachable | not-comparable` — surfaced as `release.remote.headState`. Collapsing any two is the defect the four-state split exists to prevent; see [[a-verdict-must-distinguish-checked-from-nothing-to-compare]].
- Backlog and questions route through `resolveCategory` from [[.claude/skills/memory-index/lift-fields.mjs]], so both store shapes read identically.
- Caveat: `degraded[]` markers mean *the store is absent*, not *the store is empty*. `no-backlog` fired for weeks while 16 shards existed, because the collector read flat `backlog.md` after the T4 migration had sharded it. Keep the marker's meaning honest; a reader that cannot find its data must say so rather than returning a confident zero.
- `collectRoadmap` (`:266`) projects parse.mjs's plan into TWO sibling keys per epic, and they must not be conflated: `tasks` is the `{done,inProgress,planned}` **tally object**, `openTasks` is the **row array** (`{id, status, title}`) for planned and in-progress rows only. `tests/standup-roadmap-parity.test.mjs:57` asserts `!Array.isArray(epic.tasks)` specifically to keep rows off the tally key. Done rows are dropped in `openRowsOf` (`:297`) rather than at render time, so nothing downstream can print them by accident.
- `collectPendingQuestions` (`:240`) strips markdown emphasis BEFORE matching its label, so one pattern serves `- **Question.** x`, `- **Question:** x` and `- Question: x`. The matcher shape is load-bearing for a second reason — see [[adjacent-unbounded-quantifiers-are-quadratic-even-when-anchored]].
- Caveat: the file is 509 lines, past the layer-split guideline. Tracked as [[standup-gather-mjs-past-the-layer-split-guideline]]; `render.mjs` has since crossed it too and is not yet tracked separately.
