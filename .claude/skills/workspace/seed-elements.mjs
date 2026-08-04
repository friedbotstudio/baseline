// The corpus seed (spec workspace-corpus-seed, Epic 7 slice E).
//
// Transcribed from the C4 declarations of the four LIVE specs, never from archived
// ones: 618 of the repository's 644 declarations describe superseded designs, and
// importing them would build a model that is mostly wrong about the present.
//
// 26 declared, 17 resolve on disk, 14 addressable. Two groups of declarations name
// units inside a single file, and the corpus addresses by path — so they merge into
// one element whose title names everything it covers (D2, D7). Every anchor here is
// unique, and that is load-bearing: detectConflicts compares an op against the
// PRE-EXISTING corpus and never against its sibling ops, so duplicates would apply
// cleanly once and then reject the whole contribution atomically on every re-apply.
//
// governed_by / rests_on carry only keys proven to resolve (D4). An invented key
// makes resolveRefs refuse the element, which refuses the contribution.

const ZERO_DEPS = 'zero-runtime-dependencies';

export const SEED_OPS = [
  op('branch-guard', 'Branch guard hook', '.claude/hooks/branch_guard.mjs', 'erp-portables'),
  op('lint-runner', 'Lint runner hook', '.claude/hooks/lint_runner.mjs', 'erp-portables'),
  op('test-runner', 'Test runner hook', '.claude/hooks/test_runner.mjs', 'erp-portables'),
  op('hooks-common-lib', 'Shared hook library — branch and consent predicates', '.claude/hooks/lib/common.mjs', 'erp-portables'),
  op('workflow-track-schema', 'Workflow track JSON schema', '.claude/schemas/workflow-track.v1.json', 'erp-portables'),
  op('track-tasklist-materializer', 'Track to TaskList materializer', '.claude/skills/triage/track-tasklist-materializer.js', 'erp-portables'),
  op('workflows-validators', 'Workflow track invariant and predicate validators', '.claude/skills/triage/workflows-validator-*.js', 'erp-portables'),

  // MERGED: the spec declares a phase trigger and a path trigger; both live in this
  // one hook, and the corpus can only point at the file.
  op('surfacing-triggers', 'Memory surfacing triggers — phase-scoped and path-governed', '.claude/hooks/process_lifecycle_guard.mjs', 'living-system-model', {
    governed_by: 'decay-is-per-category-three-reasons-2026-08-04',
  }),
  op('governed-memory', 'Path-keyed surfacing over governs: anchors', '.claude/hooks/lib/governed-memory.mjs', 'living-system-model'),
  op('scoped-memory', 'Phase-scoped fact surfacing', '.claude/hooks/lib/scoped-memory.mjs', 'living-system-model'),
  op('memory-index-resolve', 'Derived reverse index, rebuilt on read', '.claude/skills/memory-index/resolve.mjs', 'living-system-model', {
    governed_by: 'decay-is-per-category-three-reasons-2026-08-04',
  }),
  // MERGED: the spec declares three CI jobs; all three live in one workflow file.
  op('release-workflow', 'Release CI — pre-publish-checks, release, deploy-pages', '.github/workflows/release.yml', 'release-workflow'),

  op('sprint-channel-server', 'Sprint channel MCP server — tool registry, locks, mailbox', '.claude/mcp/sprint-channel/server.mjs', 'mvp-sprint-parallel-cycles'),
  op('sprint-channel-handlers', 'Sprint channel handlers — dependency tracking, yield relay', '.claude/mcp/sprint-channel/handlers.mjs', 'mvp-sprint-parallel-cycles'),
];

function op(id, title, anchor, sourceSpec, extra = {}) {
  return {
    verb: 'add',
    target_id: id,
    fields: { kind: 'component', title, anchor, source_spec: sourceSpec, rests_on: ZERO_DEPS, ...extra },
  };
}
