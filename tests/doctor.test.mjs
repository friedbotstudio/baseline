import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const doctor = await import('../src/cli/doctor.js');

async function makeFakeInstall({ files = {}, manifestFiles, manifestVersion = 1, manifestGeneratedAt = '2026-01-01T00:00:00Z' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'doctor-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  if (manifestFiles) {
    await mkdir(join(root, '.claude'), { recursive: true });
    const manifest = {
      manifest_version: manifestVersion,
      generated_at: manifestGeneratedAt,
      files: manifestFiles,
    };
    await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  return root;
}

describe('doctor', () => {
  it('reports clean (exit 0) on a freshly installed target', async () => {
    const content = '# baseline\n';
    const { hashFile } = await import('../src/cli/manifest.js');
    const root = await makeFakeInstall({
      files: { 'CLAUDE.md': content },
    });
    const tmpHash = await hashFile(join(root, 'CLAUDE.md'));
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
      manifest_version: 1,
      generated_at: '2026-01-01T00:00:00Z',
      files: { 'CLAUDE.md': tmpHash },
    }, null, 2));

    try {
      const report = await doctor.runDoctor(root);
      assert.equal(report.exitCode, 0);
      assert.equal(report.customized.length, 0);
      assert.equal(report.missing.length, 0);
      assert.equal(report.matched.length, 1);
      assert.equal(report.manifestVersion, 1);
      assert.equal(report.generatedAt, '2026-01-01T00:00:00Z');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports CUSTOMIZED when a baseline file has been edited', async () => {
    const { hashFile } = await import('../src/cli/manifest.js');
    const root = await mkdtemp(join(tmpdir(), 'doctor-test-'));
    await writeFile(join(root, 'CLAUDE.md'), '# baseline original\n');
    const originalHash = await hashFile(join(root, 'CLAUDE.md'));
    await writeFile(join(root, 'CLAUDE.md'), '# user edited!\n');
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
      manifest_version: 1,
      generated_at: '2026-01-01T00:00:00Z',
      files: { 'CLAUDE.md': originalHash },
    }, null, 2));

    try {
      const report = await doctor.runDoctor(root);
      assert.equal(report.customized.length, 1);
      assert.equal(report.customized[0], 'CLAUDE.md');
      assert.equal(report.exitCode, 0, 'customization is informational, not failure');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports MISSING and exits 1 when a baseline file was deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doctor-test-'));
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
      manifest_version: 1,
      generated_at: '2026-01-01T00:00:00Z',
      files: { 'CLAUDE.md': 'deadbeef' },
    }, null, 2));

    try {
      const report = await doctor.runDoctor(root);
      assert.equal(report.missing.length, 1);
      assert.equal(report.missing[0], 'CLAUDE.md');
      assert.equal(report.exitCode, 1, 'missing baseline files are drift; exit 1');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports ADDED for files under .claude/ that are not in the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doctor-test-'));
    await mkdir(join(root, '.claude/hooks'), { recursive: true });
    await writeFile(join(root, '.claude/hooks/custom_hook.sh'), '# user-added\n');
    await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
      manifest_version: 1,
      generated_at: '2026-01-01T00:00:00Z',
      files: {},
    }, null, 2));

    try {
      const report = await doctor.runDoctor(root);
      assert.ok(report.added.includes('.claude/hooks/custom_hook.sh'),
        `expected '.claude/hooks/custom_hook.sh' in added; got ${JSON.stringify(report.added)}`);
      assert.equal(report.exitCode, 0, 'added files are informational; /init-project legitimately adds them');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exits 2 (config error) when target has no .baseline-manifest.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doctor-test-'));
    try {
      const report = await doctor.runDoctor(root);
      assert.equal(report.exitCode, 2);
      assert.match(report.error, /manifest/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // supply-chain-hardening — AC-006: doctor --strict mode
  // ===========================================================================

  it('test_when_doctor_strict_on_clean_target_then_exit_zero', async () => {
    const { hashFile } = await import('../src/cli/manifest.js');
    const root = await mkdtemp(join(tmpdir(), 'doctor-strict-clean-'));
    try {
      await writeFile(join(root, 'CLAUDE.md'), '# baseline\n');
      const claudeHash = await hashFile(join(root, 'CLAUDE.md'));
      await mkdir(join(root, '.claude'), { recursive: true });
      await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
        manifest_version: 1,
        generated_at: '2026-01-01T00:00:00Z',
        files: { 'CLAUDE.md': claudeHash },
      }, null, 2));

      const report = await doctor.runDoctor(root, { strict: true });
      assert.equal(report.exitCode, 0, 'strict mode must exit 0 on a clean target');
      assert.equal(report.customized.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_doctor_strict_on_tampered_target_then_exit_one_with_tampered_label', async () => {
    const { hashFile } = await import('../src/cli/manifest.js');
    const root = await mkdtemp(join(tmpdir(), 'doctor-strict-tampered-'));
    try {
      await writeFile(join(root, 'CLAUDE.md'), '# baseline original\n');
      const originalHash = await hashFile(join(root, 'CLAUDE.md'));
      await writeFile(join(root, 'CLAUDE.md'), '# user edited!\n');
      await mkdir(join(root, '.claude'), { recursive: true });
      await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
        manifest_version: 1,
        generated_at: '2026-01-01T00:00:00Z',
        files: { 'CLAUDE.md': originalHash },
      }, null, 2));

      const report = await doctor.runDoctor(root, { strict: true });
      assert.equal(report.exitCode, 1, 'strict mode must exit 1 when any path is customized');
      assert.equal(report.customized.length, 1);
      assert.ok(
        Array.isArray(report.tampered) && report.tampered.length === 1,
        `strict mode must surface a tampered list with shipped/observed sha256; got: ${JSON.stringify(report.tampered)}`
      );
      const entry = report.tampered[0];
      assert.equal(entry.path, 'CLAUDE.md');
      assert.match(entry.shipped, /^[0-9a-f]{64}$/, `shipped must be sha256 hex; got: ${entry.shipped}`);
      assert.match(entry.observed, /^[0-9a-f]{64}$/, `observed must be sha256 hex; got: ${entry.observed}`);
      assert.notEqual(entry.shipped, entry.observed, 'shipped and observed must differ for a tampered file');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_formatReport_renders_tampered_then_prefixes_tampered_label_with_hashes', async () => {
    const report = {
      exitCode: 1,
      matched: [],
      customized: ['CLAUDE.md'],
      missing: [],
      added: [],
      tampered: [
        {
          path: 'CLAUDE.md',
          shipped: 'a'.repeat(64),
          observed: 'b'.repeat(64),
        },
      ],
      manifestVersion: 1,
      generatedAt: '2026-01-01T00:00:00Z',
    };
    const output = doctor.formatReport(report);
    assert.match(
      output,
      /TAMPERED:\s*CLAUDE\.md[\s\S]*shipped=a{64}[\s\S]*observed=b{64}/,
      `formatReport under --strict must prefix tampered lines with "TAMPERED:" + shipped/observed hashes; got:\n${output}`
    );
  });

  it('test_when_doctor_non_strict_on_tampered_target_then_exit_zero_backwards_compat', async () => {
    const { hashFile } = await import('../src/cli/manifest.js');
    const root = await mkdtemp(join(tmpdir(), 'doctor-non-strict-tampered-'));
    try {
      await writeFile(join(root, 'CLAUDE.md'), '# baseline original\n');
      const originalHash = await hashFile(join(root, 'CLAUDE.md'));
      await writeFile(join(root, 'CLAUDE.md'), '# user edited!\n');
      await mkdir(join(root, '.claude'), { recursive: true });
      await writeFile(join(root, '.claude/.baseline-manifest.json'), JSON.stringify({
        manifest_version: 1,
        generated_at: '2026-01-01T00:00:00Z',
        files: { 'CLAUDE.md': originalHash },
      }, null, 2));

      const report = await doctor.runDoctor(root);
      assert.equal(
        report.exitCode,
        0,
        'non-strict (legacy default) mode must continue to treat customized as informational'
      );
      assert.equal(report.customized.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_target_has_v2_manifest_then_doctor_tolerates', async () => {
    const content = '# baseline\n';
    const { hashFile } = await import('../src/cli/manifest.js');
    const root = await makeFakeInstall({ files: { 'CLAUDE.md': content } });
    const claudeHash = await hashFile(join(root, 'CLAUDE.md'));
    await mkdir(join(root, '.claude'), { recursive: true });
    const v2Manifest = {
      manifest_version: 2,
      generated_at: '2026-05-12T00:00:00Z',
      files: { 'CLAUDE.md': claudeHash },
      owners: { skills: { 'intake': 'baseline', 'spec': 'baseline', 'tdd': 'baseline' } },
    };
    await writeFile(
      join(root, '.claude/.baseline-manifest.json'),
      JSON.stringify(v2Manifest, null, 2) + '\n'
    );
    try {
      const report = await doctor.runDoctor(root);
      assert.ok(
        report.exitCode === 0 || report.exitCode === 1,
        `doctor must tolerate v2 manifest (no crash); got exitCode=${report.exitCode}, error=${report.error}`
      );
      assert.equal(
        typeof report.error,
        'undefined',
        `doctor must not raise an error on v2 manifest; got error=${report.error}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// Spec AC-006 — docs/specs/upgrade-no-replay-prompts.md §Behavior #6
// The reconciliation-marker file at .claude/.baseline-reconciliations.json is
// per-target user state, NOT a baseline-shipped file. Doctor's added scan
// (doctor.js:88-93) must exclude it, parallel to the existing exclusion of
// .baseline-manifest.json itself at line 92.
describe('doctor — reconciliation-marker exclusion from added scan', () => {
  it('test_when_doctor_runs_with_marker_file_present_then_marker_not_in_added', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doctor-marker-'));
    try {
      await mkdir(join(root, '.claude'), { recursive: true });
      await writeFile(
        join(root, '.claude/.baseline-manifest.json'),
        JSON.stringify({
          manifest_version: 2,
          generated_at: '2026-05-22T00:00:00Z',
          files: { 'CLAUDE.md': 'deadbeef'.repeat(8) },
        }, null, 2) + '\n',
      );
      await writeFile(join(root, 'CLAUDE.md'), '# baseline\n');
      // The marker file the spec introduces.
      await writeFile(
        join(root, '.claude/.baseline-reconciliations.json'),
        JSON.stringify({
          schema_version: 1,
          reconciliations: {
            'docs/init/seed.md': {
              baseline_version: '0.8.1',
              reconciled_against_template_sha: 'a'.repeat(64),
              reconciled_at: '2026-05-22T15:00:00Z',
            },
          },
        }, null, 2) + '\n',
      );

      const report = await doctor.runDoctor(root);
      assert.ok(Array.isArray(report.added), 'report.added must be an array');
      assert.ok(
        !report.added.includes('.claude/.baseline-reconciliations.json'),
        `marker file must NOT appear in added; got: ${report.added.join(', ')}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
