// brainstorm-and-codesign — AC-011
//
// archive.sh PAIRS array contains a row mapping docs/brief/<slug>.md -> brief.md
// in the archive bundle. When the archive runs with a brief present, brief.md
// appears in the bundle alongside intake.md, scout.md, etc. When no brief
// exists, archive.sh treats the row as a no-op (idempotent missing-source).
//
// SUT: .claude/skills/archive/archive.sh
//      .claude/skills/archive/SKILL.md (documentation parity)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/archive/archive.sh');

describe('archive.sh PAIRS includes brief.md (AC-011)', () => {
  it('test_when_archive_sh_inspected_then_pairs_array_contains_brief_row', async () => {
    const content = await fs.readFile(SCRIPT, 'utf8');
    assert.ok(/docs\/brief\/\$SLUG\.md[\s]+brief\.md/.test(content),
      'archive.sh PAIRS must include "docs/brief/$SLUG.md  brief.md" row');
  });

  it('test_when_archive_sh_skill_md_inspected_then_brief_row_documented', async () => {
    const skillMd = await fs.readFile(
      path.join(REPO_ROOT, '.claude/skills/archive/SKILL.md'), 'utf8'
    );
    assert.ok(/docs\/brief\/.*brief\.md/.test(skillMd),
      'archive/SKILL.md table must document the new brief.md mapping');
  });

  it('test_when_archive_sh_runs_with_brief_present_then_brief_md_in_bundle', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-brief-'));
    try {
      // Initialize a git repo so `git mv` works
      execFileSync('git', ['init', '-q'], { cwd: tmp });
      execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: tmp });
      execFileSync('git', ['config', 'user.name', 'test'], { cwd: tmp });

      // Seed docs/brief/foo.md + commit
      await fs.mkdir(path.join(tmp, 'docs/brief'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'docs/brief/foo.md'), '# brief\n');
      execFileSync('git', ['add', '-A'], { cwd: tmp });
      execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });

      execFileSync('bash', [SCRIPT, 'foo'], { cwd: tmp, env: { ...process.env, CLAUDE_PROJECT_DIR: tmp } });

      // Find the bundle (any date dir works)
      const archiveRoot = path.join(tmp, 'docs/archive');
      const dates = await fs.readdir(archiveRoot);
      assert.equal(dates.length, 1, 'one date subdir created');
      const bundlePath = path.join(archiveRoot, dates[0], 'foo', 'brief.md');
      const exists = await fs.access(bundlePath).then(() => true).catch(() => false);
      assert.equal(exists, true, 'brief.md present in archive bundle');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_archive_sh_runs_without_brief_then_no_error', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-no-brief-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: tmp });
      execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: tmp });
      execFileSync('git', ['config', 'user.name', 'test'], { cwd: tmp });
      await fs.mkdir(path.join(tmp, 'docs/intake'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'docs/intake/foo.md'), '# intake\n');
      execFileSync('git', ['add', '-A'], { cwd: tmp });
      execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });

      // Should succeed (exit 0) with intake archived but no brief.
      execFileSync('bash', [SCRIPT, 'foo'], { cwd: tmp, env: { ...process.env, CLAUDE_PROJECT_DIR: tmp } });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
