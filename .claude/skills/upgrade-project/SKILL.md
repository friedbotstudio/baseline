---
name: upgrade-project
owner: baseline
description: Reconcile baseline-versioned files that the `create-baseline upgrade` CLI staged for LLM-assisted semantic merge. Use when the CLI prints "Open Claude Code and run /upgrade-project to reconcile". Reads the stage manifest at `.claude/state/upgrade/<ts>/manifest.json`, reasons through each pending file's three-way delta in main context, writes a reconciled LOCAL, then deletes the stage when every file lands. Supports `--dry-run` (preview the reconciled diff without writing) and a structured "needs-user-input" fallback when the conflict cannot be disambiguated automatically.
---

# /upgrade-project — semantic-merge reconciliation for baseline files

You are reconciling files that `create-baseline upgrade` decided required **semantic merge** rather than mechanical merge. The CLI has already detected per-file customization, classified each file as tier 3 (SEMANTIC) at build time, and staged the three states (BASE / INCOMING / LOCAL) for you to reason about in main context. This skill is the only sanctioned way to drive that staged state to RECONCILED.

This skill is **maintenance work**, not a workflow phase. It is invoked reactively whenever the upgrade CLI prints the "run /upgrade-project to reconcile" pointer. It does not appear in `.claude/state/workflow.json`, does not require `/triage`, and does not trigger consent gates.

## When to use

- The user just ran `npx @friedbotstudio/create-baseline upgrade <target>` and the CLI exited 5 with a "Pending semantic-merge stage at <ts>" message.
- The user types `/upgrade-project` or asks "reconcile the staged files".
- A previous `/upgrade-project` invocation hit a `NEEDS_USER_INPUT` fallback, the user provided direction, and you re-invoke to pick up where you left off.

## Inputs (read from disk)

For each stage directory under `.claude/state/upgrade/`:

- `manifest.json` — the **stage manifest** the CLI wrote. Schema:
  ```json
  {
    "stage_version": 1,
    "slug": "upgrade-flow-rework",
    "created_at": "2026-05-20T14:49:00.000Z",
    "baseline_version_from": "0.4.0",
    "baseline_version_to": "0.5.0",
    "files": [
      {
        "rel": "docs/init/seed.md",
        "base_sha256": "<hex>",
        "incoming_sha256": "<hex>",
        "local_sha256": "<hex>",
        "status": "PENDING"
      }
    ]
  }
  ```
- For each entry in `files`, three artifacts are present:
  - `<rel>.baseline-base` — the **BASE** content (the file as it was when the user last installed the baseline).
  - `<rel>.baseline-incoming` — the **INCOMING** content (the file as it ships in the new baseline; INCOMING and REMOTE are the same thing).
  - The LOCAL file remains at its real path inside the target tree (untouched by the CLI).

## Procedure

1. **Discover the stage.** Read `.claude/state/upgrade/` and pick the most-recent stage directory whose manifest has at least one file with `status: PENDING` or `status: NEEDS_USER_INPUT`. If no such stage exists, tell the user "No pending stage to reconcile" and exit.
2. **Per file**, in the order they appear in the stage manifest:
   - Read BASE, INCOMING, and LOCAL.
   - Reason about the three-way delta. Identify what changed between BASE → INCOMING (the upstream edit), what changed between BASE → LOCAL (the user edit), and where they conflict.
   - If both edits are textually non-overlapping, the CLI would have routed the file to tier 2 (mechanical merge). The fact that the file is in tier 3 means structural reconciliation is needed — most commonly: both sides inserted content at the same structural anchor (a new section, a new numbered article, a new TOC entry).
   - Apply the **zero-drift renumbering rule** below.
   - Write the reconciled bytes to the LOCAL path.
   - Update the stage manifest entry's `status` to `RECONCILED`.
3. **Finalize the stage.** When every entry's status is `RECONCILED`, delete the stage directory (`rm -rf .claude/state/upgrade/<ts>/`). Report per-file status to the user.

## The zero-drift renumbering rule (binding)

When BASE → INCOMING adds a new structural entry (a new Article, a new section, a new numbered item) at position N, and BASE → LOCAL added the user's own entry at the same position N, you SHALL renumber the user's entry to the **next available** slot (N+1) — you SHALL **never fold** the user's entry into an existing baseline section.

Concrete example (the Article-XI reproducer):
- BASE `seed.md` ends at Article X.
- LOCAL has added a project-specific `## Article XI (user content)`.
- INCOMING ships a new baseline `## Article XI (Skill provenance and the baseline manifest)`.

The reconciled `seed.md` SHALL contain:
- `## Article XI` — the baseline's content (verbatim).
- `## Article XII` — the user's prior content, renumbered.
- Every cross-reference in the document that pointed to "Article XI" SHALL be updated to point to either Article XI (when the reference was always to the new baseline content) or Article XII (when the reference was to what was previously Article XI). Surface ambiguous references as `NEEDS_USER_INPUT` per the fallback below.

The reason **shift, never fold**: the next baseline upgrade SHALL produce zero new staging entries for this file. If the user's content were folded into an existing baseline section, the next upgrade would re-detect a customization and re-stage. The renumbering preserves both bodies as independent structural units, so subsequent upgrades see exactly the baseline-owned portion (Articles I–XI) as unchanged.

The same principle applies recursively. If a later baseline ships Article XII and the user's content has been at Article XII since the prior upgrade, shift the user's content to Article XIII. Always shift to the next available slot.

## `--dry-run` mode

When invoked with `args=dry-run` (e.g., `/upgrade-project dry-run`):

- Per file, produce the reconciled bytes in your reasoning, then emit a colorized unified diff (LOCAL vs reconciled) to the skill's terminal output rather than writing.
- DO NOT modify any LOCAL file.
- DO NOT update the stage manifest (statuses stay PENDING / NEEDS_USER_INPUT).
- DO NOT delete the stage directory.
- Tell the user: "Dry-run complete. Re-run without `dry-run` to apply."

Dry-run mode is for building trust in early use. After the first few successful reconciliations, the user typically stops dry-running.

## Fallback — NEEDS_USER_INPUT

When you genuinely cannot disambiguate intent — the conflict has multiple plausible reconciliations and you cannot pick one without guessing the user's preference — apply the **NEEDS_USER_INPUT** fallback rather than picking arbitrarily:

1. Update the stage manifest entry's `status` to `NEEDS_USER_INPUT`.
2. Leave BASE, INCOMING, and LOCAL artifacts in place (do NOT delete the stage).
3. Surface a targeted question to the user that names the file, summarizes the conflict in one sentence, and offers concrete options. Example: "Cannot disambiguate `docs/init/seed.md` Article XI: the baseline's new Article XI heading shares the user's chosen heading text. Should I (a) treat them as the same article and merge bodies, or (b) renumber the user's article to XII?"
4. Exit clean. The user provides direction in their next prompt. A subsequent `/upgrade-project` invocation re-reads the stage manifest, finds the `NEEDS_USER_INPUT` entry, and re-attempts with the user's direction.

Use this fallback sparingly. The rework's whole point is that LLM judgment exceeds `git merge-file` for structural conflicts; if you punt to NEEDS_USER_INPUT for trivial reconciliations, you defeat the purpose.

## Constraints

- **Validate `rel` before writing.** Before writing reconciled bytes to LOCAL, you SHALL verify that the resolved absolute path of `<target>/<rel>` is a descendant of `target`. A `rel` value that escapes the target tree (`../`, absolute path, symlink-resolved escape) SHALL be rejected as a `NEEDS_USER_INPUT` fallback with the reason `path-traversal-rejected`. The CLI's stage writer never produces escaping `rel` values, so this catches only tampered stage manifests from a local attacker with `.claude/state/` write access — defense in depth.
- **No write outside the stage directory and the LOCAL path.** You SHALL NOT touch `.claude/.baseline-prior/`, the installed `.baseline-manifest.json`, or any other CLI state.
- **No partial writes per file.** The reconciled LOCAL must be the complete final content. If you cannot produce a complete reconciliation, use the NEEDS_USER_INPUT fallback and leave LOCAL unmodified.
- **Honor Article XI of CLAUDE.md.** This skill only touches files explicitly staged by the CLI — which, by construction, are baseline-owned. User-added files at colliding paths are never staged.
- **No commits.** Reconciled files land on the working tree; the user inspects via `git diff` and commits when satisfied.
- **No re-fetching from npm.** BASE is already on disk in the stage; no network round-trip needed.

## Output

After running, report per file:

```
# /upgrade-project — <stage_ts>

- <rel>: RECONCILED (N lines changed)
- <rel>: NEEDS_USER_INPUT — <one-sentence question>
- <rel>: SKIPPED (dry-run)

Stage deleted: yes | no (NEEDS_USER_INPUT pending)
```
