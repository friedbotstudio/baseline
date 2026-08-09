// shard-migration-repair — AC-015 (sweep refuses while the corpus is unrepaired).
// Covers §Behavior #3 and Rollout prerequisite 1.
//
// The source backlog entry carries a binding sequencing constraint: do NOT run a
// stale sweep before the re-lift lands. Today the two readers disagree — the
// session-start hook (frontmatter-only, by design) sees 46 stale, sweep.mjs (which
// reads frontmatter AND body) sees 156. Curating against the 156-entry set while
// every other surface believes 46 would churn entries without fixing the invisibility.
//
// The constraint cannot live in prose: two sweep modes fire AUTOMATICALLY —
// stamp-closure from /commit Step 2.7, auto-close from /memory-sync Step 0. So the
// guard belongs inside sweep.mjs itself, refusing every mode until the corpus is clean.
//
// RED until: sweep.mjs exports assertRelifted and calls it before every mode.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tryImport, writeShard, REPO_ROOT } from './helpers/memory-fixtures.mjs';

const SWEEP_ABS = join(REPO_ROOT, '.claude/skills/memory-sync/sweep.mjs');
const SWEEP_REL = '.claude/skills/memory-sync/sweep.mjs';
const MIGRATE_REL = '.claude/skills/memory-index/migrate.mjs';

const MODES = ['auto-close', 'stale-sweep', 'prose-scan', 'backlog-decay', 'stamp-closure'];

function seedCorpus(prefix, { stranded }) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  writeShard(memDir, 'backlog', 'some-open-entry', {
    key: 'some-open-entry',
    fields: stranded ? { status: 'open' } : { status: 'open', 'verified-at': 'abc1234' },
    bodyLines: stranded
      ? ['- Intent: do a thing', '- Verified-at: abc1234']
      : ['- Intent: do a thing'],
  });
  return { root, memDir };
}

describe('sweep precondition — refuses an unrepaired corpus (AC-015)', () => {
  it('test_when_bullets_still_stranded_then_every_sweep_mode_refuses', async () => {
    const sweep = await tryImport(SWEEP_REL);
    assert.ok(sweep?.assertRelifted, `${SWEEP_REL} must export assertRelifted`);

    const bad = seedCorpus('sweep-pre-', { stranded: true });
    try {
      assert.throws(
        () => sweep.assertRelifted(bad.memDir),
        /relift|stranded|precondition/i,
        'a stranded allowlisted bullet is a hard precondition failure',
      );

      for (const mode of MODES) {
        const args = [SWEEP_ABS, '--mode', mode, '--memory-dir', bad.memDir];
        if (mode === 'stamp-closure') args.push('--backlog-keys', 'some-open-entry');
        const res = spawnSync('node', args, { encoding: 'utf8' });
        assert.notEqual(res.status, 0,
          `--mode ${mode} must refuse while the corpus is unrepaired (stamp-closure and auto-close fire automatically from /commit and /memory-sync)`);
        assert.match(`${res.stderr}${res.stdout}`, /relift|stranded|precondition/i,
          `--mode ${mode} must name the precondition rather than failing opaquely`);
      }
    } finally {
      rmSync(bad.root, { recursive: true, force: true });
    }

    const good = seedCorpus('sweep-post-', { stranded: false });
    try {
      assert.doesNotThrow(() => sweep.assertRelifted(good.memDir),
        'a repaired corpus passes the precondition and sweeps proceed normally');
      const res = spawnSync('node', [SWEEP_ABS, '--mode', 'stale-sweep', '--memory-dir', good.memDir], { encoding: 'utf8' });
      assert.equal(res.status, 0, `a repaired corpus sweeps cleanly; stderr: ${res.stderr}`);
    } finally {
      rmSync(good.root, { recursive: true, force: true });
    }
  });
});
