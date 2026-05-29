---
name: spec-shippability-review
description: Dev-only check that a drafted spec for THIS baseline repo won't ship dev-tree references to consumer installs. Catches three failure modes — shipped SKILL.md prose that references paths under `src/`, `tests/`, `scripts/`, `obj/` as runtime invocations (in ```bash fences``` OR `inline backticks`, plus shipped `.mjs`/`.js`/`.sh`/`.py` helper-file imports); new Python helpers added under `.claude/skills/<slug>/` (shipped helpers must be `.sh` or `.mjs`/`.js` going forward); and imports of modules that aren't in `obj/template/.claude/manifest.json` (consumer won't have the file). The aggregate scanner (`scan-shipped-skills.mjs`) walks only baseline-owned skill dirs (via `owner: baseline` frontmatter) at top level — `references/` and other subdirs are documentation, not runtime. BLOCKER findings hard-block `/approve-spec`; ADVISORY surfaces but doesn't block. Read-only — surfaces a punch list; maintainer edits the spec and re-runs until CLEAN.
---

<!-- DEV-ONLY SKILL — this file lives in `.claude/skills/spec-shippability-review/`
     of the baseline repository for the maintainer's own workflow. It is excluded
     from the shipped template by `scripts/build-template.sh` Stage 1.5 (no
     `owner: baseline` frontmatter → pruned from `obj/template/`). End-user
     projects never see this skill. -->

# /spec-shippability-review — catch dev-tree references that would break in consumer installs

You are running a consumer-install lens over a drafted spec for THIS baseline repo (`@friedbotstudio/create-baseline`). The bug this skill catches is the v0.8.1 marker-import: a SKILL.md procedure said `node -e "import('./src/cli/reconciliation-marker.js')..."` and shipped to npm. Consumer installs don't receive `src/`, so every `/upgrade-project` run errored with `ERR_MODULE_NOT_FOUND` on the marker write. The existing spec validators (`spec-lint`, `spec-diagram-review`, `spec-traceability-review`) didn't catch it because none of them know what lands in a consumer install.

This skill is **dev-only** — it lives in the baseline dev tree and is pruned from `obj/template/` by `scripts/build-template.sh` Stage 1.5 (no `owner: baseline` frontmatter). Consumer projects don't receive it and don't need it: the "dev spills to prod" failure mode is unique to meta-tools that ship their own code.

## When to use

- The harness runs this as a workflow phase between `/spec` and `/approve-spec` (the node is wired into `intake-full` and `spec-entry` tracks in `.claude/workflows.jsonl`; `tdd-quickfix` and `chore` skip it because they have no spec phase).
- Ad-hoc: `/spec-shippability-review <slug>` when iterating on a spec draft.
- `scripts/build-template.sh` invokes the aggregate `scan-shipped-skills.mjs` entry point at Stage 1.6 (after Stage 1.5 prunes dev-only skills, before Stage 3 stamps the manifest). This re-validates the actual shipped `SKILL.md` content at every build so a baseline-owned skill that references dev-tree paths or unshipped modules cannot reach npm — even if it slipped past the per-spec check earlier.

## Prereq

`docs/specs/<slug>.md` exists. The spec must have a `## Design` section, a write_set described in the Test plan or Contracts, and any SKILL.md prose it proposes to add or modify embedded as code fences.

## Procedure

1. **Run the analyzer.** Invoke the JS helper:
   ```
   node .claude/skills/spec-shippability-review/check.mjs <slug>
   ```
   The helper reads the spec, extracts write_set + SKILL.md code fences + path mentions, runs the three checks below, writes a punch list to `.claude/state/spec-shippability/<slug>.json`, and exits:
   - `0` — CLEAN (zero findings)
   - `1` — NEEDS_REVIEW (one or more ADVISORY findings, no BLOCKER)
   - `2` — BLOCKED (one or more BLOCKER findings)

2. **Surface the punch list** to the user verbatim. The helper prints to stdout in a human-readable format (file:line citations + suggested fix per finding). The same content is in the JSON state file for `spec_approval_guard` to consume.

3. **Verdict-based next-action**:
   - **CLEAN** → tell the user: "Shippability review CLEAN. Run `/approve-spec docs/specs/<slug>.md` when ready."
   - **NEEDS_REVIEW** → tell the user: "N ADVISORY finding(s). Review and address or accept; ADVISORY does not block `/approve-spec`. Re-run `/spec-shippability-review <slug>` after edits to confirm."
   - **BLOCKED** → tell the user: "N BLOCKER finding(s). `/approve-spec` will be refused by `spec_approval_guard` until these are fixed. Edit the spec and re-run."

## The three checks

### C1 — DEV_TREE_RUNTIME_REF (BLOCKER)

Scan code fences within SKILL.md content blocks that the spec proposes to add or modify. Flag any runtime invocation that references a path under a dev-only prefix:

| Prefix | Why dev-only |
|---|---|
| `src/` | CLI source code; not in shipped manifest |
| `tests/` | test files; not shipped |
| `scripts/` | build scripts; not shipped |
| `obj/` | build output; not shipped |
| `docs/` (except `docs/init/seed.md`) | development documentation; consumer gets only seed.md |

Runtime invocation = command-line patterns inside ` ```bash` / ` ```sh` / ` ```shell` fences that would execute against the consumer's filesystem: `node ./path/...`, `node -e "import('./path/...')"`, `python3 ./path/...`, `bash ./path/...`, `<exec>` referencing a relative path.

Suggested fix in the punch list: "Move the logic into a shipped helper under `.claude/skills/<slug>/<helper>.mjs`, OR inline the implementation into the `node -e \"...\"` command body."

### C2 — DEV_HELPER_EXTENSION (BLOCKER for new `.py`, ADVISORY for modifications)

Scan the spec's write_set for paths under `.claude/skills/<slug>/`. For each path with a `.py` extension:

- If the path does NOT exist on disk yet → **BLOCKER** (new Python helper in shipped skill). Suggested fix: rewrite as `.mjs` (Node ESM, stdlib only, no third-party deps for parity with the existing JS-side baseline).
- If the path DOES exist on disk → **ADVISORY** (modification to grandfathered Python helper). The grandfathering carve-out exists for legacy `.py` helpers; the previous grandfathered set (`sweep.py` and `drift_check.py`) has been ported to `.mjs` and no grandfathered files remain on disk today. The branch still fires only if a previously-shipped `.py` is re-introduced — recommend porting to JS in the same workflow.

### C3 — UNSHIPPED_MODULE_IMPORT (BLOCKER)

For every relative import / require / node invocation found in C1's scan that has a sub-`.claude/` path (e.g., `.claude/skills/foo/helper.mjs`, `.claude/scripts/something.js`), resolve it against the shipped manifest at `obj/template/.claude/manifest.json → files`. If the resolved path is NOT a key in the manifest's `files` map, the consumer won't have that file at install time.

Suggested fix in the punch list: "Add the file to a baseline-owned skill directory so the recursive cp copies it into `obj/template/`, OR change the invocation to use a file that IS shipped."

Note: C3 is a stricter superset of C1. C1 catches the obvious `src/...` case; C3 catches the subtler case of a `.claude/`-prefixed path that exists in the dev tree but isn't shipped (e.g., a helper in a skill that lacks `owner: baseline`).

## Punch-list shape (the contract `spec_approval_guard` reads)

`.claude/state/spec-shippability/<slug>.json`:

```json
{
  "slug": "<workflow slug>",
  "spec_path": "docs/specs/<slug>.md",
  "verdict": "CLEAN" | "NEEDS_REVIEW" | "BLOCKED",
  "generated_at": "<ISO-8601 UTC>",
  "findings": [
    {
      "severity": "BLOCKER" | "ADVISORY",
      "check": "DEV_TREE_RUNTIME_REF" | "DEV_HELPER_EXTENSION" | "UNSHIPPED_MODULE_IMPORT",
      "file": "<path within the repo, e.g. docs/specs/<slug>.md or the SKILL.md the spec proposes to modify>",
      "line": <integer or null>,
      "evidence": "<short snippet that triggered the finding>",
      "message": "<one-line description of why this fails the consumer-install lens>",
      "suggested_fix": "<concrete fix the maintainer can apply>"
    }
  ]
}
```

`spec_approval_guard.sh` reads `verdict`. If `BLOCKED`, it denies the approval-token write with an error message that includes the count of findings and the first three messages.

## Constraints

- **Read-only.** This skill does NOT modify the spec. The maintainer edits and re-runs.
- **Dev-only.** No `owner: baseline` frontmatter — pruned from shipped template. Consumer projects don't run this check and don't need it.
- **JS-only helper.** `check.mjs` is Node ESM, stdlib only. Eats its own dogfood per C2 (no new Python in shipped helpers).
- **Idempotent.** Re-running on an unchanged spec produces the same punch list.
- **Workflow integration.** When invoked as a workflow phase by the harness, success (exit 0 or 1) appends `"spec-shippability-review"` to `workflow.json → completed` and continues; failure (exit 2 = BLOCKED) yields with the punch list as the reason.
