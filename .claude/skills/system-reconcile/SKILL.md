---
name: system-reconcile
owner: baseline
description: Report the health of the central system spec at `docs/system/` across seven checks — coverage gaps, stale elements, dangling anchors, duplicate anchors, orphan shards, unillustrated elements, and shards missing their kind annotation. Report-first and read-only: it repairs nothing until a human confirms a specific item. Use when the corpus has drifted, after a merge that touched `docs/system/`, or from `/archive` Step 5.5 in report-only mode. Requires `memory.architecture_map.enabled`.
---

# system-reconcile — corpus health, reported before anything is repaired

Invocable by the user (`/system-reconcile`) and by Claude (`/archive` Step 5.5, report-only).

The corpus at `docs/system/` accumulates two kinds of drift: the tree moves out from
under the model, and the model grows entries the tree no longer backs. Seven checks
name both directions. The report is the deliverable — repairs are a second,
human-confirmed step, and most runs end after the report.

## The one-writer rule

`/archive` Step 5 is the corpus's only writer on the primary tree. This skill does
not have an apply mode and `reconcile-report.mjs` exports no writer, so no workflow
phase can reach one through it. When a repair is confirmed, you perform it here in
main context using the writers that already exist — never by adding one to the
report module.

## Step 1 — check the flag

```bash
node -e "import('./.claude/skills/workspace/flags.mjs').then(m=>console.log(m.architectureMapEnabled({rootDir:process.cwd()})))"
```

`false` → stop and tell the user the corpus is not enabled for this project. Every
path below is inert, so running them would print seven empty arrays and read as a
clean corpus rather than an absent one.

## Step 2 — run the report

```bash
node -e "import('./.claude/skills/system-reconcile/reconcile-report.mjs').then(async m=>console.log(JSON.stringify(m.runReconcile({specDir:'docs/system',rootDir:process.cwd()}),null,2)))"
```

Nothing is written. `docs/system/` is byte-identical afterwards, which is the
property `/archive` Step 5.5 depends on.

## Step 3 — read the seven checks

| Check | What a non-empty result means | The repair, once confirmed |
|---|---|---|
| `gaps` | A governed-surface file no element anchors. The map is no longer total over what it claims to describe. | Add an element whose anchor covers it, or widen an existing anchor to a glob. |
| `stale` | The element's stored `anchor_digest` no longer matches the file's structural interface — something another file could depend on moved. | Re-stamp the element after confirming the diagram still describes it. |
| `dangling` | The anchor resolves to nothing. A broken route, not an unfalsifiable drawing. | Repoint the anchor, or remove the element if the subject is gone. |
| `duplicateAnchors` | Two ids claim one anchor — usually a merge where each branch derived the same anchor under a different name. | Reported, never auto-resolved: two meanings sharing one anchor cannot be told apart mechanically. Ask which id survives. |
| `orphanShards` | A `.puml` section naming no element. The corpus cannot say what the diagram shows. | Add the missing element, or delete the shard. |
| `unillustrated` | An element with no shard. Advisory — a gap in illustration, not a broken model. | Draw it with `writeDiagramShard`, or leave it. |
| `missingKind` | A shard carrying no `' @kind`, so `witness.bindingFor` returns `witness: none` and the element routes but is never citable as evidence. | Write the kind the shard already declares structurally with `writeDiagramShard`. |

An empty array is a real answer, not a missing one. All seven empty means the model
is total over its surface and every element is witnessed.

## Step 4 — propose repairs; repair only what is confirmed

Present the non-empty checks as a numbered list, each with the repair from the table
and the specific ids involved. Then ask which items to repair, using
`AskUserQuestion` when the list is short enough to enumerate.

You SHALL NOT repair an item the user did not name. `duplicateAnchors` in particular
is reported-only by rule — picking a survivor destroys one of two meanings, and the
same rule already governs conflicting contributions.

For a confirmed `missingKind` or `unillustrated` item:

```bash
node -e "import('./.claude/skills/workspace/shards.mjs').then(m=>console.log(m.writeDiagramShard('docs/system','<element-id>',{kind:'<kind>',label:'<label>',rootDir:process.cwd()})))"
```

The kind comes from what the shard already declares structurally — a `Component(...)`
line is `c4_component`, and so on. Where a shard's kind is genuinely ambiguous, leave
it unannotated and say so. An unwitnessed shard routes and is never evidence, which
is a legal state; guessing a kind fabricates a witness binding that nothing checks.

## Step 5 — report what changed

Name every repair applied and every item left alone, and re-run Step 2 so the
closing report reflects the tree as it now stands.

## Constraints

- **Report-only by default.** A run with no confirmation writes nothing.
- **Never add a writer to `reconcile-report.mjs`.** D9 is enforced by the module's
  export surface; a test asserts the export list and scans the source.
- **Never auto-resolve a duplicate anchor.**
- **Never invent a kind** to clear a `missingKind` row.
