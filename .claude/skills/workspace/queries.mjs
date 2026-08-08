// Domain — the corpus queries the dispatcher exposes.
//
// Split out of cli.mjs at the simplify pass: nine handlers plus wiring put that
// file at 198 substantive lines against the ~80 ceiling, and the handlers are the
// half that carries logic. Multi-hop reachability in particular is a graph
// traversal, not an entry point, so it belongs on this side of the line.
//
// Every function returns `{ text, data }`. The dispatcher chooses which to print;
// nothing here knows about stdout or exit codes.

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { NotFoundError, lines } from '../lib/argv.mjs';
import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { surfaceGovernedMemory } from '../../hooks/lib/governed-memory.mjs';
import { assertNoTraversal } from './tree.mjs';
import { readRecords } from './store.mjs';
import { readConcepts, conceptsFor } from './concepts.mjs';
import { deriveEdges } from './edges.mjs';
import { readShard } from './shards.mjs';
import { findGaps } from './coverage.mjs';
import { composeView, generateView } from './render.mjs';
import { classify } from './reconcile.mjs';
import { roll } from './roll.mjs';
import { buildGraphDocument } from './graph.mjs';
import { workspaceEnabled, annotationsEnabled, architectureMapEnabled } from './flags.mjs';

const MAX_HOPS = 5;

export function corpusDir({ flags, root }) {
  const given = flags['spec-dir'];
  if (!given) return join(root, 'docs/system');
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return join(root, given);
}

function elementId(value) {
  assertSafeSlug(value, 'element id');
  return value;
}

function hopsFrom(flags) {
  const requested = Number(flags.hops ?? 1);
  if (!Number.isInteger(requested) || requested > MAX_HOPS) {
    throw new Error(`--hops must be an integer no greater than ${MAX_HOPS}; got ${flags.hops}`);
  }
  return Math.max(1, requested);
}

function corpusEdges(ctx) {
  const specDir = corpusDir(ctx);
  return { specDir, edges: deriveEdges(ctx.root, readRecords(specDir, 'elements')) };
}

function elementOr404(specDir, id) {
  const element = readRecords(specDir, 'elements').find((record) => record.id === id);
  if (!element) throw new NotFoundError(`no element \`${id}\` under ${specDir}`);
  return element;
}

// Breadth-first over the derived graph, bounded by hops. Seeded set carries the
// origin so a cycle cannot re-add it and inflate the reported radius.
function reachable(edges, seed, hops, from, to) {
  const seen = new Set([seed]);
  const found = [];
  for (let hop = 0; hop < hops; hop++) {
    for (const edge of edges.filter((e) => seen.has(from(e)) && !seen.has(to(e)))) {
      seen.add(to(edge));
      found.push(edge);
    }
  }
  return found;
}

export function describeElement(ctx) {
  const id = elementId(ctx.positional[0]);
  const specDir = corpusDir(ctx);
  const element = elementOr404(specDir, id);
  const shard = readShard(specDir, id);
  const drifted = classify(specDir, { rootDir: ctx.root }).find((v) => v.element_id === id);
  const data = {
    ...element,
    shard_kind: shard?.kind ?? null,
    concepts: conceptsFor(specDir, id).map((concept) => concept.id),
    digest: element.anchor_digest ?? 'none',
    digest_state: drifted?.state ?? 'fresh',
  };
  return {
    data,
    text: lines([
      `id       ${data.id}`,
      `title    ${data.title ?? data.id}`,
      `anchor   ${data.anchor ?? '(none)'}`,
      `kind     ${data.kind ?? 'component'}`,
      `shard    ${data.shard_kind ?? '(no shard)'}`,
      `concepts ${data.concepts.join(', ') || '(none)'}`,
      `digest   ${data.digest} (${data.digest_state})`,
    ]),
  };
}

// A glob-anchored element derives no edges BY DESIGN — fileAnchored excludes it,
// because attributing a specific import to "the whole skills layer" would be a
// claim the code does not make. 53 of 114 elements land here, so the reason is
// printed rather than left as a bare empty result a reader would call safe.
export function blastRadius(ctx) {
  const id = elementId(ctx.positional[0]);
  const hops = hopsFrom(ctx.flags);
  const { specDir, edges } = corpusEdges(ctx);
  const element = elementOr404(specDir, id);
  const globAnchored = Boolean(element.anchor?.includes('*'));

  const dependsOn = reachable(edges, id, hops, (e) => e.from, (e) => e.to);
  const dependents = reachable(edges, id, hops, (e) => e.to, (e) => e.from);
  return {
    data: { element: id, hops, globAnchored, dependsOn, dependents },
    text: lines([
      `${id} (${hops} hop${hops === 1 ? '' : 's'})`,
      'depends on:',
      ...(dependsOn.length ? dependsOn.map((e) => `  ${e.kind} -> ${e.to}`) : ['  (none)']),
      'depended on by:',
      ...(dependents.length ? dependents.map((e) => `  ${e.from} (${e.kind})`) : ['  (none)']),
      ...(globAnchored ? ['', 'note: this element is glob-anchored, so edge derivation excludes it by design'] : []),
    ]),
  };
}

export function describeConcept(ctx) {
  const id = elementId(ctx.positional[0]);
  const { specDir, edges } = corpusEdges(ctx);
  const concepts = readConcepts(specDir);
  const concept = concepts.find((record) => record.id === id);
  if (!concept) throw new NotFoundError(`no concept \`${id}\` under ${specDir}`);
  const members = new Set(concept.members ?? []);
  const internal = edges.filter((e) => members.has(e.from) && members.has(e.to));
  const crossing = edges.filter((e) => members.has(e.from) !== members.has(e.to));
  return {
    data: {
      concept: id,
      members: [...members],
      internal,
      crossing,
      rolled: roll(edges, concepts).filter((e) => e.from === id || e.to === id),
    },
    text: lines([
      `${id} — ${concept.title ?? id}`,
      `members  ${members.size}`,
      `internal ${internal.length}`,
      `crossing ${crossing.length}`,
      ...[...members].map((member) => `  ${member}`),
    ]),
  };
}

export function coverage(ctx) {
  const gaps = findGaps({ specDir: corpusDir(ctx), rootDir: ctx.root });
  return { data: { gaps }, text: lines(gaps.length ? gaps : ['(no uncovered governed paths)']) };
}

export function stale(ctx) {
  const drifted = classify(corpusDir(ctx), { rootDir: ctx.root }).filter((v) => v.state === 'stale');
  return {
    data: { stale: drifted },
    text: lines(drifted.length ? drifted.map((v) => `${v.element_id}  ${v.detail ?? ''}`.trim()) : ['(nothing stale)']),
  };
}

// Answers from two sources with different coverage, so the output names which one
// spoke: `governs:` globs reach every path, `rests_on:` is declared on 14 of 114
// elements. A merged list would read as one uniform answer it is not.
export function constraintsFor(ctx) {
  const path = ctx.positional[0];
  if (!path) throw new Error('constraints-for needs a repo-relative path');
  assertNoTraversal(path);
  const governed = surfaceGovernedMemory(path, { rootDir: ctx.root })
    .filter((hit) => hit.category === 'constraints');
  const element = readRecords(corpusDir(ctx), 'elements').find((record) => record.anchor === path);
  const restsOn = element?.rests_on ? String(element.rests_on).split(',').map((s) => s.trim()) : [];
  return {
    data: { path, governs: governed.map((hit) => hit.key), rests_on: restsOn },
    text: lines([
      `constraints governing ${path}`,
      ...(governed.length ? governed.map((hit) => `  ${hit.key}  (via governs:)`) : ['  (none via governs:)']),
      ...(restsOn.length ? restsOn.map((key) => `  ${key}  (via rests_on:)`) : ['  (none via rests_on:)']),
    ]),
  };
}

// The remote PlantUML server is deliberately NOT a fallback: it cannot resolve the
// local !includesub paths a composed view depends on, so it would render a
// silently different — and emptier — diagram than the one asked for.
export function view(ctx) {
  const id = elementId(ctx.positional[0]);
  const specDir = corpusDir(ctx);
  const concept = readConcepts(specDir).find((record) => record.id === id);
  if (!concept) throw new NotFoundError(`no concept \`${id}\` under ${specDir}`);
  const query = { elements: concept.members ?? [], title: concept.title ?? id };
  if (ctx.flags.render !== true) return { data: query, text: composeView(specDir, query) };

  const jarPath = ctx.flags.jar ?? join(ctx.root, '.claude/bin/plantuml.jar');
  if (!existsSync(jarPath)) throw new NotFoundError(`plantuml jar not found at ${jarPath}`);
  return { data: query, text: generateView(specDir, query, { jarPath }).toString() };
}

export function graph(ctx) {
  const document = buildGraphDocument({ specDir: corpusDir(ctx), rootDir: ctx.root });
  return {
    data: document,
    text: lines([
      `nodes    ${document.nodes.length}`,
      `edges    ${document.edges.length}`,
      `orphans  ${document.orphans.length}`,
      `stale    ${document.stale.length}`,
    ]),
  };
}

export function flagStates(ctx) {
  const data = {
    workspace: workspaceEnabled({ rootDir: ctx.root }),
    annotations: annotationsEnabled({ rootDir: ctx.root }),
    architecture_map: architectureMapEnabled({ rootDir: ctx.root }),
  };
  return { data, text: lines(Object.entries(data).map(([key, value]) => `${key}: ${value}`)) };
}
