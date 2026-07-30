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

// ---------------------------------------------------------------------------
// deriveNames() — the shared NAME enumerator.
//
// deriveCounts() answers "how many"; the four Reference pages need "which ones".
// Both the site's _data layer and audit-baseline's docsite drift check read this
// one function, so the rendered page and the check that verifies it cannot
// disagree about what the roster is.
//
// That shared-oracle design has a failure mode worth naming: if the enumerator
// is wrong, the page and the check are wrong together, consistently, which is
// exactly the shape that hides. So the assertions below re-read disk directly
// instead of trusting the enumerator, and cross-check names against the
// independently-maintained expected-baseline rosters.

import { readdirSync, readFileSync, existsSync } from 'node:fs';

describe('deriveNames() — the roster behind the reference pages', () => {
  it('test_when_names_derived_then_hooks_match_disk_read_independently', async () => {
    const { deriveNames } = await import(DERIVER);
    const onDisk = readdirSync(join(REPO_ROOT, '.claude/hooks'))
      .filter((n) => n.endsWith('.mjs'))
      .map((n) => n.replace(/\.mjs$/, ''))
      .sort();
    assert.deepEqual(deriveNames(REPO_ROOT).hooks, onDisk);
    assert.deepEqual([...EXPECTED_HOOKS].sort(), onDisk, 'roster and disk agree');
  });

  it('test_when_names_derived_then_only_baseline_owned_skills_are_listed', async () => {
    const { deriveNames } = await import(DERIVER);
    const root = join(REPO_ROOT, '.claude/skills');
    const owned = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => {
        const md = join(root, e.name, 'SKILL.md');
        return existsSync(md) && /^owner:\s*baseline\s*$/m.test(readFileSync(md, 'utf8'));
      })
      .map((e) => e.name)
      .sort();
    const names = deriveNames(REPO_ROOT).skills;
    assert.deepEqual(names, owned);
    // Only owner: baseline skills reach the roster; a user-owned skill never does.
    const userOwned = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => {
        const md = join(root, e.name, 'SKILL.md');
        return existsSync(md) && !/^owner:\s*baseline\s*$/m.test(readFileSync(md, 'utf8'));
      })
      .map((e) => e.name);
    for (const skill of userOwned) {
      assert.ok(!names.includes(skill), `${skill} is user-owned and stays off the roster`);
    }
  });

  it('test_when_names_derived_then_tracks_split_selectable_from_sub', async () => {
    const { deriveNames } = await import(DERIVER);
    const selectable = [];
    const sub = [];
    for (const line of readFileSync(join(REPO_ROOT, '.claude/workflows.jsonl'), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const t = JSON.parse(line);
      if (t.selectable === true) selectable.push(t.track_id);
      else if (t.selectable === false) sub.push(t.track_id);
    }
    const n = deriveNames(REPO_ROOT).tracks;
    assert.deepEqual(n.canonical, selectable.sort());
    assert.deepEqual(n.subTracks, sub.sort());
  });

  it('test_when_names_derived_then_mcp_servers_match_the_manifest', async () => {
    const { deriveNames } = await import(DERIVER);
    const m = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));
    assert.deepEqual(deriveNames(REPO_ROOT).mcpServers, Object.keys(m.mcpServers).sort());
  });

  // The invariant that keeps the two exports honest. A name list that disagrees
  // with its own count means one of them is reading disk wrong.
  it('test_when_both_derived_then_every_name_list_length_equals_its_count', async () => {
    const { deriveNames, deriveCounts } = await import(DERIVER);
    const n = deriveNames(REPO_ROOT);
    const c = deriveCounts(REPO_ROOT);
    assert.equal(n.hooks.length, c.hooks, 'hooks');
    assert.equal(n.skills.length, c.skills, 'skills');
    assert.equal(n.commands.length, c.commands, 'commands');
    assert.equal(n.mcpServers.length, c.mcpServers, 'mcpServers');
    assert.equal(n.tracks.canonical.length, c.tracks.canonical, 'canonical tracks');
    assert.equal(n.tracks.subTracks.length, c.tracks.subTracks, 'sub tracks');
  });

  it('test_when_names_derived_then_every_list_is_sorted_and_deduped', async () => {
    const { deriveNames } = await import(DERIVER);
    const n = deriveNames(REPO_ROOT);
    for (const [label, list] of [
      ['hooks', n.hooks], ['skills', n.skills], ['commands', n.commands],
      ['mcpServers', n.mcpServers], ['tracks.canonical', n.tracks.canonical],
    ]) {
      assert.deepEqual(list, [...list].sort(), `${label} must be sorted`);
      assert.equal(list.length, new Set(list).size, `${label} must be deduped`);
    }
  });
});
