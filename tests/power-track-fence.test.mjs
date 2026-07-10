// power/org track fence — Domain + Orchestration layers.
//
// Asserts that the `power` and `org` tracks declare `requires_config_flag` against their
// velocity flags, that the live workflows.jsonl still validates end-to-end, and that an
// unregistered predicate name is rejected by invariant I11 with the offending track named.
//
// AC-008 (the four canonical tracks' TaskLists stay byte-unchanged) is deliberately NOT
// re-tested here: tests/byte-equivalent-migration.test.mjs already defends it against
// tests/fixtures/golden-tasklists/*.golden.json. Duplicating it would be redundant.
//
// Validators are imported from `src/cli/` (canonical). The `.claude/skills/triage/` copies
// are build-time mirrors; tests/vendored-mirror-bytes.test.mjs enforces their byte-equality.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const LIVE_JSONL = path.join(REPO_ROOT, '.claude/workflows.jsonl');

let validator;
try {
  validator = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator.js'));
} catch (err) {
  throw new Error(
    `Cannot import src/cli/workflows-validator.js (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

const tempDirs = [];
after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function readLiveTracks() {
  const text = await readFile(LIVE_JSONL, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function findTrack(tracks, trackId) {
  const track = tracks.find((t) => t.track_id === trackId);
  assert.ok(track, `workflows.jsonl is missing track_id=${trackId}`);
  return track;
}

function configFlagPrecondition(track) {
  return (track.preconditions || []).find((p) => p.name === 'requires_config_flag');
}

describe('power/org tracks declare the config-flag fence', () => {
  // AC-002, AC-003
  it('test_when_power_track_read_then_it_declares_requires_config_flag_on_power_mode', async () => {
    const power = findTrack(await readLiveTracks(), 'power');
    const names = (power.preconditions || []).map((p) => p.name);
    assert.ok(names.includes('requires_git'), 'power must keep its requires_git precondition');

    const fence = configFlagPrecondition(power);
    assert.ok(fence, 'power must declare a requires_config_flag precondition');
    assert.equal(fence.path, 'velocity.power_mode.enabled');
    assert.equal(fence.equals, true);
  });

  // AC-001 — the second consumer proves the predicate is not power-specific
  it('test_when_org_track_read_then_it_declares_requires_config_flag_on_org_mode', async () => {
    const org = findTrack(await readLiveTracks(), 'org');
    const fence = configFlagPrecondition(org);
    assert.ok(fence, 'org must declare a requires_config_flag precondition (second consumer)');
    assert.equal(fence.path, 'velocity.org_mode.enabled');
    assert.equal(fence.equals, true);
  });
});

describe('the live workflows.jsonl validates with the new predicate', () => {
  // AC-001
  it('test_when_live_workflows_jsonl_validated_then_ok_is_true', async () => {
    const result = await validator.validateWorkflowsJsonl(LIVE_JSONL);
    assert.equal(
      result.ok,
      true,
      `live workflows.jsonl failed validation: ${JSON.stringify(result.errors)}`
    );
  });

  // AC-001
  it('test_when_seed_tasklist_validate_only_runs_then_it_exits_zero', () => {
    const helper = path.join(REPO_ROOT, '.claude/skills/triage/seed-tasklist.mjs');
    const result = spawnSync('node', [helper, '--validate-only'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  });
});

describe('the baseline audit stays green after the fence lands', () => {
  // AC-009 — the drift oracle and CI both gate on this; assert it directly rather
  // than trusting that `integrate` will notice.
  it('test_when_audit_baseline_runs_then_it_exits_zero', () => {
    const audit = path.join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');
    const result = spawnSync('node', [audit], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(
      result.status,
      0,
      `audit-baseline must exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  });
});

describe('invariant I11 rejects unresolvable predicates', () => {
  // AC-001
  it('test_when_predicate_name_misspelled_then_i11_fails_naming_the_track', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'power-fence-'));
    tempDirs.push(dir);

    const offender = {
      $schema: './schemas/workflow-track.v1.json',
      track_id: 'misspelled-fence',
      name: 'Misspelled fence',
      description: 'fixture',
      selectable: true,
      selector_hints: [],
      preconditions: [
        { name: 'requires_config_flags', path: 'velocity.power_mode.enabled', equals: true },
      ],
      invariants: ['commits'],
      nodes: [
        {
          id: 'chore',
          type: 'task',
          skill: 'chore',
          depends_on: [],
          blocks: [],
          can_parallel: false,
          needs_user: false,
          activeForm: 'Stub',
          metadata: { phase: 'chore' },
        },
      ],
    };

    const fixture = path.join(dir, 'workflows.jsonl');
    await writeFile(fixture, `${JSON.stringify(offender)}\n`, 'utf8');

    const result = await validator.validateWorkflowsJsonl(fixture);
    assert.equal(result.ok, false, 'a misspelled predicate name must fail validation');

    const messages = result.errors.map((e) => `${e.kind ?? ''} ${e.track_id ?? ''} ${e.message ?? ''}`).join('\n');
    assert.match(messages, /misspelled-fence/, 'the error must name the offending track');
    assert.match(messages, /requires_config_flags/, 'the error must name the unknown predicate');
  });

  // Regression trap for the I11 -> validatePredicateParams wiring. The params check is
  // unit-tested in isolation elsewhere; without this test, deleting the
  // `validatePredicateParams(pred)` call from checkI11_predicateNamesResolve would leave
  // the whole suite green. Assert on the invariant_i11 error specifically: a minimal
  // fixture also trips I6/I8, which would otherwise mask a removed param check.
  // AC-001
  it('test_when_config_flag_declaration_omits_equals_then_i11_rejects_it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'power-fence-'));
    tempDirs.push(dir);

    const offender = {
      $schema: './schemas/workflow-track.v1.json',
      track_id: 'malformed-fence',
      name: 'Malformed fence',
      description: 'fixture',
      selectable: true,
      selector_hints: [],
      preconditions: [
        { name: 'requires_config_flag', path: 'velocity.power_mode.enabled' },
      ],
      invariants: ['commits'],
      nodes: [
        {
          id: 'chore',
          type: 'task',
          skill: 'chore',
          depends_on: [],
          blocks: [],
          can_parallel: false,
          needs_user: false,
          activeForm: 'Stub',
          metadata: { phase: 'chore' },
        },
      ],
    };

    const fixture = path.join(dir, 'workflows.jsonl');
    await writeFile(fixture, `${JSON.stringify(offender)}\n`, 'utf8');

    const result = await validator.validateWorkflowsJsonl(fixture);
    assert.equal(result.ok, false, "a requires_config_flag without 'equals' must fail validation");

    const i11 = result.errors.filter((e) => e.kind === 'invariant_i11');
    assert.equal(i11.length, 1, `expected exactly one invariant_i11 error, got ${JSON.stringify(result.errors)}`);
    assert.match(i11[0].message, /malformed-fence/, 'the I11 error must name the offending track');
    assert.match(i11[0].message, /requires_config_flag/, 'the I11 error must name the predicate');
    assert.match(i11[0].message, /equals/, "the I11 error must name the missing 'equals' param");
  });
});
