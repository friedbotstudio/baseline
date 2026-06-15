// WF-5 (governance-count-single-source) — the shared deriver + computed site data.
//
// deriveCounts() is the single source of truth for governance counts; audit.mjs
// and the site _data both consume it. numToWord() renders the spelled-out forms
// so a word surface can't drift from its numeral. site-src/_data/baseline.cjs
// becomes a computed data file (was a static JSON carrying a stale commands:5).
//
// RED until: .claude/skills/audit-baseline/derive-counts.mjs exists and exports
// deriveCounts + numToWord; site-src/_data/baseline.cjs replaces baseline.json.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DERIVER = join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs');
const require = createRequire(import.meta.url);

describe('AC-001 — deriveCounts() reflects the artifacts on disk', () => {
  it('test_when_deriveCounts_then_matches_disk', async () => {
    const { deriveCounts } = await import(DERIVER);
    const c = deriveCounts(REPO_ROOT);
    assert.equal(c.skills, 42, 'baseline skills');
    assert.equal(c.hooks, 24, 'top-level hooks');
    assert.equal(c.commands, 6, 'command files (incl init-project-doctor)');
    assert.equal(c.subagents, 1, 'subagents');
    assert.deepEqual(c.tracks, { canonical: 7, subTracks: 2 }, 'tracks');
    assert.equal(c.memoryFiles, 7, 'canonical memory files');
    assert.equal(c.mcpServers, 3, 'mcp servers');
  });
});

describe('AC-002 — numToWord() renders the spelled-out forms for the values in play', () => {
  it('test_when_numToWord_known_values', async () => {
    const { numToWord } = await import(DERIVER);
    assert.equal(numToWord(1), 'one');
    assert.equal(numToWord(6), 'six');
    assert.equal(numToWord(22), 'twenty-two');
    assert.equal(numToWord(40), 'forty');
    assert.throws(() => numToWord(99), 'unmapped value must throw, not emit a number');
  });
});

describe('AC-002 — site _data is computed from the deriver (no stale literal)', () => {
  it('test_when_site_baseline_data_then_commands_is_6', async () => {
    const mod = require(join(REPO_ROOT, 'site-src/_data/baseline.cjs'));
    const data = await (typeof mod === 'function' ? mod() : mod);
    assert.equal(data.commands, 6, 'commands derived to 6 (was a static 5)');
    assert.equal(data.hooks.total, 24);
    assert.equal(data.skills.total, 42);
    assert.equal(data.subagents.total, 1);
    const { deriveCounts } = await import(DERIVER);
    const c = deriveCounts(REPO_ROOT);
    assert.equal(data.tracks.canonical, c.tracks.canonical, 'site tracks match deriver');
  });
});
