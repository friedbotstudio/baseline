// Tests for src/cli/tui/upgrade.js — branded upgrade flow with interactive conflict resolution.
// RED until the module exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshInstall } from '../src/cli/install.js';

let tuiUpgrade;
try {
  tuiUpgrade = await import('../src/cli/tui/upgrade.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/upgrade.js: ${err.message}`);
}

const CANCEL_SENTINEL = Symbol.for('clack:cancel');

async function makeTemplateFixture(claudeBody = '# baseline v1\n') {
  const tplDir = await mkdtemp(join(tmpdir(), 'tui-upgrade-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), claudeBody);
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

async function installedTargetWithCustomization() {
  const tpl = await makeTemplateFixture('# baseline v1\n');
  const target = await mkdtemp(join(tmpdir(), 'tui-upgrade-target-'));
  await freshInstall(tpl, target);
  // customize CLAUDE.md so it diverges from the manifest hash
  await writeFile(join(target, 'CLAUDE.md'), '# customized by user\n');
  // ship a new template version — same path, different content → SKIP_CUSTOMIZED in upgrade
  const newTpl = await makeTemplateFixture('# baseline v2\n');
  return { newTpl, target };
}

function makePromptsStub(selectAnswers) {
  // selectAnswers: array of values, one per select prompt in encounter order.
  // CANCEL_SENTINEL triggers isCancel(v) === true on consumption.
  const calls = [];
  let answerIdx = 0;
  return {
    calls,
    stub: {
      intro: (msg) => calls.push({ kind: 'intro', msg }),
      outro: (msg) => calls.push({ kind: 'outro', msg }),
      cancel: (msg) => calls.push({ kind: 'cancel', msg }),
      log: {
        info: (m) => calls.push({ kind: 'log.info', m }),
        warn: (m) => calls.push({ kind: 'log.warn', m }),
        error: (m) => calls.push({ kind: 'log.error', m }),
        success: (m) => calls.push({ kind: 'log.success', m }),
        step: (m) => calls.push({ kind: 'log.step', m }),
      },
      spinner: () => ({ start() {}, message() {}, stop() {}, error() {} }),
      select: async (opts) => {
        calls.push({ kind: 'select', message: opts?.message, options: opts?.options });
        const v = selectAnswers[answerIdx++];
        return v;
      },
      isCancel: (v) => v === CANCEL_SENTINEL,
    },
  };
}

describe('tui/upgrade', () => {
  it('test_when_upgrade_in_tty_with_customized_stale_and_user_picks_take_theirs_then_file_overwritten', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const { calls, stub } = makePromptsStub(['take-theirs']);

    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: newTpl },
      prompts: stub,
    });

    assert.equal(exitCode, 0, 'upgrade with take-theirs on the one conflict should exit 0');
    const finalClaude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(finalClaude, '# baseline v2\n', 'CLAUDE.md should now match new template content');
    assert.ok(
      calls.some((c) => c.kind === 'select' && /CLAUDE\.md/i.test(c.message || '')),
      'expected one prompts.select for the customized CLAUDE.md path'
    );
  });

  it('test_when_upgrade_in_tty_and_user_picks_abort_then_exit_1_and_tree_unchanged', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const before = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    const { calls, stub } = makePromptsStub(['abort']);

    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: newTpl },
      prompts: stub,
    });

    assert.equal(exitCode, 1, 'abort on first conflict should exit 1');
    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, before, 'target file must be untouched when user aborts');
    assert.ok(
      calls.some((c) => c.kind === 'cancel'),
      'expected prompts.cancel to be invoked on abort'
    );
  });

  it('test_when_upgrade_ctrl_c_mid_prompt_then_cancel_runs_and_exit_1', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const before = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    const { calls, stub } = makePromptsStub([CANCEL_SENTINEL]);

    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: newTpl },
      prompts: stub,
    });

    assert.equal(exitCode, 1, 'isCancel-positive return must result in exit 1');
    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, before, 'Ctrl+C must leave target unchanged');
    assert.ok(
      calls.some((c) => c.kind === 'cancel'),
      'expected prompts.cancel after isCancel-positive answer'
    );
  });
});

// AC-001 verbiage updated: tier-1 prompt offers four options
// {keep-mine, take-theirs, merge, abort} — "Show diff" is REMOVED in this
// workflow (docs/specs/tier1-merge-option.md). Tier-2/3 dispatch tests below
// (AC-002, AC-003, AC-007 idempotency, AC-010 legacy fallback) are unchanged.

describe('tui/upgrade — verbiage (AC-001)', () => {
  it('test_when_upgrade_tier1_customized_then_new_four_choice_labels_include_merge_not_show_diff', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const { calls, stub } = makePromptsStub(['keep-mine']);

    await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const selectCall = calls.find((c) => c.kind === 'select' && /CLAUDE\.md/i.test(c.message || ''));
    assert.ok(selectCall, 'expected one select for the customized CLAUDE.md');
    const labels = (selectCall.options || []).map((o) => o.label);
    assert.ok(labels.includes('Keep your version'),
      `options must include "Keep your version"; got: ${JSON.stringify(labels)}`);
    assert.ok(labels.includes('Use new baseline'),
      `options must include "Use new baseline"; got: ${JSON.stringify(labels)}`);
    assert.ok(labels.includes('Merge'),
      `options must include "Merge" (replaces "Show diff"); got: ${JSON.stringify(labels)}`);
    assert.ok(labels.includes('Abort'),
      `options must include "Abort"; got: ${JSON.stringify(labels)}`);
    assert.ok(!labels.includes('Show diff'),
      `legacy "Show diff" label must be removed in this workflow; got: ${JSON.stringify(labels)}`);
    assert.ok(!labels.includes('Keep mine'),
      `legacy "Keep mine" label must be removed; got: ${JSON.stringify(labels)}`);
    assert.ok(!labels.includes('Take theirs'),
      `legacy "Take theirs" label must be removed; got: ${JSON.stringify(labels)}`);
  });
});

describe('tui/upgrade — tier-1 prompt option count and order (AC-001)', () => {
  it('test_when_tier1_prompt_renders_then_four_options_exactly_keep_take_merge_abort_no_show_diff', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const { calls, stub } = makePromptsStub(['keep-mine']);

    await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const selectCall = calls.find((c) => c.kind === 'select' && /CLAUDE\.md/i.test(c.message || ''));
    assert.ok(selectCall, 'expected one select for the customized CLAUDE.md');
    const values = (selectCall.options || []).map((o) => o.value);
    assert.deepEqual(values, ['keep-mine', 'take-theirs', 'merge', 'abort'],
      `option values must be exactly [keep-mine, take-theirs, merge, abort] in that order; got: ${JSON.stringify(values)}`);
    const serialized = JSON.stringify(selectCall.options || []);
    assert.ok(!/show-diff/i.test(serialized),
      `no option may contain the token "show-diff"; got: ${serialized}`);
  });
});

describe('tui/upgrade — Merge pick stages BASE-less (AC-002)', () => {
  it('test_when_user_picks_merge_then_stage_entry_base_sha256_null_incoming_written_local_untouched_exit_5', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const localBefore = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    const incomingBytes = await readFile(join(newTpl, 'CLAUDE.md'), 'utf8');
    const { calls, stub } = makePromptsStub(['merge']);

    const exit = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    assert.equal(exit, 5,
      'Merge pick on a tier-1 conflict must surface as CLI exit code 5 (semantic-stage exit)');

    const localAfter = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(localAfter, localBefore,
      'LOCAL file must be UNCHANGED after Merge pick — reconciliation happens later in /upgrade-project');

    const { readdir } = await import('node:fs/promises');
    const stageRoot = join(target, '.claude/state/upgrade');
    const stages = await readdir(stageRoot);
    assert.equal(stages.length, 1, 'exactly one stage_ts dir per CLI run');
    const stageDir = join(stageRoot, stages[0]);

    const { existsSync: fsExists } = await import('node:fs');
    assert.ok(fsExists(join(stageDir, 'CLAUDE.md.baseline-incoming')),
      '<rel>.baseline-incoming artifact must be written under the stage dir');
    assert.ok(!fsExists(join(stageDir, 'CLAUDE.md.baseline-base')),
      '<rel>.baseline-base artifact must NOT be written for tier-1 Merge (BASE is unrecoverable)');

    const incomingArtifact = await readFile(join(stageDir, 'CLAUDE.md.baseline-incoming'), 'utf8');
    assert.equal(incomingArtifact, incomingBytes,
      'baseline-incoming artifact bytes must equal the incoming template bytes');

    const manifest = JSON.parse(await readFile(join(stageDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.files.length, 1, 'stage manifest must contain exactly one entry');
    const entry = manifest.files[0];
    assert.equal(entry.rel, 'CLAUDE.md');
    assert.equal(entry.base_sha256, null,
      'BASE-less entry: base_sha256 must be the JSON value null (design pick 1A); got: ' + JSON.stringify(entry.base_sha256));
    assert.match(entry.incoming_sha256, /^[0-9a-f]{64}$/, 'incoming_sha256 must be 64-hex');
    assert.match(entry.local_sha256, /^[0-9a-f]{64}$/, 'local_sha256 must be 64-hex');
    assert.equal(entry.status, 'PENDING', 'new entry must start PENDING');

    const pointerEmitted = calls.some((c) => /\/upgrade-project/.test(JSON.stringify(c)));
    assert.ok(pointerEmitted,
      'terminal output must include a pointer to /upgrade-project after Merge pick');
  });
});

describe('tui/upgrade — non-TTY contract: Merge unreachable (AC-006)', () => {
  it('test_when_threeWayMerge_no_onSkipCustomized_callback_then_skip_customized_action_exit_3_local_untouched_no_stage', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const localBefore = await readFile(join(target, 'CLAUDE.md'), 'utf8');

    const { threeWayMerge, ACTION_KINDS } = await import('../src/cli/merge.js');
    const { loadManifest, buildManifestFromDir } = await import('../src/cli/manifest.js');
    const oldManifest = await loadManifest(join(target, '.claude/.baseline-manifest.json'));
    const { readdir } = await import('node:fs/promises');
    const tplFiles = (await readdir(newTpl, { recursive: true, withFileTypes: true }))
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath ?? d.path, d.name).slice(newTpl.length + 1).split(/\\|\//).join('/'));
    const newManifest = await buildManifestFromDir(newTpl, tplFiles);

    const report = await threeWayMerge(newTpl, target, oldManifest, newManifest);

    const skipAction = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.ok(skipAction, 'CLAUDE.md must appear in actions[]');
    assert.equal(skipAction.kind, ACTION_KINDS.SKIP_CUSTOMIZED,
      'no onSkipCustomized callback → default keep-mine → SKIP_CUSTOMIZED');
    assert.equal(report.exitCode, 3,
      'exitCode for skipped customized files must be 3 (today\'s non-TTY contract)');

    const localAfter = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(localAfter, localBefore, 'LOCAL must be unchanged on the non-TTY path');

    const { existsSync: fsExists } = await import('node:fs');
    assert.ok(!fsExists(join(target, '.claude/state/upgrade')),
      'no stage dir may be created on the non-TTY path — Merge is unreachable without a prompt');
  });
});

describe('tui/upgrade — BASE-less stage short-circuits subsequent runs (AC-005, AC-007)', () => {
  it('test_when_pending_baseless_stage_exists_then_subsequent_tui_upgrade_short_circuits_without_remerge_prompt', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const stageDir = join(target, '.claude/state/upgrade/2026-05-22T15-00-00Z');
    await mkdir(stageDir, { recursive: true });
    await writeFile(join(stageDir, 'manifest.json'), JSON.stringify({
      stage_version: 1, slug: 'tier1-merge-option', created_at: 'x',
      baseline_version_from: '0.7.0', baseline_version_to: '0.8.0',
      files: [{ rel: 'CLAUDE.md', base_sha256: null, incoming_sha256: 'b'.repeat(64), local_sha256: 'c'.repeat(64), status: 'PENDING' }],
    }, null, 2));

    const { calls, stub } = makePromptsStub([]);
    const exit = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const selects = calls.filter((c) => c.kind === 'select');
    assert.equal(selects.length, 0,
      'BASE-less pending stage must short-circuit before any select prompt fires (re-Merge is structurally unreachable while stage exists)');
    assert.equal(exit, 5,
      're-invocation with BASE-less pending stage exits 5 (matches tier-3 AC-007 contract)');
    const pointer = calls.some((c) => /\/upgrade-project/.test(JSON.stringify(c)));
    assert.ok(pointer, 'terminal output must re-print the /upgrade-project pointer');
  });
});

describe('tui/upgrade — diff-render module removal (AC-007 Removed)', () => {
  it('test_when_diff_render_module_and_test_file_removed_then_no_orphan_references', async () => {
    const { existsSync: fsExists } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname: dn, join: jn } = await import('node:path');
    const repoRoot = jn(dn(fileURLToPath(import.meta.url)), '..');

    assert.ok(!fsExists(jn(repoRoot, 'src/cli/diff-render.js')),
      'src/cli/diff-render.js must be deleted (only callers were the Show-diff loop and its test)');
    assert.ok(!fsExists(jn(repoRoot, 'tests/diff-render.test.mjs')),
      'tests/diff-render.test.mjs must be deleted (the module it tests is gone)');

    const tuiSrc = await readFile(jn(repoRoot, 'src/cli/tui/upgrade.js'), 'utf8');
    for (const forbidden of ['diff-render', 'renderUnifiedDiff', 'renderConflictDiff', 'consecutiveShowDiff', 'SHOW_DIFF_CONSECUTIVE_CAP']) {
      assert.ok(!tuiSrc.includes(forbidden),
        `src/cli/tui/upgrade.js must NOT reference "${forbidden}" after Merge replaces Show diff`);
    }
  });
});

async function tierClassifiedFixture({ rel, tier, localBytes, baseBytes, incomingBytes }) {
  // Build a fresh template + target where `rel` is classified into the given tier
  // via a shipped manifest written into the new template's `.claude/manifest.json`.
  // freshInstall mirrors `baseBytes` to .baseline-prior so BASE resolution short-circuits.
  const tpl = await makeTemplateFixture(baseBytes);
  const target = await mkdtemp(join(tmpdir(), 'tui-upgrade-tier-target-'));
  await freshInstall(tpl, target);
  await writeFile(join(target, rel), localBytes);

  const newTpl = await makeTemplateFixture(incomingBytes);
  // Write a shipped manifest in newTpl that classifies <rel> as the requested tier.
  const { createHash } = await import('node:crypto');
  const incomingSha = createHash('sha256').update(incomingBytes).digest('hex');
  await mkdir(join(newTpl, '.claude'), { recursive: true });
  const shipped = {
    manifest_version: 3,
    generated_at: new Date().toISOString(),
    files: { [rel]: { sha256: incomingSha, tier } },
    owners: { skills: {} },
  };
  await writeFile(join(newTpl, '.claude/manifest.json'), JSON.stringify(shipped, null, 2) + '\n');
  return { newTpl, target };
}

describe('tui/upgrade — tier-3 staging (AC-004)', () => {
  it('test_when_upgrade_tier3_customized_then_stage_written_and_exit_5_and_terminal_pointer', async () => {
    const { newTpl, target } = await tierClassifiedFixture({
      rel: 'CLAUDE.md',
      tier: 'SEMANTIC',
      baseBytes: '# baseline v1\n',
      localBytes: '# customized by user\n## Article XI (user)\nuser added this\n',
      incomingBytes: '# baseline v2\n## Article XI (baseline)\nbaseline added this\n',
    });
    const { calls, stub } = makePromptsStub([]);

    const exit = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const { existsSync: fsExists } = await import('node:fs');
    const stageRoot = join(target, '.claude/state/upgrade');
    assert.ok(fsExists(stageRoot),
      'tier-3 SEMANTIC customized file must create .claude/state/upgrade/<ts>/');
    assert.equal(exit, 5,
      'tier-3 SEMANTIC staging must surface as CLI exit code 5');
    const pointerLine = calls.some((c) => /\/upgrade-project/i.test(JSON.stringify(c)));
    assert.ok(pointerLine,
      'terminal output must contain a pointer to /upgrade-project');
  });
});

describe('tui/upgrade — tier-2 mechanical (AC-002, AC-003)', () => {
  it('test_when_upgrade_tier2_clean_then_no_prompt_and_action_visible', async () => {
    // Tier-2 mechanical with non-overlapping edits must silently auto-merge.
    const base = '# line A\n# line B\n# line C\n';
    const local = '# line A\n# line B\n# line C\n# local addition\n';
    const incoming = '# line A HEADER\n# line B\n# line C\n';
    const { newTpl, target } = await tierClassifiedFixture({
      rel: 'CLAUDE.md',
      tier: 'MECHANICAL',
      baseBytes: base,
      localBytes: local,
      incomingBytes: incoming,
    });
    const { calls, stub } = makePromptsStub([]);

    const exit = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const selectsForFile = calls.filter((c) => c.kind === 'select' && /CLAUDE\.md/i.test(c.message || ''));
    assert.equal(selectsForFile.length, 0,
      'tier-2 MECHANICAL with non-overlapping hunks must NOT trigger any select prompt');
    // ACTION_LABELS maps MECHANICAL_MERGE_CLEAN → "merged cleanly" in the per-file report.
    const actionLine = calls.some((c) => /merged cleanly/i.test(JSON.stringify(c)));
    assert.ok(actionLine,
      'final terminal report must include the "merged cleanly" action line for the mechanical-clean case');
    assert.equal(exit, 0, 'clean mechanical merge exits 0');
  });

  it('test_when_upgrade_tier2_conflicted_then_terminal_message_and_exit_4', async () => {
    const base = '# line A\n# line B\n# line C\n';
    const local = '# line A LOCAL EDIT\n# line B\n# line C\n';
    const incoming = '# line A INCOMING EDIT\n# line B\n# line C\n';
    const { newTpl, target } = await tierClassifiedFixture({
      rel: 'CLAUDE.md',
      tier: 'MECHANICAL',
      baseBytes: base,
      localBytes: local,
      incomingBytes: incoming,
    });
    const { calls, stub } = makePromptsStub([]);

    const exit = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const conflictLine = calls.some((c) => /Merged with conflicts/i.test(JSON.stringify(c)));
    assert.ok(conflictLine,
      'terminal output must contain "Merged with conflicts" message');
    assert.equal(exit, 4,
      'mechanical conflict on disk must surface as CLI exit code 4');
  });
});

describe('tui/upgrade — idempotency (AC-007)', () => {
  it('test_when_dispatchUpgrade_detects_pending_stage_then_short_circuit_no_merge', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    // Pre-seed a pending stage.
    const stageDir = join(target, '.claude/state/upgrade/2026-05-20T15-00-00Z');
    await mkdir(stageDir, { recursive: true });
    await writeFile(join(stageDir, 'manifest.json'), JSON.stringify({
      stage_version: 1, slug: 'upgrade-flow-rework', created_at: 'x',
      baseline_version_from: '0.4.0', baseline_version_to: '0.5.0',
      files: [{ rel: 'docs/init/seed.md', base_sha256: 'a'.repeat(64), incoming_sha256: 'b'.repeat(64), local_sha256: 'c'.repeat(64), status: 'PENDING' }],
    }, null, 2));
    const { calls, stub } = makePromptsStub([]);

    const exit = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    const selects = calls.filter((c) => c.kind === 'select');
    assert.equal(selects.length, 0,
      'pending stage must short-circuit before any select prompt');
    assert.equal(exit, 5,
      're-invocation with pending stage exits 5 (no work done)');
    const pointer = calls.some((c) => /\/upgrade-project/.test(JSON.stringify(c)));
    assert.ok(pointer, 'terminal output must re-print the /upgrade-project pointer');
  });

  it('test_when_upgrade_invoked_twice_consecutively_with_pending_stage_then_both_runs_identical_no_extra_writes', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const stageDir = join(target, '.claude/state/upgrade/2026-05-20T15-30-00Z');
    await mkdir(stageDir, { recursive: true });
    const stageManifestPath = join(stageDir, 'manifest.json');
    await writeFile(stageManifestPath, JSON.stringify({
      stage_version: 1, slug: 'upgrade-flow-rework', created_at: 'x',
      baseline_version_from: '0.4.0', baseline_version_to: '0.5.0',
      files: [{ rel: 'docs/init/seed.md', base_sha256: 'a'.repeat(64), incoming_sha256: 'b'.repeat(64), local_sha256: 'c'.repeat(64), status: 'PENDING' }],
    }, null, 2));
    const { stat } = await import('node:fs/promises');
    const beforeMtime = (await stat(stageManifestPath)).mtimeMs;

    const exit1 = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: makePromptsStub([]).stub });
    const exit2 = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: makePromptsStub([]).stub });

    assert.equal(exit1, exit2, 'two consecutive runs must produce the same exit code');
    const afterMtime = (await stat(stageManifestPath)).mtimeMs;
    assert.equal(afterMtime, beforeMtime,
      'stage manifest mtime must be unchanged across two read-only re-invocations');
  });
});

describe('tui/upgrade — legacy fallback (AC-010)', () => {
  it('test_when_legacy_manifest_v1_then_tier2_3_files_fall_back_to_binary_prompt_with_notice', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    // Downgrade installed manifest to v1 shape.
    const manifestPath = join(target, '.claude/.baseline-manifest.json');
    const m = JSON.parse(await readFile(manifestPath, 'utf8'));
    m.manifest_version = 1;
    delete m.baseline_version;
    await writeFile(manifestPath, JSON.stringify(m, null, 2) + '\n');

    const { calls, stub } = makePromptsStub(['keep-mine']);

    await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    // Notice copy was de-jargoned on 2026-05-21; the user-facing string now
    // leads with "Your previous install predates version-tracked manifests".
    const noticeLine = calls.some((c) => /predates version-tracked manifests/i.test(JSON.stringify(c)));
    assert.ok(noticeLine,
      'legacy manifest install must surface a one-time terminal notice');
    const selectsForFile = calls.filter((c) => c.kind === 'select' && /CLAUDE\.md/i.test(c.message || ''));
    assert.ok(selectsForFile.length >= 1,
      'legacy fallback must route the file through the tier-1 binary prompt');
  });
});
