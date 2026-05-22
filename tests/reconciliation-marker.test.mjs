// Tests for src/cli/reconciliation-marker.js — the new on-disk marker module
// that records which template hash each file was reconciled against, so
// subsequent `create-baseline upgrade` runs can skip files the user has
// already reviewed against the current template version.
//
// Also covers the merge.js marker-consult branch (AC-003/AC-004) and the
// NEVER_TOUCH expansion that covers _pending.md / _resume.md (AC-001/AC-002).
// Spec: docs/specs/upgrade-no-replay-prompts.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const merge = await import('../src/cli/merge.js');

// Guarded import: src/cli/reconciliation-marker.js may not exist yet at scenario
// time (RED). When implement lands the module, this resolves cleanly.
let marker;
try {
  marker = await import('../src/cli/reconciliation-marker.js');
} catch (err) {
  throw new Error(
    `cannot import src/cli/reconciliation-marker.js (expected RED at scenario time): ${err.message}`
  );
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function makeTargetWithFiles(initialFiles) {
  const target = await mkdtemp(join(tmpdir(), 'marker-target-'));
  await mkdir(join(target, '.claude'), { recursive: true });
  for (const [rel, content] of Object.entries(initialFiles)) {
    const full = join(target, rel);
    await mkdir(join(target, rel.split('/').slice(0, -1).join('/')), { recursive: true });
    await writeFile(full, content);
  }
  return target;
}

async function makeTemplateDir(files) {
  const tplDir = await mkdtemp(join(tmpdir(), 'marker-tpl-'));
  for (const [rel, content] of Object.entries(files)) {
    const dir = rel.split('/').slice(0, -1).join('/');
    if (dir) await mkdir(join(tplDir, dir), { recursive: true });
    await writeFile(join(tplDir, rel), content);
  }
  return tplDir;
}

function manifestFromFiles(files, tierOverrides = {}) {
  const out = { manifest_version: 3, generated_at: new Date().toISOString(), files: {} };
  for (const [rel, content] of Object.entries(files)) {
    const sha = sha256Hex(Buffer.from(content));
    const tier = tierOverrides[rel] ?? 'BINARY_PROMPT';
    out.files[rel] = { sha256: sha, tier };
  }
  return out;
}

describe('reconciliation-marker — NEVER_TOUCH preserves runtime-state files', () => {
  it('test_when_upgrade_with_pending_body_grown_then_NEVER_TOUCH_PRESERVE_no_prompt', async () => {
    const REL = '.claude/memory/_pending.md';
    const skeleton = '---\nname: pending\n---\n\n# Pending memory candidates\n';
    const grownBody = skeleton + '\n## CANDIDATE: foo → landmarks.md\n- accumulated by session\n';

    const tpl = await makeTemplateDir({ [REL]: skeleton });
    const target = await makeTargetWithFiles({ [REL]: grownBody });

    const newM = manifestFromFiles({ [REL]: skeleton }, { [REL]: 'NEVER_TOUCH' });
    const oldM = manifestFromFiles({ [REL]: skeleton }, { [REL]: 'NEVER_TOUCH' });

    let prompted = false;
    const report = await merge.threeWayMerge(tpl, target, oldM, newM, {
      onSkipCustomized: () => { prompted = true; return 'keep-mine'; },
    });

    const action = report.actions.find((a) => a.path === REL);
    assert.ok(action, `expected an action for ${REL}`);
    assert.equal(action.kind, 'NEVER_TOUCH_PRESERVE',
      `_pending.md should be preserved (NEVER_TOUCH), not prompted; got ${action.kind}`);
    assert.equal(prompted, false, '_pending.md must not trigger the customized prompt');

    const after = await readFile(join(target, REL), 'utf8');
    assert.equal(after, grownBody, 'NEVER_TOUCH must leave the local body byte-identical');
  });

  it('test_when_upgrade_with_resume_body_rewritten_then_NEVER_TOUCH_PRESERVE_no_prompt', async () => {
    const REL = '.claude/memory/_resume.md';
    const skeleton = '---\nname: resume\n---\n\n# Resume snapshot\n\n## No prior session\n';
    const rewritten = '---\nname: resume\nlast-updated: 2026-05-22\n---\n\n# Resume snapshot\n\n## Active workflow\n- slug: foo\n';

    const tpl = await makeTemplateDir({ [REL]: skeleton });
    const target = await makeTargetWithFiles({ [REL]: rewritten });

    const newM = manifestFromFiles({ [REL]: skeleton }, { [REL]: 'NEVER_TOUCH' });
    const oldM = manifestFromFiles({ [REL]: skeleton }, { [REL]: 'NEVER_TOUCH' });

    let prompted = false;
    const report = await merge.threeWayMerge(tpl, target, oldM, newM, {
      onSkipCustomized: () => { prompted = true; return 'keep-mine'; },
    });

    const action = report.actions.find((a) => a.path === REL);
    assert.ok(action, `expected an action for ${REL}`);
    assert.equal(action.kind, 'NEVER_TOUCH_PRESERVE',
      `_resume.md should be preserved (NEVER_TOUCH); got ${action.kind}`);
    assert.equal(prompted, false, '_resume.md must not trigger the customized prompt');

    const after = await readFile(join(target, REL), 'utf8');
    assert.equal(after, rewritten, 'NEVER_TOUCH must leave the local body byte-identical');
  });
});

describe('reconciliation-marker — merge consults marker before dispatchCustomized', () => {
  it('test_when_marker_records_template_sha_X_and_template_is_X_then_NOOP_no_dispatch', async () => {
    const REL = 'docs/init/seed.md';
    const localContent = '# seed\n\n## §16\nUSER CUSTOMIZED LINES\n';
    const templateContent = '# seed\n\n## §16\n*Reserved.*\n';
    const templateSha = sha256Hex(Buffer.from(templateContent));

    const tpl = await makeTemplateDir({ [REL]: templateContent });
    const target = await makeTargetWithFiles({ [REL]: localContent });

    // Simulate /upgrade-project having already reconciled against templateSha.
    await mkdir(join(target, '.claude'), { recursive: true });
    await writeFile(
      join(target, '.claude/.baseline-reconciliations.json'),
      JSON.stringify({
        schema_version: 1,
        reconciliations: {
          [REL]: {
            baseline_version: '0.8.1',
            reconciled_against_template_sha: templateSha,
            reconciled_at: '2026-05-22T15:00:00Z',
          },
        },
      }, null, 2) + '\n',
    );

    const newM = manifestFromFiles({ [REL]: templateContent }, { [REL]: 'SEMANTIC' });
    const oldM = manifestFromFiles({ [REL]: 'OLDER\n' }, { [REL]: 'SEMANTIC' });

    let dispatched = false;
    const report = await merge.threeWayMerge(tpl, target, oldM, newM, {
      onSkipCustomized: () => { dispatched = true; return 'keep-mine'; },
    });

    const action = report.actions.find((a) => a.path === REL);
    assert.ok(action, `expected an action for ${REL}`);
    assert.ok(
      action.kind === 'NOOP' || action.kind === 'MARKER_MATCHED',
      `marker-matched file should NOOP (or new MARKER_MATCHED kind), got ${action.kind}`,
    );
    assert.equal(dispatched, false,
      'marker-matched file must not reach dispatchCustomized / prompt');
  });

  it('test_when_marker_records_template_sha_X_but_new_template_is_Y_then_SEMANTIC_MERGE_STAGED', async () => {
    const REL = 'docs/init/seed.md';
    const localContent = '# seed\n\n## §16\nUSER CUSTOMIZED\n';
    const oldTemplateContent = '# seed v1\n\n## §16\n*Reserved.*\n';
    const newTemplateContent = '# seed v2 changed\n\n## §16\n*Reserved.*\n';
    const oldTemplateSha = sha256Hex(Buffer.from(oldTemplateContent));

    const tpl = await makeTemplateDir({ [REL]: newTemplateContent });
    const target = await makeTargetWithFiles({ [REL]: localContent });

    // Seed the BASE cache so resolveBase succeeds (post-v3-manifest scenario).
    // Without this, the legacy-manifest fallback fires and the action becomes
    // SKIP_CUSTOMIZED — correct behavior but a different code path than AC-004
    // targets. The marker-consult logic under test is invariant to BASE
    // recoverability; the cache seed lets us assert on the SEMANTIC tier path.
    await mkdir(join(target, '.claude/.baseline-prior/docs/init'), { recursive: true });
    await writeFile(join(target, '.claude/.baseline-prior', REL), oldTemplateContent);

    // Marker records reconciliation against the OLD template hash, not the new one.
    await mkdir(join(target, '.claude'), { recursive: true });
    await writeFile(
      join(target, '.claude/.baseline-reconciliations.json'),
      JSON.stringify({
        schema_version: 1,
        reconciliations: {
          [REL]: {
            baseline_version: '0.8.1',
            reconciled_against_template_sha: oldTemplateSha,
            reconciled_at: '2026-05-22T15:00:00Z',
          },
        },
      }, null, 2) + '\n',
    );

    const newM = manifestFromFiles({ [REL]: newTemplateContent }, { [REL]: 'SEMANTIC' });
    const oldM = manifestFromFiles({ [REL]: oldTemplateContent }, { [REL]: 'SEMANTIC' });
    oldM.baseline_version = '0.8.1';

    const report = await merge.threeWayMerge(tpl, target, oldM, newM, {});

    const action = report.actions.find((a) => a.path === REL);
    assert.ok(action, `expected an action for ${REL}`);
    assert.equal(action.kind, 'SEMANTIC_MERGE_STAGED',
      `genuine upstream change must still stage; got ${action.kind}`);
  });
});

describe('reconciliation-marker — readMarker resilience', () => {
  it('test_when_marker_file_absent_then_readMarker_returns_null_and_merge_behaves_as_pre_fix', async () => {
    const target = await mkdtemp(join(tmpdir(), 'marker-absent-'));
    const got = await marker.readMarker(target);
    assert.equal(got, null, 'absent marker file → readMarker returns null');
  });

  it('test_when_readMarker_with_malformed_JSON_then_returns_null_and_warns', async () => {
    const target = await mkdtemp(join(tmpdir(), 'marker-malformed-'));
    await mkdir(join(target, '.claude'), { recursive: true });
    await writeFile(join(target, '.claude/.baseline-reconciliations.json'), '{not valid json');

    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = (chunk) => { captured += String(chunk); return true; };
    try {
      const got = await marker.readMarker(target);
      assert.equal(got, null, 'malformed JSON → readMarker returns null');
      assert.match(captured, /reconciliation-marker: malformed/,
        'malformed read must emit a stderr warning naming the marker');
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it('test_when_readMarker_with_future_schema_version_then_returns_null_and_warns', async () => {
    const target = await mkdtemp(join(tmpdir(), 'marker-future-schema-'));
    await mkdir(join(target, '.claude'), { recursive: true });
    await writeFile(
      join(target, '.claude/.baseline-reconciliations.json'),
      JSON.stringify({ schema_version: 2, reconciliations: {} }) + '\n',
    );

    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = (chunk) => { captured += String(chunk); return true; };
    try {
      const got = await marker.readMarker(target);
      assert.equal(got, null, 'future schema_version → null (forward-compat guard)');
      assert.match(captured, /reconciliation-marker/,
        'future schema must emit a stderr warning');
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});

describe('reconciliation-marker — recordReconciliation', () => {
  it('test_when_recordReconciliation_called_twice_for_different_rels_then_both_entries_persist', async () => {
    const target = await mkdtemp(join(tmpdir(), 'marker-two-rels-'));
    await mkdir(join(target, '.claude'), { recursive: true });

    await marker.recordReconciliation(target, 'a.md', '0.8.1', 'a'.repeat(64));
    await marker.recordReconciliation(target, 'b.md', '0.8.1', 'b'.repeat(64));

    const got = await marker.readMarker(target);
    assert.ok(got, 'marker file should exist after writes');
    assert.equal(got.schema_version, 1);
    assert.ok(got.reconciliations['a.md'], 'a.md entry persisted');
    assert.ok(got.reconciliations['b.md'], 'b.md entry persisted (no lost write)');
    assert.equal(got.reconciliations['a.md'].reconciled_against_template_sha, 'a'.repeat(64));
    assert.equal(got.reconciliations['b.md'].reconciled_against_template_sha, 'b'.repeat(64));
  });

  it('test_when_recordReconciliation_called_twice_for_same_rel_then_second_overwrites_first', async () => {
    const target = await mkdtemp(join(tmpdir(), 'marker-overwrite-'));
    await mkdir(join(target, '.claude'), { recursive: true });

    await marker.recordReconciliation(target, 'seed.md', '0.8.0', '1'.repeat(64));
    await marker.recordReconciliation(target, 'seed.md', '0.8.1', '2'.repeat(64));

    const got = await marker.readMarker(target);
    assert.equal(got.reconciliations['seed.md'].baseline_version, '0.8.1',
      'second write overwrites baseline_version');
    assert.equal(got.reconciliations['seed.md'].reconciled_against_template_sha, '2'.repeat(64),
      'second write overwrites template_sha');
    assert.equal(Object.keys(got.reconciliations).length, 1,
      'same rel should not produce two entries');
  });

  it('test_when_recordReconciliation_filesystem_readonly_then_throws_MarkerWriteError', async () => {
    const target = await mkdtemp(join(tmpdir(), 'marker-readonly-'));
    await mkdir(join(target, '.claude'), { recursive: true });
    // First write so the file exists, then chmod read-only.
    await marker.recordReconciliation(target, 'seed.md', '0.8.0', '0'.repeat(64));
    await chmod(join(target, '.claude'), 0o555);
    try {
      await assert.rejects(
        () => marker.recordReconciliation(target, 'seed.md', '0.8.1', '1'.repeat(64)),
        (err) => {
          assert.equal(err.name, 'MarkerWriteError',
            `expected MarkerWriteError; got ${err.name}: ${err.message}`);
          return true;
        },
      );
    } finally {
      await chmod(join(target, '.claude'), 0o755);
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe('reconciliation-marker — precedence ordering in merge', () => {
  it('test_when_merge_marker_consult_for_NEVER_TOUCH_path_then_marker_check_skipped', async () => {
    const REL = '.claude/memory/_pending.md';
    const skeleton = '---\nname: pending\n---\n\n# Pending memory candidates\n';
    const localBody = skeleton + '\n## CANDIDATE: foo → landmarks.md\n- session candidate\n';
    const templateSha = sha256Hex(Buffer.from(skeleton));

    const tpl = await makeTemplateDir({ [REL]: skeleton });
    const target = await makeTargetWithFiles({ [REL]: localBody });

    // Synthetic marker entry for a NEVER_TOUCH path; should be ignored because
    // NEVER_TOUCH branch fires BEFORE the marker-consult branch.
    await mkdir(join(target, '.claude'), { recursive: true });
    await writeFile(
      join(target, '.claude/.baseline-reconciliations.json'),
      JSON.stringify({
        schema_version: 1,
        reconciliations: {
          [REL]: {
            baseline_version: '0.8.1',
            reconciled_against_template_sha: templateSha,
            reconciled_at: '2026-05-22T15:00:00Z',
          },
        },
      }, null, 2) + '\n',
    );

    const newM = manifestFromFiles({ [REL]: skeleton }, { [REL]: 'NEVER_TOUCH' });
    const oldM = manifestFromFiles({ [REL]: skeleton }, { [REL]: 'NEVER_TOUCH' });

    const report = await merge.threeWayMerge(tpl, target, oldM, newM, {});

    const action = report.actions.find((a) => a.path === REL);
    assert.ok(action, `expected an action for ${REL}`);
    assert.equal(action.kind, 'NEVER_TOUCH_PRESERVE',
      `NEVER_TOUCH must fire before marker-consult; got ${action.kind}`);
  });
});
