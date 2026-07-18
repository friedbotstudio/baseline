// Shared audit context — computes the io helpers, expected rosters, and on-disk
// inventory once, so each check module composes from a single frozen ctx instead
// of reaching for raw fs primitives. Foundation layer: the one place disk state
// is read into memory; the check modules are pure functions over this object.
import { existsSync, readFileSync, readdirSync, statSync, accessSync, constants as fsc } from 'node:fs';
import { join } from 'node:path';
import {
  EXPECTED_HOOKS, EXPECTED_AGENTS, EXPECTED_COMMANDS, EXPECTED_MEMORY_FILES,
  EXPECTED_MCP_SERVERS, DEFAULT_MCP_SERVERS,
} from '../expected-baseline.mjs';
import { EXEMPT_RELPATHS, hasDerivedHeader } from '../../../hooks/lib/derived-header.mjs';
import { checkMemoryShape } from '../memory-shape.mjs';
import { deriveCounts, SKILL_CATEGORIES } from '../derive-counts.mjs';
import { toInt } from './surface-helpers.mjs';

function isValidPreamble(text) {
  if (!text.startsWith('---')) return [false, 'missing frontmatter'];
  const remainder = text.slice(3);
  if (remainder.includes('\n---\n') || remainder.endsWith('\n---')) return [true, ''];
  return [false, 'malformed frontmatter: missing closing separator'];
}

export function buildContext({ root, skipHashCheck }) {
  const readText = (rel) => { const p = join(root, rel); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
  const readJson = (rel) => { const t = readText(rel); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };
  const listDir = (rel, opts = {}) => {
    const p = join(root, rel);
    if (!existsSync(p)) return [];
    try {
      const entries = readdirSync(p, { withFileTypes: true });
      return opts.dirsOnly
        ? entries.filter(e => e.isDirectory()).map(e => e.name)
        : entries.filter(e => e.isFile()).map(e => e.name);
    } catch { return []; }
  };
  const loadManifest = () => {
    for (const rel of ['.claude/manifest.json', 'obj/template/.claude/manifest.json']) {
      const p = join(root, rel);
      if (!existsSync(p)) continue;
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
    }
    return null;
  };
  const readSkillOwner = (slug) => {
    const p = join(root, '.claude', 'skills', slug, 'SKILL.md');
    if (!existsSync(p)) return null;
    const fm = readFileSync(p, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
    if (!fm) return null;
    const m = fm[1].match(/^owner:\s*(\S+)\s*$/m);
    return m ? m[1] : null;
  };

  const pj = readJson('.claude/project.json');
  const additions = (pj && pj.additions) || {};
  const addAgents = new Set(additions.agents || []);
  const addSkills = new Set(additions.skills || []);
  const addHooks = new Set(additions.hooks || []);

  const diskHooks = new Set(listDir('.claude/hooks').filter(n => n.endsWith('.sh') || n.endsWith('.mjs')).map(n => n.replace(/\.(sh|mjs)$/, '')));
  const diskAgents = new Set(listDir('.claude/agents').filter(n => n.endsWith('.md')).map(n => n.replace(/\.md$/, '')));
  const diskSkills = new Set(listDir('.claude/skills', { dirsOnly: true }));
  const diskCommands = new Set(listDir('.claude/commands').filter(n => n.endsWith('.md')).map(n => n.replace(/\.md$/, '')));
  const diskBaselineHooks = new Set([...diskHooks].filter(h => !addHooks.has(h)));
  const diskBaselineAgents = new Set([...diskAgents].filter(a => !addAgents.has(a)));
  const diskBaselineSkills = new Set([...diskSkills].filter(s => readSkillOwner(s) === 'baseline'));

  const srcExists = existsSync(join(root, 'src')) && statSync(join(root, 'src')).isDirectory();
  const consumerManifest = existsSync(join(root, '.claude', 'manifest.json'));

  return Object.freeze({
    root, skipHashCheck, fsc,
    readText, readJson, listDir, loadManifest, readSkillOwner, isValidPreamble, toInt,
    exists: (rel) => existsSync(join(root, rel)),
    isDir: (rel) => existsSync(join(root, rel)) && statSync(join(root, rel)).isDirectory(),
    accessX: (rel) => { try { accessSync(join(root, rel), fsc.X_OK); return true; } catch { return false; } },
    hasDerivedHeader, EXEMPT_RELPATHS, checkMemoryShape, deriveCounts, SKILL_CATEGORIES,
    EXPECTED_HOOKS, EXPECTED_AGENTS, EXPECTED_COMMANDS, EXPECTED_MEMORY_FILES, EXPECTED_MCP_SERVERS, DEFAULT_MCP_SERVERS,
    pj, additions, addAgents, addSkills, addHooks,
    diskHooks, diskAgents, diskSkills, diskCommands,
    diskBaselineHooks, diskBaselineAgents, diskBaselineSkills,
    seedText: readText('docs/init/seed.md'),
    settingsText: readText('.claude/settings.json'),
    srcExists, skipSrc: !srcExists, consumerManifest,
  });
}
