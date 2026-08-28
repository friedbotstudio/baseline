---
key: the-kind-column-has-no-validator-and-nothing-notices-7c14
category: backlog
scope: [spec, triage]
governs: .claude/skills/workspace/delta.mjs, .claude/skills/spec-lint/
status: open
deferred: cost
raised-on: 2026-08-29
raised-in-context: stale-keying-and-glob-scope
source: assistant-deferral
estimated-effort: low (one membership check against a registry that already exists)
verified-at: e9a5893
last-touched: 2026-08-29
---

> verbatim (assistant, 2026-08-29):
> "Nothing validates that Kind column against the corpus vocabulary. My typo passed the spec lint, passed gate A, passed the checker fan-out, and only surfaced two phases later when a test noticed four elements claiming to be witnessed by nothing."

- Intent: validate a `## System delta` row's `Kind` cell against the kinds the witness registry actually knows, and reject an unregistered one at spec time instead of writing it into the corpus.
- Why it matters: the value is written verbatim into a `.puml` shard, and an unregistered kind binds `witness: none` rather than throwing. The failure is therefore silent at the moment it is caused and loud two phases later, in `/archive`, where the repair is a spec amendment plus a delta re-run rather than a one-word fix. The full incident is [[a-spec-system-delta-kind-reaches-the-shard-writer-unchecked]].
- Where it belongs: `/spec-lint` is the natural home, since it already parses the table and runs before gate A. The checker fan-out is the alternative and would catch it a little later, still before any corpus write.
- Deferred on cost, not on doubt: the fix is a membership test against a list that exists, but landing it inside the workflow that discovered it would have been a third scope expansion on a ticket that had already absorbed two.
- Do NOT close this by making the writer map `component` to `c4_component`. The two vocabularies are deliberately distinct (element records say `component`, shards say `c4_component`), so a silent rewrite would paper over a wrong cell rather than reject it.
