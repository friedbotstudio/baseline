# Security reports — shipped-track-template-parity

## shipped-track-template-parity-2026-08-26.md

# Security Review — main — 2026-08-26

## Summary

Overall risk: **LOW**. The change edits one shipped data file, `src/.claude/workflows.template.jsonl`, bringing four consumer-facing declarations back in line with the live track file. Every behavioural edit tightens a control rather than loosening one: a precondition is added, five conditional phases stop being auto-excepted at triage, and a missing phase node is restored. The remaining edits are prose. No code path changed, no dependency moved, and no consent gate was added, removed, or re-ordered.

## Findings

No CRITICAL, HIGH, MEDIUM, or LOW findings.

## What was checked

**Did the org edge repair close a gate bypass?** No — and this was the one edit worth proving rather than asserting. The org track's `spec` node declared `blocks: []` while `approve-direction` still declared `depends_on: ["spec"]`, so the inconsistency was one-directional. `track-tasklist-materializer.js` derives each task's `blockedBy` from `depends_on`, which was intact, so gate A was correctly blocked on `spec` before this change as well as after. The repair removes a contradiction in the declaration; it does not close a hole.

**Does the power fence weaken anything?** The opposite. `preconditions` gains `{name: requires_config_flag, path: velocity.power_mode.enabled, equals: true}`. Per seed.md §18.4 an absent key, `null`, a type mismatch, or an unreadable config all resolve **false**, so the added predicate can only remove `power` from a consumer's candidate set, never add it. Before this edit a consumer could select the power track — which amortizes `security` to once per ticket and splits the commit — without ever opting in.

**Does the chore `internal_phases` edit expand what runs unreviewed?** No; it restores review. Without the key, `deriveExceptions` sent `verify`, `simplify`, `security`, `integrate`, and `document` straight into `exceptions` at triage, where nothing later reconsiders them. With the key they stay out of `exceptions` and the chore skill resolves each at runtime against the actual diff — which is how a chore touching a `security.sensitive_globs` path gets a security phase at all.

**Does the epic `roadmap-sync` node introduce a new authority?** No. `roadmap-sync` is fail-open by contract, writes only the roadmap file plus its own `completed[]` entry, and never blocks a commit. Its absence meant a consumer's epic track silently skipped Phase 10.6.

**The authorization prose.** The epic and epic-child descriptions stopped claiming that a child's discovery-skip unblocks when the epic state reads `approved: true`, and now name the direction-approval token at `.claude/state/spec_approvals/<epic>.approval`. This is a documentation correction with no runtime effect: `track_guard.mjs` already read the token, and the boolean was retired precisely because a write-side detector alone could not stop a forged one. The shipped file had been describing the mechanism that was removed for being unsafe, which is the finding this change closes.

**Injection and traversal.** No path is constructed from any edited value. The `path` string in the new precondition is a dot-path resolved against the parsed `project.json` object by `resolveConfigFlag`; it never reaches the filesystem or a shell.

**Test surface.** `tests/shipped-track-template-parity.test.mjs` is read-only over both track files and the two allowlisted `SKILL.md` paths. Its allowlist is itself pinned: `test_when_the_dev_only_allowlist_is_read_then_every_member_names_a_dev_only_skill` fails if a member stops declaring `Dev-only`, so the exemption cannot quietly widen to cover ordinary drift.

## Dependencies

None added, removed, or version-changed.

## Out of scope / Noted

- `obj/template/.claude/workflows.jsonl` is build output regenerated from this template by `build-template.sh` Stage 2, so it is not edited here. The suite's build-template tests exercise that path and pass.
- The parity test compares the two hand-maintained files. It does not verify that the built artifact matches the template; that remains the build's own responsibility.

