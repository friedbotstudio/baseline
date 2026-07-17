// Foundation — surface the fact files scoped to a given phase, verbatim first.
// This is the generalization of process_lifecycle_guard's trigger->key->surface
// idiom: instead of a hardcoded Bash-pattern map, the trigger is the workflow
// phase and the scope is declared per fact (frontmatter `scope:`). Delivers
// AC-003 (a captured lesson becomes an active constraint at the decision point).

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, asArray } from './frontmatter-parser.mjs';

const CANONICAL_CATEGORIES = [
  'landmarks', 'libraries', 'decisions', 'landmines',
  'conventions', 'pending-questions', 'backlog',
];

function extractVerbatim(body) {
  return body
    .split('\n')
    .filter((line) => line.trim().startsWith('>'))
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n')
    .trim();
}

function extractInterpretation(body) {
  return body
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
}

function firstHook(body) {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#')) continue;
    return trimmed.replace(/^-\s*/, '');
  }
  return '';
}

function scopedFactsIn(dir, category, phase) {
  const hits = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const { frontmatter, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
    if (!asArray(frontmatter.scope).includes(phase)) continue;
    hits.push({
      key: frontmatter.key || file.replace(/\.md$/, ''),
      category,
      verbatim: extractVerbatim(body),
      interpretation: extractInterpretation(body),
      hook: firstHook(body),
    });
  }
  return hits;
}

export function surfaceScopedMemory(phase, { rootDir } = {}) {
  if (!phase || !rootDir) return [];
  const memRoot = join(rootDir, '.claude/memory');
  const hits = [];
  for (const category of CANONICAL_CATEGORIES) {
    const dir = join(memRoot, category);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    hits.push(...scopedFactsIn(dir, category, phase));
  }
  return hits;
}
