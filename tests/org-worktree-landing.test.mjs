// Epic 13 (baseline-mcp) Slice E — org peers work in isolation, and exactly one
// landing brings their work back.
//
// Covers AC-021 through AC-027 of docs/specs/baseline-mcp.md.
//
// Two peers editing one checkout is the failure this slice removes. Without a
// worktree each peer sees the other's half-finished edits as its own working
// tree, and the first commit carries both. So isolation is a gate, not a
// convenience: when a worktree cannot be created the dispatch refuses and says
// why, rather than quietly running everyone in the primary tree.
//
// Coming back is the other half. A peer may only change what its lane declared,
// and the audit that enforces that already exists inside the swarm merge tool —
// it just was not reachable from anywhere else. Extracting it means org mode and
// swarm mode audit by one rule instead of two that drift.
//
// Real git throughout. The thing under test is what git actually does to a
// second working tree, so a stubbed git would test the stub.
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { createPeerWorktree, removePeerWorktree, peerWorktreePath } =
  await import('../.claude/skills/org-dispatch/worktree.mjs');
const { auditChangedPaths } = await import('../.claude/skills/swarm-dispatch/swarm_merge.mjs');
const { CLOSED_STATUSES, isClosed } = await import('../.claude/skills/commit/epic_close.mjs');

const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

function makeRepo() {
  // realpath because macOS hands out /var, and git reports /private/var back.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'org-wt-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'T');
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  git(dir, 'add', 'seed.txt');
  git(dir, 'commit', '-q', '-m', 'seed');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// --- AC-021: isolation, or a named refusal ----------------------------------

describe('AC-021 — every peer works its own tree', () => {
  it('test_when_a_peer_starts_then_it_gets_its_own_worktree_on_its_own_branch', () => {
    const repo = makeRepo();
    try {
      const r = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      assert.equal(r.ok, true, r.reason);
      assert.ok(existsSync(r.path), 'the worktree directory exists');
      assert.notEqual(realpathSync(r.path), repo.dir, 'a peer never works the primary tree');

      const branch = git(r.path, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
      assert.equal(branch, r.branch);
      assert.notEqual(branch, 'main', 'a peer never shares the primary branch');
    } finally { repo.cleanup(); }
  });

  it('test_when_two_peers_start_then_neither_sees_the_others_edits', () => {
    // This is the whole reason for the slice. Two peers in one checkout would
    // each pick up the other's half-written file as their own working tree.
    const repo = makeRepo();
    try {
      const a = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      const b = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-2' });
      assert.equal(a.ok && b.ok, true);

      writeFileSync(join(a.path, 'lane-a.txt'), 'a\n');
      assert.equal(existsSync(join(b.path, 'lane-a.txt')), false, "peer-2 must not see peer-1's file");
      assert.equal(existsSync(join(repo.dir, 'lane-a.txt')), false, 'nor may the primary tree');
    } finally { repo.cleanup(); }
  });

  it('test_when_isolation_cannot_be_established_then_the_gate_refuses_with_a_named_reason', () => {
    // AC-021's second half. Falling back to the shared tree is the outcome the
    // gate exists to prevent, so an unusable root has to stop the dispatch.
    const notARepo = realpathSync(mkdtempSync(join(tmpdir(), 'org-nogit-')));
    try {
      const r = createPeerWorktree({ rootDir: notARepo, peer_id: 'peer-1' });
      assert.equal(r.ok, false);
      assert.match(r.reason, /git/i, 'the refusal names why isolation failed');
      assert.equal(r.path, null, 'a refused gate hands back no path to work in');
    } finally { rmSync(notARepo, { recursive: true, force: true }); }
  });

  it('test_when_a_peer_id_is_unsafe_then_no_path_is_built_from_it', () => {
    const repo = makeRepo();
    try {
      for (const bad of ['../escape', 'a/b', '', null]) {
        const r = createPeerWorktree({ rootDir: repo.dir, peer_id: bad });
        assert.equal(r.ok, false, `${JSON.stringify(bad)} must be refused`);
        assert.match(r.reason, /peer_id/i);
      }
    } finally { repo.cleanup(); }
  });

  it('test_when_the_same_peer_starts_twice_then_it_returns_the_tree_it_already_has', () => {
    const repo = makeRepo();
    try {
      const first = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      const again = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      assert.equal(again.ok, true, again.reason);
      assert.equal(again.path, first.path);
      assert.equal(again.reused, true);
    } finally { repo.cleanup(); }
  });
});

// --- AC-022 / AC-023: the audit decides whether anything lands ---------------

describe('AC-022, AC-023 — the merge audit', () => {
  it('test_when_a_peer_writes_outside_its_write_set_then_the_audit_reports_it', () => {
    // AC-022.
    const r = auditChangedPaths({ changed: ['a.mjs', 'secrets.env'], writeSet: ['a.mjs'] });
    assert.equal(r.ok, false);
    assert.deepEqual(r.violations, ['secrets.env']);
  });

  it('test_when_every_changed_path_was_declared_then_the_audit_passes', () => {
    const r = auditChangedPaths({ changed: ['a.mjs', 'b.mjs'], writeSet: ['b.mjs', 'a.mjs'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.violations, []);
  });

  it('test_when_the_write_set_is_empty_then_the_audit_refuses_rather_than_passing_vacuously', () => {
    // An empty declaration means the lane declared nothing, not that it may
    // change anything. Passing here would turn a missing field into a free pass.
    const r = auditChangedPaths({ changed: ['a.mjs'], writeSet: [] });
    assert.equal(r.ok, false);
    assert.match(String(r.reason), /write_set/i);
  });

  it('test_when_nothing_changed_then_the_audit_passes_with_no_violations', () => {
    const r = auditChangedPaths({ changed: [], writeSet: ['a.mjs'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.violations, []);
  });

  it('test_when_the_audit_module_is_imported_then_it_does_not_run_its_cli', () => {
    // Extracting the rule is worthless if importing it exits the process. The
    // import at the top of this file is itself the proof, so this test states it.
    assert.equal(typeof auditChangedPaths, 'function');
    const src = readFileSync(join(ROOT, '.claude/skills/swarm-dispatch/swarm_merge.mjs'), 'utf8');
    assert.match(src, /import\.meta\.url/, 'the CLI entry point must be guarded');
  });

  it('test_when_a_violation_is_found_then_the_worktree_survives_for_inspection', () => {
    // AC-022's second half: a rejected lane's work must still be reachable.
    const repo = makeRepo();
    try {
      const wt = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      writeFileSync(join(wt.path, 'stray.txt'), 'x\n');
      const verdict = auditChangedPaths({ changed: ['stray.txt'], writeSet: ['declared.txt'] });
      assert.equal(verdict.ok, false);
      assert.ok(existsSync(wt.path), 'nothing removes a worktree the audit rejected');
      assert.ok(existsSync(join(wt.path, 'stray.txt')), 'and the offending work is still there to read');
    } finally { repo.cleanup(); }
  });

  it('test_when_the_worktree_is_removed_then_the_primary_tree_keeps_the_landed_work', () => {
    // AC-023. Removal is the last step, and it must not take the diff with it.
    const repo = makeRepo();
    try {
      const wt = createPeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      writeFileSync(join(wt.path, 'landed.txt'), 'landed\n');
      writeFileSync(join(repo.dir, 'landed.txt'), 'landed\n');

      const gone = removePeerWorktree({ rootDir: repo.dir, peer_id: 'peer-1' });
      assert.equal(gone.ok, true, gone.reason);
      assert.equal(existsSync(wt.path), false, 'the worktree is gone');
      assert.equal(readFileSync(join(repo.dir, 'landed.txt'), 'utf8'), 'landed\n');
    } finally { repo.cleanup(); }
  });

  it('test_when_a_worktree_that_never_existed_is_removed_then_it_reports_rather_than_throws', () => {
    const repo = makeRepo();
    try {
      const r = removePeerWorktree({ rootDir: repo.dir, peer_id: 'never-started' });
      assert.equal(r.ok, true, 'removing nothing is not an error');
      assert.equal(r.removed, false);
    } finally { repo.cleanup(); }
  });
});

// --- AC-024: one integrate, one gate C --------------------------------------

test('test_when_the_org_track_is_read_then_it_lands_once_under_one_gate', () => {
  // AC-024. Two integrate nodes would mean the pod's work is verified twice and
  // committed twice, which is the multi-landing this slice rules out.
  const tracks = readFileSync(join(ROOT, '.claude/workflows.jsonl'), 'utf8')
    .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const org = tracks.find((t) => t.track_id === 'org');
  assert.ok(org, 'the org track must exist');

  const phases = org.nodes.map((n) => n.metadata && n.metadata.phase);
  for (const phase of ['integrate', 'grant-commit', 'org-dispatch']) {
    assert.equal(phases.filter((p) => p === phase).length, 1, `exactly one ${phase} node`);
  }
  assert.ok(
    phases.indexOf('org-dispatch') < phases.indexOf('integrate'),
    'the pod finishes before the single integrate runs',
  );
  assert.ok(phases.indexOf('integrate') < phases.indexOf('grant-commit'), 'and gate C comes last');
});

// --- AC-025: an epic closes on superseded as well as committed --------------

describe('AC-025 — closed means finished, not only committed', () => {
  it('test_when_a_slice_is_superseded_then_it_counts_as_closed', () => {
    assert.ok(CLOSED_STATUSES.includes('committed'));
    assert.ok(CLOSED_STATUSES.includes('superseded'), 'superseded work is finished work');
    assert.equal(isClosed('committed'), true);
    assert.equal(isClosed('superseded'), true);
  });

  it('test_when_a_slice_is_genuinely_open_then_it_does_not_count_as_closed', () => {
    for (const status of ['open', 'in-progress', 'blocked', '', undefined, null]) {
      assert.equal(isClosed(status), false, `${String(status)} is not closed`);
    }
  });
});

// --- AC-026: Epic 11 has nothing left open ----------------------------------

test('test_when_the_roadmap_is_read_then_epic_11_row_d_is_superseded_by_this_epic', () => {
  // AC-026. Row D is the merge-and-land slot; this epic delivers it, so the row
  // closes here rather than sitting open forever behind work that already exists.
  const plan = readFileSync(join(ROOT, 'docs/roadmap-execution-plan.md'), 'utf8');
  const start = plan.indexOf('## Epic 11 —');
  assert.ok(start >= 0, 'Epic 11 must be in the plan');
  const after = plan.indexOf('\n## ', start + 1);
  const section = plan.slice(start, after === -1 ? undefined : after);

  const rowD = section.split('\n').find((l) => /^-\s*\S+\s*D\./.test(l));
  assert.ok(rowD, 'Epic 11 must still carry a row D');
  assert.match(rowD, /SUPERSEDED/, 'row D reads superseded');
  assert.match(rowD, /baseline-mcp/, 'and names what superseded it');
  assert.ok(rowD.split('—').length > 1 || /:/.test(rowD), 'with its reason, not a bare label');

  const open = section.split('\n').filter((l) => /^-\s*(⬜|🟡)/.test(l));
  assert.deepEqual(open, [], 'Epic 11 has no open rows left');
});

test('test_when_the_epic_state_is_read_then_no_slice_is_still_open', () => {
  const state = JSON.parse(readFileSync(join(ROOT, '.claude/state/epic/mvp-sprint-parallel-cycles.json'), 'utf8'));
  const open = (state.children || []).filter((c) => !CLOSED_STATUSES.includes(c.status));
  assert.deepEqual(open.map((c) => c.slice), [], 'every registered child is closed');
});

// --- AC-027: org mode ships off ---------------------------------------------

test('test_when_project_config_is_read_then_org_mode_is_off', () => {
  // AC-027. Org mode opens four sessions against one repository. Landing this
  // epic with the flag left on would start that for anyone who pulls.
  const project = JSON.parse(readFileSync(join(ROOT, '.claude/project.json'), 'utf8'));
  assert.equal(project.velocity.org_mode.enabled, false, 'org mode ships off');
});

test('test_when_a_fixture_flips_org_mode_on_then_it_flips_it_back', () => {
  // AC-027's second half, checked by reading the tests rather than trusting them:
  // a fixture that writes the live config and leaves is how the flag gets stuck on.
  const suspects = spawnSync('git', ['grep', '-l', 'org_mode', '--', 'tests/'], { cwd: ROOT, encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean);
  for (const rel of suspects) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    if (!/\.claude\/project\.json/.test(src)) continue;
    assert.ok(
      /finally|after\(|afterEach\(|restore/i.test(src),
      `${rel} writes the live project config and must restore it`,
    );
  }
});
