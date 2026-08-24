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

import { CANONICAL, asList } from './categories.mjs';
import { resolveCategory } from './lift-fields.mjs';
import { matchesGlob } from './index-io.mjs';
import { SCOPE_BY_CATEGORY } from './migrate.mjs';
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

// The architecture-map layer is additive and OPT-IN. `specDir` is passed only by the
// new consumers, so every historical `(kind, needle, {rootDir})` call site keeps its
// exact return SHAPE — a bare array — and is untouched by this extension.
function conceptLayer(specDir, rootDir) {
  if (!specDir || !architectureMapEnabled({ rootDir })) return null;
  return { concepts: readConcepts(specDir), elements: readAll(specDir).elements };
}

function resolveConcept(needle, { rootDir, specDir }) {
  const layer = conceptLayer(specDir, rootDir);
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
function resolveTouchedPath(needle, { rootDir, specDir }) {
  const layer = conceptLayer(specDir, rootDir);
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

export function resolveLookup(kind, needle, { rootDir, specDir } = {}) {
  if (!LOOKUP_KINDS.has(kind) || !rootDir || !needle) return [];
  if (kind === 'by_concept') return resolveConcept(needle, { rootDir, specDir });
  if (kind === 'by_path' && specDir) return resolveTouchedPath(needle, { rootDir, specDir });
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

export { splitFrontmatter };

// The placeholder `scope: any` was written by the retired `backfillScopeAny` to make
// migrated facts reachable. It never did: `scoped-memory.mjs` matches a phase with
// `asArray(scope).includes(phase)`, and `['any'].includes('spec')` is false, so all
// 47 stamped entries surfaced at zero phases. It is not honoured as a wildcard here
// either — honouring it would take a spec write from 107 hits to 154, and nobody
// authored those entries meaning "surface everywhere". It is simply not a value.
export const SCOPE_PLACEHOLDER = 'any';

export class UnreachableScopeError extends Error {
  constructor(key, reason) {
    super(`unreachable memory entry ${JSON.stringify(key)}: ${reason}`);
    this.name = 'UnreachableScopeError';
    this.key = key;
  }
}

// Distinct from UnreachableScopeError on purpose. Both legs live under `.fields`,
// so an entry handed over flat reads as having neither and looks unreachable. The
// curator then edits an entry that was already correct.
export class MalformedEntryError extends Error {
  constructor(key, reason) {
    super(`malformed memory entry ${JSON.stringify(key)}: ${reason}`);
    this.name = 'MalformedEntryError';
    this.key = key;
  }
}

function phaseScopeOf(entry) {
  return asList(entry?.fields?.scope).filter((s) => s !== SCOPE_PLACEHOLDER);
}

// Reachability spans BOTH legs. The phase leg (`scope:`) fires when a workflow
// artifact is written; the path leg (`governs:`, from epic slice C) fires when the
// governed code is edited. An entry needs only one of them. Checking the phase leg
// alone is what made a perfectly reachable path-governed entry look orphaned and
// earn a placeholder that orphaned it for real.
//
// No phase roster is validated here: the memory layer does not own the workflow's
// phase list, and importing one would couple the store to `workflows.jsonl`. This
// predicate answers "can anything reach this entry", not "is this phase spelled
// correctly" — a misspelt phase is a curation defect the proposal surfaces, not a
// reachability question.
export function isReachable(entry) {
  return phaseScopeOf(entry).length > 0 || asList(entry?.fields?.governs).length > 0;
}

// The category default is refused for the same reason the placeholder is: it is a
// migration artifact standing in for a judgment nobody made. `SCOPE_BY_CATEGORY`
// stamped all 87 landmarks and all 49 landmines, which is the entire volume problem.
// An entry may legitimately END UP at its category default — but only via a proposal
// carrying evidence, never by inheriting it silently at promotion.
function inheritsCategoryDefault(entry) {
  const fallback = SCOPE_BY_CATEGORY[entry?.category];
  if (!fallback || !fallback.length) return false;
  const scope = phaseScopeOf(entry);
  if (scope.length !== fallback.length) return false;
  return [...scope].sort().join(',') === [...fallback].sort().join(',');
}

// Why a shape check has to run before the reachability check: both legs are read
// through `.fields`, so any entry that does not carry that wrapper reads as having
// neither leg. Without this, a correct entry handed over flat is reported
// unreachable and the curator edits the wrong thing.
function malformedShapeReason(entry) {
  if (!entry || typeof entry !== 'object') return 'not an object';
  const fields = entry.fields;
  const misplaced = ['scope', 'governs'].filter((leg) => entry[leg] !== undefined);
  if (fields === undefined || fields === null) {
    return misplaced.length
      ? `no \`fields\` wrapper — ${misplaced.map((l) => `\`${l}:\``).join(' and ')} sits at the top level, where no reader looks for it`
      : 'no `fields` wrapper';
  }
  if (typeof fields !== 'object' || Array.isArray(fields)) return '`fields` is not an object';
  if (misplaced.length) {
    return `${misplaced.map((l) => `\`${l}:\``).join(' and ')} duplicated outside \`fields\`, where no reader looks`;
  }
  return null;
}

// The write boundary. `/memory-sync` calls this before promoting or re-verifying an
// entry, so an unreachable fact is refused at the moment it would be written rather
// than discovered later by a reader that silently returns nothing.
export function assertWritable(entry) {
  const key = entry?.key ?? entry?.fields?.key ?? '(unkeyed)';
  const shapeProblem = malformedShapeReason(entry);
  if (shapeProblem) throw new MalformedEntryError(key, shapeProblem);
  if (asList(entry?.fields?.scope).includes(SCOPE_PLACEHOLDER)) {
    throw new UnreachableScopeError(key, `\`scope: ${SCOPE_PLACEHOLDER}\` is not a stored value — it matches no phase`);
  }
  if (!isReachable(entry)) {
    throw new UnreachableScopeError(key, 'reachable by neither leg — give it a phase `scope:` or a `governs:` glob');
  }
  if (inheritsCategoryDefault(entry)) {
    throw new UnreachableScopeError(key, `scope equals the \`${entry.category}\` category default with no narrowing evidence`);
  }
  return entry;
}
