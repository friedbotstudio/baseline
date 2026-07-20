# Security reports — chore-archive-node

## chore-archive-node-2026-07-20.md

# Security Review — chore-archive-node — 2026-07-20

## Summary

Overall risk: **LOW** (no findings). The diff adds one declarative node to a workflow DAG in
two JSONL config files, updates a test fixture, and adds one read-only test. No executable
code, no hooks, no guards, no consent paths, no dependencies, no network or filesystem
surface beyond reading two repo-local config files in a test.

## Findings

None.

## Checked and clear

Enumerated rather than asserted:

- **Consent surface unchanged.** The new `archive` node carries `needs_user: false` and no
  `condition`. It is an ordinary work phase, not a gate. The chore track's only `needs_user`
  node remains `grant-commit`, whose `condition: {name: "requires_commit_consent"}` is
  untouched. The change cannot weaken gate C.
- **No phase was removed or reordered around a gate.** The DAG went from
  `chore -> roadmap-sync -> ...` to `chore -> archive -> roadmap-sync -> ...`. Everything
  downstream of `archive` keeps its prior relative order and dependencies.
- **The change is restrictive, not permissive.** Before, `deriveExceptions` auto-excepted
  `archive` on every chore workflow; now it does not. A phase that previously did not run
  now runs. There is no path by which adding a required phase grants capability.
- **No executable surface.** `git status` confirms the diff touches only two `.jsonl` config
  files, one JSON fixture, and one `.test.mjs`. Nothing under `.claude/hooks/`,
  `.claude/state/`, `bin/`, or `scripts/`.
- **Test reads only, writes nothing.** `tests/committing-tracks-declare-archive.test.mjs`
  loads both workflows files through the existing validator and asserts. No temp files, no
  network, no shell.
- **Dependencies.** None added; `package.json` and the lockfile are untouched.
- **Template parity.** The identical change landed in `src/.claude/workflows.template.jsonl`,
  so consumer installs receive the same corrected DAG. A live-only fix would have left every
  downstream project still silently skipping archive on chore — the drift class recorded in
  landmine `live-template-config-drift-silent`.

## Dependencies

None added.

## Out of scope / Noted

- The `freeform` and `epic` tracks also commit without archiving. Both are deliberate and are
  now encoded as reasoned exemptions in the new test rather than left implicit. `epic` in
  particular MUST keep its spec live at `docs/specs/<epic>.md` for epic-child pinning; a
  future "fix" that adds archive there would break `track_guard`'s pin resolution.

