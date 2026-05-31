// WF-4b (changelog-classify-from-entries) — changelog actuator active mode.
//
// Active mode used to derive [Unreleased] entries from `previewProjectedVersion`
// (semantic-release analyzing git-log commits since the last tag). But Phase
// 11.5 runs BEFORE /commit, so those are already-committed commits, not the
// impending change. Active mode now takes a caller-supplied `--entries-file`
// (JSON array of {section, body, breaking?}) and renders exactly those.
//
// RED until changelog.mjs gains --entries-file (parseArgs strict:true currently
// rejects the unknown option). Preview mode (--preview-only) is unchanged and is
// guarded by the existing preview-only_test.sh — not duplicated here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTUATOR = join(REPO_ROOT, '.claude/skills/changelog/changelog.mjs');

const CHANGELOG_FIXTURE = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '# [0.1.0](u) (2026-01-01)',
  '',
  '* feat seed',
  '',
].join('\n');

// A tmp project with a CHANGELOG.md and a FRESH commit_consent token (so the
// actuator's checkConsent passes). `entries` (when provided) is written to
// <proj>/entries.json. Returns paths; caller spawns the actuator.
function withProject(entries, fn) {
  const proj = mkdtempSync(join(tmpdir(), 'clog-ef-'));
  try {
    mkdirSync(join(proj, '.claude/state'), { recursive: true });
    writeFileSync(join(proj, 'CHANGELOG.md'), CHANGELOG_FIXTURE);
    writeFileSync(join(proj, '.claude/state/commit_consent'), `${Math.floor(Date.now() / 1000)}\n`);
    let entriesPath = null;
    if (entries !== undefined) {
      entriesPath = join(proj, 'entries.json');
      writeFileSync(entriesPath, typeof entries === 'string' ? entries : JSON.stringify(entries));
    }
    return fn({ proj, entriesPath, changelog: join(proj, 'CHANGELOG.md') });
  } finally {
    rmSync(proj, { recursive: true, force: true });
  }
}

function runActuator(proj, extraArgs) {
  return spawnSync('node', [ACTUATOR, '--slug', 'x', '--project-root', proj, ...extraArgs], {
    encoding: 'utf8',
  });
}

describe('changelog actuator — caller-supplied --entries-file (WF-4b)', () => {
  it('test_when_active_mode_with_entries_file_then_appends_exactly_those_entries', () => {
    withProject([{ section: 'Fixed', body: 'my real fix', breaking: false }], ({ proj, entriesPath, changelog }) => {
      const r = runActuator(proj, ['--entries-file', entriesPath]);
      assert.equal(r.status, 0, `must exit 0.\nstdout:${r.stdout}\nstderr:${r.stderr}`);
      const out = readFileSync(changelog, 'utf8');
      const unreleased = out.slice(out.indexOf('## [Unreleased]'), out.search(/^#{1,2} \[\d/m));
      assert.match(unreleased, /### Fixed\n\n- my real fix/, 'the supplied entry must land under [Unreleased]');
      assert.doesNotMatch(unreleased, /feat seed/, 'must NOT inject git-log-derived commit subjects');
      assert.match(out, /^# \[0\.1\.0\]/m, 'version block preserved');
    });
  });

  it('test_when_active_mode_without_entries_file_then_errors_without_semrel', () => {
    withProject(undefined, ({ proj, changelog }) => {
      const before = readFileSync(changelog, 'utf8');
      const r = runActuator(proj, []);
      assert.notEqual(r.status, 0, 'active mode without --entries-file must exit non-zero');
      assert.match((r.stderr || '') + (r.stdout || ''), /entries-file/i, 'error must name the missing --entries-file');
      assert.equal(readFileSync(changelog, 'utf8'), before, 'CHANGELOG.md must be unchanged');
    });
  });

  it('test_when_entries_file_malformed_then_errors_no_write', () => {
    // An entry missing `body`.
    withProject([{ section: 'Fixed' }], ({ proj, entriesPath, changelog }) => {
      const before = readFileSync(changelog, 'utf8');
      const r = runActuator(proj, ['--entries-file', entriesPath]);
      assert.notEqual(r.status, 0, 'malformed entries-file must exit non-zero');
      assert.equal(readFileSync(changelog, 'utf8'), before, 'CHANGELOG.md must be byte-unchanged on validation failure');
    });
  });

  it('test_when_entries_file_empty_array_then_unreleased_emptied_and_version_blocks_preserved', () => {
    withProject([], ({ proj, entriesPath, changelog }) => {
      const r = runActuator(proj, ['--entries-file', entriesPath]);
      assert.equal(r.status, 0, `empty entries must exit 0.\nstderr:${r.stderr}`);
      const out = readFileSync(changelog, 'utf8');
      const unreleased = out.slice(out.indexOf('## [Unreleased]'), out.search(/^#{1,2} \[\d/m));
      assert.doesNotMatch(unreleased, /^### /m, 'empty entries → no ### sections in [Unreleased]');
      assert.match(out, /^# \[0\.1\.0\]/m, 'version block preserved');
    });
  });
});
