// Spec drift repair (AC-005, AC-006, AC-007).
//
// The corpus is seeded FROM these specs, so seeding before correcting them would
// bake the drift into the model whose purpose is to prevent drift (decision D6).
// Each test reads the LIVE file — these are assertions about the repository, not
// about a fixture, and they stay green afterwards as regression traps.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

function liveFile(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

describe('spec drift repair', () => {
  it('test_when_living_system_model_spec_read_then_no_unbuilt_index_modules', () => {
    const spec = liveFile('docs/specs/living-system-model.md');
    // Slice C shipped memory-index/resolve.mjs with the index rebuilt on every read,
    // and summarization inlined as renderGovernedHits in governed-memory.mjs.
    // Neither of these modules was ever written.
    assert.ok(
      !/index\/build\.mjs/.test(spec),
      'spec must not name index/build.mjs — it was never built',
    );
    assert.ok(
      !/index\/summarize\.mjs/.test(spec),
      'spec must not name index/summarize.mjs — summarization is inlined as renderGovernedHits',
    );
    assert.match(
      spec,
      /resolve\.mjs/,
      'the module that WAS built must still be named',
    );
  });

  it('test_when_erp_portables_spec_read_then_schema_path_corrected', () => {
    const spec = liveFile('docs/specs/erp-portables.md');
    assert.ok(
      !/src\/schemas\/workflow-track/.test(spec),
      'spec must not cite the schema at src/schemas/ — it lives at .claude/schemas/',
    );
    assert.match(spec, /\.claude\/schemas\/workflow-track\.v1\.json/, 'the real path must be cited');
    // The corrected path must actually resolve, or the correction is just different drift.
    assert.doesNotThrow(
      () => liveFile('.claude/schemas/workflow-track.v1.json'),
      'the cited schema path must exist on disk',
    );
  });

  it('test_when_release_workflow_spec_read_then_job_set_matches_live', () => {
    const spec = liveFile('docs/specs/release-workflow.md');
    const yaml = liveFile('.github/workflows/release.yml');

    const liveJobs = [...yaml.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gim)]
      .map((m) => m[1])
      .filter((name) => !['push', 'group'].includes(name));
    assert.ok(liveJobs.length > 0, 'sanity: the workflow must declare jobs');

    // A spec's structural claim is its C4, not its prose. The amendment notes
    // legitimately narrate that install-smoke was removed and the graph became
    // pre-publish-checks -> release -> deploy-pages; deleting that history to
    // satisfy a text grep would destroy the honest record this cycle exists to
    // keep. So the assertion reads the declarations, and prose may say anything.
    const declaredJobs = [...spec.matchAll(/^\s*Component\(\w+,\s*"Job:\s*([a-z0-9-]+)"/gim)].map((m) => m[1]);

    assert.deepEqual(
      [...declaredJobs].sort(),
      [...liveJobs].sort(),
      'the C4 job declarations must match the jobs actually defined in the workflow',
    );
  });
});
