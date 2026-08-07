// Domain — the path-keyed surfacing trigger (spec ticket C, epic decision D3).
//
// The defect this closes: PHASE_BY_PREFIX in process_lifecycle_guard has no
// non-`docs/` entry, so phaseForPath() returns null for every source path and the
// guard allows immediately. Editing a source file therefore surfaced NOTHING, by
// construction — which is why the reason a piece of code is shaped a given way was
// unreachable at exactly the moment someone was about to change it.
//
// This is a SECOND trigger beside the phase one, not a widening of it. `scope:`
// keeps meaning workflow phases and `scopedFactsIn` stays a straight membership
// test; `governs:` carries path globs. Two clean vocabularies at the cost of one
// code path, rather than one field holding two kinds of value with every reader
// discriminating.
//
// Advisory and fail-open throughout: every path returns [] rather than throwing,
// matching the existing surfaceScopedMemory contract so an unmigrated consumer
// install no-ops instead of breaking.

import { join } from 'node:path';

import { readLoadBearing } from '../../skills/memory-index/categories.mjs';
import { resolveCategory } from '../../skills/memory-index/lift-fields.mjs';
import { resolveLookup } from '../../skills/memory-index/resolve.mjs';
import { extractVerbatim, extractInterpretation, firstHook } from './entry-body.mjs';

const VERBATIM_LIMIT = 3;

// Hydrate one structural match into a surfaceable hit. The index answers WHICH
// entries govern a path and deliberately carries no justification (AC-005); the
// verbatim, the interpretation and the load-bearing marker are added here, where
// reasons belong.
function hydrate(memRoot, { key, category }) {
  const { entries } = resolveCategory(memRoot, category);
  const entry = entries.find((e) => e.key === key);
  if (!entry) return null;
  return {
    key,
    category,
    load_bearing: readLoadBearing(entry.fields),
    verbatim: extractVerbatim(entry.body),
    interpretation: extractInterpretation(entry.body),
    hook: firstHook(entry.body),
  };
}

// Spec §Behavior #1: Governed -> Index : resolveLookup(by_path). This originally
// re-scanned every category and matched globs itself, which left the derived index
// (epic decision D8) unreachable code while the sequence diagram claimed otherwise.
// Going through the index is what makes the diagram true and gives rebuild-on-stale
// for free.
export function surfaceGovernedMemory(filePath, { rootDir } = {}) {
  if (!filePath || !rootDir) return [];
  const memRoot = join(rootDir, '.claude/memory');

  let matches;
  try {
    matches = resolveLookup('by_path', filePath, { rootDir });
  } catch {
    return [];
  }

  const hits = [];
  for (const match of matches) {
    // Per-ENTRY isolation. A malformed shard is skipped, never fatal — its siblings
    // still surface (security review F-1: a per-category try silently suppressed
    // every decision in the category).
    try {
      const hit = hydrate(memRoot, match);
      if (hit) hits.push(hit);
    } catch {
      continue;
    }
  }
  return hits;
}

// The corpus ascent — the THIRD surfacing trigger, beside the phase one and the
// path-governed one above.
//
// `resolveLookup('by_path', …)` answers two different questions under one kind.
// Without `specDir` it returns an ARRAY of the memory entries whose `governs:`
// globs match the path; with `specDir` it returns `{elements, concepts}` — the
// walk UP from a touched path to the concepts that own it. Passing specDir to the
// call above would swap one answer for the other and break `hydrate`, which
// iterates the array form. So this is a separate function, and `Array.isArray` is
// the discriminator.
//
// That discriminator also absorbs every negative: an absent `memory.architecture_map`
// flag and an unreadable corpus both fall back to the array form inside
// `resolveLookup`, so they need no separate check here.
//
// Returns `null` on every negative path rather than an empty shape, so the caller
// has one falsy check instead of four.
export function surfaceCorpusLocation(filePath, { rootDir, specDir } = {}) {
  if (!filePath || !rootDir || !specDir) return null;
  let hit;
  try {
    hit = resolveLookup('by_path', filePath, { rootDir, specDir });
  } catch {
    return null;
  }
  if (Array.isArray(hit) || !hit?.elements?.length) return null;
  return { elements: hit.elements, concepts: hit.concepts ?? [] };
}

export function renderCorpusLocation({ elements, concepts }) {
  const anchored = elements
    .map((el) => `- \`${el.id}\` — ${el.title || el.id} (\`${el.anchor}\`)`)
    .join('\n');
  const owners = concepts.length
    ? concepts.map((c) => `\`${c.id}\``).join(', ')
    : 'none — this element belongs to no concept';
  return `--- corpus location (docs/system) ---\n${anchored}\nOwning concept(s): ${owners}`;
}

// Above three hits the bodies stop being readable and start being a wall, so a
// summary plus a walkable entry point replaces them (AC-007). Same threshold and
// same reasoning as the phase trigger's existing VERBATIM_LIMIT.
export function renderGovernedHits(hits) {
  if (hits.length <= VERBATIM_LIMIT) {
    return { mode: 'verbatim', hits, entryPoint: null };
  }
  return {
    mode: 'summary',
    hits,
    entryPoint: hits[0].key,
    summary: hits.map((hit) => `- ${hit.category}/${hit.key} — ${hit.hook}`).join('\n'),
  };
}
