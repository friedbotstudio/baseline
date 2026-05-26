// AC-007 — refreshBaselineVersion(target, version) is a narrow read-modify-write
// of <target>/.claude/project.json that updates ONLY the baseline_version field;
// every other top-level key is preserved byte-for-byte.
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #7.
// Module under test: src/cli/project-json.js (NEW — does not exist yet).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let projectJsonMod;
try {
  projectJsonMod = await import('../src/cli/project-json.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/project-json.js: ${err.message}. AC-007 spec adds this new foundation module.`);
}

const { refreshBaselineVersion } = projectJsonMod;

async function makeTargetWithProjectJson(body) {
  const target = await mkdtemp(join(tmpdir(), 'baseline-pjson-target-'));
  await mkdir(join(target, '.claude'));
  await writeFile(join(target, '.claude/project.json'), body);
  return target;
}

describe('project-json — refreshBaselineVersion (AC-007)', () => {
  it('test_when_refresh_baseline_version_runs_then_other_project_json_keys_preserved', async () => {
    const original = {
      $schema_version: 1,
      configured: true,
      test: { cmd: 'bash run-tests.sh', file_globs: ['**/*'], timeout_seconds: 120 },
      lint: { cmd: null, file_globs: ['**/*'], timeout_seconds: 60 },
      tdd: {
        enabled: true,
        source_globs: ['src/**', 'bin/**'],
        test_globs: ['tests/**'],
        mapping: 'conventional',
        ui_globs: [],
      },
      git: { protected_branches: ['main', 'release/*'], branch_pattern: null },
      swarm: { min_tasks_worth_swarming: 3, isolation: 'worktree' },
      artifacts: { required_sections: { spec: ['Goal', 'Design'] } },
      consent: { gate_marker_ttl_seconds: 120 },
      destructive_patterns: ['rm -rf /'],
    };
    const target = await makeTargetWithProjectJson(JSON.stringify(original, null, 2) + '\n');

    await refreshBaselineVersion(target, '1.2.3');

    const after = JSON.parse(await readFile(join(target, '.claude/project.json'), 'utf8'));
    assert.equal(after.baseline_version, '1.2.3',
      'baseline_version must be set to the provided version');

    // Every other top-level key must be deep-equal to the original.
    for (const key of Object.keys(original)) {
      assert.deepEqual(
        after[key],
        original[key],
        `top-level key "${key}" must be preserved byte-for-byte through refreshBaselineVersion; got ${JSON.stringify(after[key])} vs original ${JSON.stringify(original[key])}`,
      );
    }
    // And no extra keys were added beyond baseline_version.
    const addedKeys = Object.keys(after).filter((k) => !(k in original) && k !== 'baseline_version');
    assert.deepEqual(addedKeys, [],
      `refreshBaselineVersion must not introduce any new top-level keys beyond baseline_version; saw extras: ${JSON.stringify(addedKeys)}`);
  });

  it('test_when_refresh_baseline_version_runs_on_missing_project_json_then_is_noop', async () => {
    const target = await mkdtemp(join(tmpdir(), 'baseline-pjson-absent-'));
    // No .claude/project.json on disk; do not create it.

    await refreshBaselineVersion(target, '1.2.3'); // must not throw

    // File MUST NOT be created — refreshBaselineVersion is a refresh, not a synthesizer.
    await assert.rejects(
      access(join(target, '.claude/project.json')),
      { code: 'ENOENT' },
      'refreshBaselineVersion must not create <target>/.claude/project.json when it does not already exist',
    );
  });

  it('test_when_refresh_baseline_version_runs_on_malformed_project_json_then_throws', async () => {
    const malformed = '{{ not valid json';
    const target = await makeTargetWithProjectJson(malformed);
    const pjsonPath = join(target, '.claude/project.json');
    const beforeBytes = await readFile(pjsonPath);
    const beforeMtime = (await stat(pjsonPath)).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));

    await assert.rejects(
      () => refreshBaselineVersion(target, '1.2.3'),
      (err) => err instanceof Error && /project\.json/.test(err.message),
      'refreshBaselineVersion must throw a named error referencing project.json when the file is malformed JSON',
    );

    // Target file must not have been mutated.
    const afterBytes = await readFile(pjsonPath);
    assert.equal(afterBytes.toString('utf8'), beforeBytes.toString('utf8'),
      'malformed project.json must not be rewritten on the failure path');
    const afterMtime = (await stat(pjsonPath)).mtimeMs;
    assert.equal(afterMtime, beforeMtime,
      'malformed project.json mtime must be preserved on the failure path');
  });
});
