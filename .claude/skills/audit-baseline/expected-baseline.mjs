// Single source of truth for the baseline's declared rosters.
//
// These Sets are the *declaration* of what the baseline ships; `deriveCounts()`
// (derive-counts.mjs) reads the actual filesystem. The audit and the governance
// tests cross-check the two: disk must match this declaration, name-for-name.
//
// Adding or removing a hook/agent/command is a ONE-LINE edit here. Every count
// assertion derives from `<roster>.size`, so no test hard-codes a number — they
// re-align from this file. Prose count literals (CLAUDE.md / seed.md / README)
// stay hand-maintained but are audit-checked against the disk-derived count, so
// they transitively track this roster too.

export const EXPECTED_HOOKS = new Set([
  'setup_guard', 'destructive_cmd_guard', 'git_commit_guard', 'env_guard',
  'direction_approval_guard', 'swarm_approval_guard', 'epic_approval_guard', 'verify_pass_guard',
  'track_guard', 'branch_guard', 'artifact_template_guard', 'plantuml_syntax_guard',
  'spec_diagram_presence_guard', 'spec_design_calls_guard',
  'swarm_boundary_guard', 'tdd_order_guard',
  'gitignore_leak_guard',
  'process_lifecycle_guard',
  'lint_runner', 'test_runner', 'phase_timer',
  'memory_session_start', 'memory_stop', 'memory_pre_compact',
  'harness_continuation',
  'consent_gate_grant',
]);

export const EXPECTED_AGENTS = new Set(['swarm-worker']);

export const EXPECTED_COMMANDS = new Set([
  'approve-direction', 'approve-swarm', 'grant-commit', 'grant-push',
  'init-project', 'init-project-doctor',
]);

export const EXPECTED_MEMORY_FILES = new Set([
  'landmarks', 'libraries', 'decisions', 'landmines', 'conventions',
  'pending-questions', 'backlog', '_pending', '_resume', '_thread',
]);

// Canonical memory files = the roster minus the underscore-prefixed session files
// (_pending / _resume / _thread). deriveCounts().memoryFiles counts these.
export const CANONICAL_MEMORY_FILES = new Set(
  [...EXPECTED_MEMORY_FILES].filter((name) => !name.startsWith('_')),
);

// Required MCP servers (hard). context7 is the DEFAULT §2.5 satisfier but is optional/replaceable.
export const EXPECTED_MCP_SERVERS = new Set(['plantuml', 'playwright', 'sprint-channel']);
export const DEFAULT_MCP_SERVERS = new Set(['context7']);

export const EXPECTED_TRACKS = { canonical: 9, subTracks: 2 };
