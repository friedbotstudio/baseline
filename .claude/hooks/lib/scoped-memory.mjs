// Foundation — surface the fact files scoped to a given phase, verbatim first.
// This is the generalization of process_lifecycle_guard's trigger->key->surface
// idiom: instead of a hardcoded Bash-pattern map, the trigger is the workflow
// phase and the scope is declared per fact (frontmatter `scope:`). Delivers
// AC-003 (a captured lesson becomes an active constraint at the decision point).

import { join } from 'node:path';
import { asArray } from './frontmatter-parser.mjs';
import { extractVerbatim, extractInterpretation, firstHook } from './entry-body.mjs';
import { resolveCategory } from '../../skills/memory-index/lift-fields.mjs';

import { CANONICAL as CANONICAL_CATEGORIES, readLoadBearing } from '../../skills/memory-index/categories.mjs';

export { CANONICAL_CATEGORIES };

function scopedFactsIn(entries, category, phase) {
  const hits = [];
  for (const entry of entries) {
    if (!asArray(entry.fields.scope).includes(phase)) continue;
    hits.push({
      key: entry.key,
      category,
      load_bearing: readLoadBearing(entry.fields),
      verbatim: extractVerbatim(entry.body),
      interpretation: extractInterpretation(entry.body),
      hook: firstHook(entry.body),
    });
  }
  return hits;
}

// Ranking, not filtering. `process_lifecycle_guard` renders at most INDEX_CAP rows,
// so on a phase with 107 hits the question is never "how many" but "which 15 get
// named". Load-bearing entries — the ones a maintainer breaks by accident — lead.
//
// Sorting lives HERE and nowhere else. The guard is not the only consumer, and two
// sort sites would eventually disagree about what leads. Key-ascending is the
// tiebreak so the order is deterministic rather than filesystem-dependent.
function byLoadBearingThenKey(a, b) {
  if (a.load_bearing !== b.load_bearing) return a.load_bearing ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
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
  return hits.sort(byLoadBearingThenKey);
}
