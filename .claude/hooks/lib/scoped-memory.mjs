// Foundation — surface the fact files scoped to a given phase, verbatim first.
// This is the generalization of process_lifecycle_guard's trigger->key->surface
// idiom: instead of a hardcoded Bash-pattern map, the trigger is the workflow
// phase and the scope is declared per fact (frontmatter `scope:`). Delivers
// AC-003 (a captured lesson becomes an active constraint at the decision point).

import { join } from 'node:path';
import { asArray } from './frontmatter-parser.mjs';
import { extractVerbatim, extractInterpretation, firstHook } from './entry-body.mjs';
import { pathOverlapsWriteSet } from './write-set-profile.mjs';
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
      paths: entryPaths(entry),
      verbatim: extractVerbatim(entry.body),
      interpretation: extractInterpretation(entry.body),
      hook: firstHook(entry.body),
    });
  }
  return hits;
}

// The path signal a hit can be narrowed by. `governs:` is the declared answer;
// a landmark's `key:` is a repo path by convention (`<path>:<line>`), which is
// what makes the 92 category-default landmarks filterable at all — only 8 of
// them declare `governs:`.
//
// An entry with neither returns [], and narrowToWriteSurface keeps it. A missing
// signal is not evidence of irrelevance, and hiding a fact for lack of metadata
// is the one failure this filter must never produce.
export function entryPaths(entry) {
  const governs = asArray(entry?.fields?.governs);
  if (governs.length) return governs;
  const key = entry?.key;
  if (typeof key !== 'string' || !key.includes('/')) return [];
  return [key.replace(/:\d+$/, '')];
}

function narrowToWriteSurface(hits, writeSurface) {
  if (!Array.isArray(writeSurface) || !writeSurface.length) return hits;
  return hits.filter((hit) => {
    if (!hit.paths.length) return true;
    return hit.paths.some((path) => pathOverlapsWriteSet(path, writeSurface));
  });
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
// `writeSurface` is optional and its absence is the fail-open path, so every
// existing two-argument call site keeps working unchanged. Narrowing runs
// between collection and ranking: it drops hits, and never reorders survivors.
export function surfaceScopedMemory(phase, { rootDir, writeSurface } = {}) {
  if (!phase || !rootDir) return [];
  const memRoot = join(rootDir, '.claude/memory');
  const hits = [];
  for (const category of CANONICAL_CATEGORIES) {
    const { entries } = resolveCategory(memRoot, category);
    hits.push(...scopedFactsIn(entries, category, phase));
  }
  return narrowToWriteSurface(hits, writeSurface).sort(byLoadBearingThenKey);
}
