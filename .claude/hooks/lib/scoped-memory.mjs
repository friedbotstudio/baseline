// Foundation — surface the fact files scoped to a given phase, verbatim first.
// This is the generalization of process_lifecycle_guard's trigger->key->surface
// idiom: instead of a hardcoded Bash-pattern map, the trigger is the workflow
// phase and the scope is declared per fact (frontmatter `scope:`). Delivers
// AC-003 (a captured lesson becomes an active constraint at the decision point).

import { join } from 'node:path';
import { asArray } from './frontmatter-parser.mjs';
import { resolveCategory } from '../../skills/memory-index/lift-fields.mjs';

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

function scopedFactsIn(entries, category, phase) {
  const hits = [];
  for (const entry of entries) {
    if (!asArray(entry.fields.scope).includes(phase)) continue;
    hits.push({
      key: entry.key,
      category,
      verbatim: extractVerbatim(entry.body),
      interpretation: extractInterpretation(entry.body),
      hook: firstHook(entry.body),
    });
  }
  return hits;
}

// Dual-mode: build-template.sh ships consumers a FLAT store, so a shard-only
// reader silently surfaces nothing on a fresh install — the decision-point
// surfacing feature would appear to work while never firing. resolveCategory
// normalizes both shapes; the hit shape (verbatim + interpretation + hook) is
// unchanged, because Art. IX.7 requires the VERBATIM be surfaced, not a summary.
export function surfaceScopedMemory(phase, { rootDir } = {}) {
  if (!phase || !rootDir) return [];
  const memRoot = join(rootDir, '.claude/memory');
  const hits = [];
  for (const category of CANONICAL_CATEGORIES) {
    const { entries } = resolveCategory(memRoot, category);
    hits.push(...scopedFactsIn(entries, category, phase));
  }
  return hits;
}
