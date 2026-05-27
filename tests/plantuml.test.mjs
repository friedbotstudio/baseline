import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const plantuml = await import('../src/cli/plantuml.js');

const PINNED_SHA = 'c348f6a26d999f81fd05b5d49834bb70df9cf35fab0939c4edecb0909e64022b';

function fakeFetchOk(buffer) {
  return async () => buffer;
}

function fakeFetchNetworkFail() {
  return async () => { throw new Error('ECONNREFUSED'); };
}

async function realJarBytes() {
  return readFile('.claude/bin/plantuml.jar');
}

describe('fetchPlantumlIfMissing', () => {
  it('skips when --no-plantuml is set', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      noPlantuml: true,
      fetch: fakeFetchNetworkFail(),
    });
    assert.equal(result.outcome, 'SKIPPED_NO_PLANTUML_FLAG');
  });

  it('skips when --dry-run is set', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      dryRun: true,
      fetch: fakeFetchNetworkFail(),
    });
    assert.equal(result.outcome, 'SKIPPED_DRY_RUN');
  });

  it('skips when target jar already present with matching sha256', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    await mkdir(join(target, '.claude/bin'), { recursive: true });
    await writeFile(join(target, '.claude/bin/plantuml.jar'), await realJarBytes());

    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      fetch: fakeFetchNetworkFail(),
    });
    assert.equal(result.outcome, 'SKIPPED_ALREADY_PRESENT');
  });

  it('writes the jar when bytes match the pinned sha256', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    const bytes = await realJarBytes();

    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      fetch: fakeFetchOk(bytes),
    });
    assert.equal(result.outcome, 'WROTE');
    await access(join(target, '.claude/bin/plantuml.jar'));
  });

  it('warns on network failure (no flag)', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      fetch: fakeFetchNetworkFail(),
    });
    assert.equal(result.outcome, 'WARNED_NETWORK_FAILURE');
  });

  it('warns on sha256 mismatch (no flag)', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    const wrongBytes = Buffer.from('not the real jar');
    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      fetch: fakeFetchOk(wrongBytes),
    });
    assert.equal(result.outcome, 'WARNED_HASH_MISMATCH');
  });

  it('errors with --require-plantuml on network failure', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: null,
      requirePlantuml: true,
      fetch: fakeFetchNetworkFail(),
    });
    assert.equal(result.outcome, 'ERRORED_REQUIRE_PLANTUML');
  });

  it('exposes the pinned sha256 and url constants', () => {
    assert.equal(plantuml.PINNED_SHA256, PINNED_SHA);
    assert.ok(plantuml.UPSTREAM_URL.includes('plantuml-asl-1.2026.2.jar'));
  });
});
