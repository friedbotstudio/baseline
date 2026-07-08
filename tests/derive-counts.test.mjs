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
import {
  EXPECTED_HOOKS, EXPECTED_COMMANDS, EXPECTED_AGENTS, EXPECTED_MCP_SERVERS,
  DEFAULT_MCP_SERVERS, EXPECTED_TRACKS, CANONICAL_MEMORY_FILES,
} from '../.claude/skills/audit-baseline/expected-baseline.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DERIVER = join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs');
const require = createRequire(import.meta.url);

describe('AC-001 — deriveCounts() reflects the artifacts on disk', () => {
  it('test_when_deriveCounts_then_matches_disk', async () => {
    const { deriveCounts, SKILL_CATEGORIES } = await import(DERIVER);
    const c = deriveCounts(REPO_ROOT);
    const skillTotal = Object.values(SKILL_CATEGORIES).reduce((a, b) => a + b, 0);
    assert.equal(c.skills, skillTotal, 'baseline skills match the category breakdown');
    assert.equal(c.hooks, EXPECTED_HOOKS.size, 'top-level hooks match the declared roster');
    assert.equal(c.commands, EXPECTED_COMMANDS.size, 'command files match the declared roster');
    assert.equal(c.subagents, EXPECTED_AGENTS.size, 'subagents match the declared roster');
    assert.deepEqual(c.tracks, EXPECTED_TRACKS, 'tracks match the declared shape');
    assert.equal(c.memoryFiles, CANONICAL_MEMORY_FILES.size, 'canonical memory files match the roster');
    // The baseline still SHIPS 3 MCP servers in .mcp.json: the required set
    // (EXPECTED_MCP_SERVERS) plus the default §2.5 current-docs satisfier
    // (DEFAULT_MCP_SERVERS = context7, optional/replaceable per Article VI.5).
    assert.equal(c.mcpServers, EXPECTED_MCP_SERVERS.size + DEFAULT_MCP_SERVERS.size, 'mcp servers on disk = required + default roster');
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
    const { deriveCounts, SKILL_CATEGORIES } = await import(DERIVER);
    const skillTotal = Object.values(SKILL_CATEGORIES).reduce((a, b) => a + b, 0);
    assert.equal(data.commands, EXPECTED_COMMANDS.size, 'commands derived from the roster');
    assert.equal(data.hooks.total, EXPECTED_HOOKS.size);
    assert.equal(data.skills.total, skillTotal);
    assert.equal(data.subagents.total, EXPECTED_AGENTS.size);
    const c = deriveCounts(REPO_ROOT);
    assert.equal(data.tracks.canonical, c.tracks.canonical, 'site tracks match deriver');
  });
});
