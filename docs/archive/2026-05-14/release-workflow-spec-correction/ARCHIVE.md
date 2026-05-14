# release-workflow-spec-correction — archive bundle

**Date:** 2026-05-14
**Parent workflow:** [`release-workflow`](../../2026-05-13/release-workflow/) (2026-05-13)
**Trigger event:** Release workflow run [25821931162](https://github.com/friedbotstudio/baseline/actions/runs/25821931162) — first `docs-only` dispatch, failed at `build-verify` step 3 with "Caching for 'false' is not supported" (fatal in `actions/setup-node@v4.x`), then `deploy-pages` ran anyway and failed with "No artifacts named 'github-pages' were found for this workflow run".

## What was corrected

Three ACs in `docs/specs/release-workflow.md` codified bugs that the first production dispatch exposed:

| AC | Was | Now |
|---|---|---|
| **AC-006** | "every `setup-*` action that supports caching has `cache: false` set explicitly" | "every `setup-*` action that supports caching MUST NOT declare a `cache:` key (the action rejects `cache: false` with 'Caching for false is not supported'; omitting the key is the canonical way to disable caching)" |
| **AC-011** | deploy-pages `needs: publish-npm` | deploy-pages `needs: [build-verify, publish-npm]` (the `build-verify` edge is the artifact-producer dependency the original spec missed) |
| **AC-013** | deploy-pages `if: always() && (needs.publish-npm.result == 'success' \|\| needs.publish-npm.result == 'skipped')` | deploy-pages `if: always() && needs.build-verify.result == 'success' && (needs.publish-npm.result == 'success' \|\| needs.publish-npm.result == 'skipped')` |

Sites updated alongside the AC table:

- §Design — C4 Component for `deploy_pages` (added the second `needs:` element).
- §Design — `Rel(build_verify, deploy_pages, "needs: (artifact dep)")` added to the dependency graph.
- §Behavior #1, #2, #6 — sequence-diagram parentheticals dropped `cache: false`.
- §Behavior #3 — deploy-pages sequence updated to show the new needs set.
- §Behavior test diagram — assertion text flipped from "cache: false present" to "cache: key absent".
- §Libraries — `actions/setup-node` row dropped `cache: false` from configuration column with inline rationale.
- §Test plan — "Contract violation" and "Concurrency / ordering" rows updated to match.

The `## Goal` section gained a **Correction (added 2026-05-14)** subsection summarizing the three defects and linking to pending-questions Q-002 (silent-failure prerequisites need enforcement ACs).

## What was NOT relocated

This is a correction workflow operating on the parent's spec doc. No new intake / scout / research / spec.md / security.md / swarm.json was produced (those phases were excepted at triage time because the parent workflow already satisfied them). The corrected spec doc itself stays at `docs/specs/release-workflow.md` — it is still the live spec for the release pipeline. The parent's full bundle remains at [`docs/archive/2026-05-13/release-workflow/`](../../2026-05-13/release-workflow/).

## Workflow shape

- **Slug:** `release-workflow-spec-correction`
- **Entry phase:** `spec`
- **Active phases:** spec → approve-spec → simplify → integrate → archive → grant-commit → commit
- **Exceptions:** intake, scout, research, tdd, security, document, swarm-plan, approve-swarm, swarm-dispatch
- **Approval token:** `.claude/state/spec_approvals/release-workflow.approval` (keyed by the spec filename slug, **not** the workflow slug; see harness log for the slug-mapping caveat noted on resume)

See `harness.log` (this directory) for per-phase timestamps.

## Companion artifacts (live, not archived)

- The corrected impl + tests committed together with this archive in the same commit:
  - `.github/workflows/release.yml`
  - `tests/release-workflow.test.mjs`
  - `docs/specs/release-workflow.md`
- The post-correction Release run that validates the fix end-to-end will be linked from the commit message once it succeeds.
- Pending-questions **Q-002** captures the meta-finding: when scout/research/spec correctly identify a one-time human prerequisite that can fail silently or with a misleading error, the spec should require an enforceable runtime check (preflight/smoke/error-mapping AC) rather than parking it in the Rollout section.
