// Domain — the derived index (spec ticket C, epic decision D8).
//
// The index is DERIVED and regenerated, never stored as truth. A stored index can
// drift from its source; a derived one cannot, because it re-reads its source. That
// is the cheapest available answer to the honesty hazard the intake names. There is
// nothing to invalidate because there is nothing cached: every lookup walks the
// store. See the measurement note below for why that is also the faster option.
//
// Reverse lookups only. A structural lookup answers "which entries govern this
// path / rest on this constraint" and carries NO justification semantics (AC-005) —
// reasons belong to the surfacing leg, which composes this one.

import { readFileSync, writeFileSync } from 'node:fs';

import { CANONICAL, asList } from './categories.mjs';
import { resolveCategory } from './lift-fields.mjs';
import { everyShardPath, matchesGlob } from './index-io.mjs';
import { architectureMapEnabled } from '../workspace/flags.mjs';
import { readConcepts } from '../workspace/concepts.mjs';
import { readAll } from '../workspace/store.mjs';

const LOOKUP_KINDS = new Set(['by_path', 'by_constraint', 'by_element', 'by_concept']);

// No cache, deliberately. Measured 2026-08-04 on the live 239-entry store: a full
// walk costs 17.5 ms, while a HEAD-keyed cached lookup cost ~29 ms because
// `gitHead()` shells out to git on every call. The cache was slower than no cache
// AND wrong: on a non-git tree `gitHead()` returns '' forever, so `built_at` never
// changed and the index never rebuilt. A shard added mid-session was invisible.
//
// This resolves the spec's open question ("measure before choosing between
// build-on-demand and build-at-session-start") in favour of build-on-demand, and
// keeps epic decision D8 honest: a derived index cannot drift from its source only
// if it genuinely re-reads its source.

function indexEntries(memDir) {
  const out = [];
  for (const category of CANONICAL) {
    const { entries } = resolveCategory(memDir, category);
    for (const entry of entries) {
      out.push({
        key: entry.key,
        category,
        governs: asList(entry.fields.governs),
        rests_on: asList(entry.fields.rests_on),
        element: entry.fields.element ?? null,
      });
    }
  }
  return out;
}

function currentIndex(rootDir) {
  return { rootDir, entries: indexEntries(`${rootDir}/.claude/memory`) };
}

// A structural match carries key + category only — deliberately no verbatim and no
// interpretation (AC-005). The surfacing leg adds those.
function structural({ key, category }) {
  return { key, category };
}

// The architecture-map layer is additive and OPT-IN. `memDir` is passed only by the
// new consumers, so every historical `(kind, needle, {rootDir})` call site keeps its
// exact return SHAPE — a bare array — and is untouched by this extension.
function conceptLayer(memDir, rootDir) {
  if (!memDir || !architectureMapEnabled({ rootDir })) return null;
  return { concepts: readConcepts(memDir), elements: readAll(memDir).elements };
}

function resolveConcept(needle, { rootDir, memDir }) {
  const layer = conceptLayer(memDir, rootDir);
  if (!layer) return [];
  const concept = layer.concepts.find((c) => c.id === needle);
  if (!concept) return [];
  // Only matched members are read. Descending an unmatched branch is precisely the
  // whole-codebase re-scout this layer exists to replace.
  const members = new Set(concept.members);
  return { concepts: [concept], elements: layer.elements.filter((el) => members.has(el.id)) };
}

// The maintenance direction: enter at a touched path, match the file anchor first,
// then the enclosing globs, then walk UP to the concepts that own what matched.
function resolveTouchedPath(needle, { rootDir, memDir }) {
  const layer = conceptLayer(memDir, rootDir);
  if (!layer) return [];
  const exact = layer.elements.filter((el) => el.anchor === needle);
  const enclosing = layer.elements.filter((el) => el.anchor !== needle && matchesGlob(el.anchor, needle));
  const elements = [...exact, ...enclosing];
  const ids = new Set(elements.map((el) => el.id));
  return {
    elements,
    concepts: layer.concepts.filter((c) => c.members.some((m) => ids.has(m))),
  };
}

export function resolveLookup(kind, needle, { rootDir, memDir } = {}) {
  if (!LOOKUP_KINDS.has(kind) || !rootDir || !needle) return [];
  if (kind === 'by_concept') return resolveConcept(needle, { rootDir, memDir });
  if (kind === 'by_path' && memDir) return resolveTouchedPath(needle, { rootDir, memDir });
  const { entries } = currentIndex(rootDir);
  if (kind === 'by_constraint') {
    return entries.filter((e) => e.rests_on.includes(needle)).map(structural);
  }
  if (kind === 'by_element') {
    return entries.filter((e) => e.element === needle).map(structural);
  }
  return entries
    .filter((e) => e.governs.some((glob) => matchesGlob(glob, needle)))
    .map(structural);
}

// Split a shard into [frontmatter, body]. Both the probe and the rewrite below are
// bounded to the frontmatter block: an unanchored /m regex over the whole file read
// a BODY line beginning `scope:` as the field and skipped the entry, leaving the
// fact unreachable — the exact condition AC-011 forbids (security review F-2).
// Entries in this corpus routinely quote frontmatter keys while documenting the
// schema, so that collision is ordinary, not exotic.
function splitFrontmatter(text) {
  const lines = String(text).split('\n');
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { front: lines.slice(1, i), rest: lines.slice(i), openIdx: 0 };
    }
  }
  return null;
}

// `scope: []` is as unreachable as an absent `scope:` — both surface nothing at
// any trigger — so both are backfill targets. Only a scope with real content is
// left alone.
function hasReachableScope(front) {
  for (const line of front) {
    const match = /^scope:(.*)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    return value !== '' && value !== '[]';
  }
  return false;
}

// Rollout prerequisite P2. Epic decision D7: migrated facts backfill to `scope: any`,
// NOT to a per-category phase default — the category default is exactly what stamped
// `scope: [spec]` onto decisions and caused the surfacing defect this batch exists to
// fix. Repeating it would re-create the bug. Invoked from /memory-flush Step 4.6.
export function backfillScopeAny({ rootDir } = {}) {
  if (!rootDir) return { updated: 0 };
  let updated = 0;
  for (const path of everyShardPath(`${rootDir}/.claude/memory`)) {
    const text = readFileSync(path, 'utf8');
    const split = splitFrontmatter(text);
    if (!split || hasReachableScope(split.front)) continue;

    const front = [...split.front];
    const scopeIdx = front.findIndex((line) => /^scope:/.test(line));
    if (scopeIdx >= 0) front[scopeIdx] = 'scope: any';
    else front.push('scope: any');

    const patched = ['---', ...front, ...split.rest].join('\n');
    if (patched === text) continue;
    writeFileSync(path, patched, 'utf8');
    updated++;
  }
  return { updated };
}
