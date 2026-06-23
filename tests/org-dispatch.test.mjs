import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

// org-team-charter — the org-dispatch skill's decision helpers (AC-002, AC-003, AC-006).
// org-dispatch graduates sprint-dispatch: the gate (org_mode + git), spec→lane
// decomposition, and the in-lane-decide vs escalate classifier. Modules under test do
// not exist yet — dynamic import fails RED until /implement creates them. No mocks
// (Art VI.3): real project.json shapes + real helper logic.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = () => import(new URL('../.claude/skills/org-dispatch/org-mode.mjs', import.meta.url));

test('test_when_org_mode_off_then_gate_refuses_with_named_reason', async () => {
  const { orgDispatchGate } = await mod();
  const res = orgDispatchGate({ project: { velocity: { org_mode: { enabled: false } } }, isGitRepo: true });
  assert.equal(res.ok, false, 'gate refuses when org mode is off');
  assert.match(res.reason, /org.?mode|disabled|off/i, 'refusal names the disabled-flag reason');
});

test('test_when_non_git_then_gate_refuses_with_named_reason', async () => {
  const { orgDispatchGate } = await mod();
  const res = orgDispatchGate({ project: { velocity: { org_mode: { enabled: true } } }, isGitRepo: false });
  assert.equal(res.ok, false, 'gate refuses on a non-git tree (worktree isolation requires git)');
  assert.match(res.reason, /git/i, 'refusal names the git requirement');
});

test('test_when_org_mode_on_and_git_then_gate_allows', async () => {
  const { orgDispatchGate } = await mod();
  const res = orgDispatchGate({ project: { velocity: { org_mode: { enabled: true } } }, isGitRepo: true });
  assert.equal(res.ok, true, 'gate allows when org mode is enabled on a git repo');
});

test('test_when_isOrgModeEnabled_reads_flag_then_defaults_off', async () => {
  const { isOrgModeEnabled } = await mod();
  assert.equal(isOrgModeEnabled({}), false, 'absent flag defaults to off (opt-in)');
  assert.equal(isOrgModeEnabled({ velocity: { org_mode: { enabled: true } } }), true, 'explicit true enables');
});

test('test_when_decompose_then_tasks_are_lane_tagged_and_claim_any_ready', async () => {
  const { toLaneTasks } = await mod();
  const lanes = [
    { id: 'L1', lane: 'channel', write_set: ['.claude/mcp/sprint-broker/**'], depends_on: [] },
    { id: 'L2', lane: 'constitution', write_set: ['CLAUDE.md'], depends_on: [] },
    { id: 'L3', lane: 'skill', write_set: ['.claude/skills/org-dispatch/**'], depends_on: ['L1'] },
  ];
  const tasks = toLaneTasks(lanes);
  assert.equal(tasks.length, 3, 'every lane becomes a task');
  assert.ok(tasks.every((t) => typeof t.lane === 'string' && t.lane.length > 0), 'every task carries a lane tag');
  assert.ok(tasks.every((t) => Array.isArray(t.write_set) && Array.isArray(t.depends_on)), 'tasks carry write_set + depends_on for claim-any dispatch');
  assert.deepEqual(tasks.find((t) => t.id === 'L3').depends_on, ['L1'], 'dependency edges preserved');
});

test('test_when_classify_in_lane_implementation_fork_then_decide', async () => {
  const { classifyFork } = await mod();
  assert.equal(classifyFork({ scope: 'in-lane-impl' }), 'decide', 'an in-lane implementation choice is decided by the peer (the key relaxation)');
});

test('test_when_classify_cross_lane_or_undecidable_fork_then_escalate', async () => {
  const { classifyFork } = await mod();
  assert.equal(classifyFork({ scope: 'cross-lane' }), 'escalate', 'a cross-lane fork escalates, not decided locally');
  assert.equal(classifyFork({ scope: 'undecidable' }), 'escalate', 'an un-decidable design/scope fork escalates');
});

test('test_when_org_dispatch_skill_present_then_sprint_dispatch_retired', () => {
  // D2: org-dispatch graduates and retires sprint-dispatch. RED until the skill dir is
  // created and the prototype removed.
  assert.equal(existsSync(join(ROOT, '.claude/skills/org-dispatch/SKILL.md')), true, 'org-dispatch skill exists');
  assert.equal(existsSync(join(ROOT, '.claude/skills/sprint-dispatch')), false, 'sprint-dispatch prototype is retired');
});
