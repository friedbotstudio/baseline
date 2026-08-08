// Domain — assemble the corpus into the GraphDocument a consumer traverses.
//
// The shape is pinned at .claude/schemas/graph-document.v1.json, which is the
// contract rather than documentation: the conformance test drives its assertions
// from that file's own `required`/`enum`/`pattern` declarations, so a field added
// there and not emitted here goes red without anyone editing a test.
//
// Sited beside the corpus rather than inside cli.mjs because this is composition
// over four Domain modules — a dispatcher holding it would be a Domain module
// wearing an Orchestration name.
//
// `targetKind` is the load-bearing field. 46 of the 124 live edges point at a
// project.json key rather than an element, because scanConfigKeys targets the KEY
// deliberately: nothing anchors project.json, and inventing an element for it
// would put a file in the model no maintainer would ever open. A consumer that
// assumes every `to` resolves to a node draws that many dangling lines.

import { readRecords } from './store.mjs';
import { readConcepts } from './concepts.mjs';
import { deriveEdges } from './edges.mjs';
import { readShard } from './shards.mjs';
import { bindingFor, isCitable } from './witness.mjs';
import { findOrphanShards } from './render.mjs';
import { classify } from './reconcile.mjs';
import { architectureMapEnabled } from './flags.mjs';

const SCHEMA_VERSION = 1;

// Granularity is derived from anchor SHAPE, never stored: no anchor is a concept,
// a glob names a family, a path names one file. A stored copy would be a second
// source of truth that can disagree with the anchor beside it.
function granularityOf(anchor) {
  if (!anchor) return 'concept';
  return anchor.includes('*') ? 'subsystem' : 'component';
}

function witnessedBy(specDir, rootDir, elementId) {
  const shard = readShard(specDir, elementId);
  if (!shard?.kind) return false;
  return isCitable(bindingFor(shard.kind, { rootDir }).witness);
}

function elementNode(specDir, rootDir, element) {
  return {
    id: element.id,
    granularity: granularityOf(element.anchor),
    title: element.title ?? element.id,
    kind: element.kind ?? 'component',
    anchor: element.anchor,
    witnessed: witnessedBy(specDir, rootDir, element.id),
  };
}

function conceptNode(concept) {
  return {
    id: concept.id,
    granularity: 'concept',
    title: concept.title ?? concept.id,
    kind: 'concept',
    members: concept.members ?? [],
  };
}

function graphEdge(edge) {
  return {
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    targetKind: edge.kind === 'config' ? 'config-key' : 'element',
    provenance: edge.provenance,
    weight: edge.weight ?? 1,
  };
}

// Ordering is total and stable so a consumer diffs real change, not readdir order.
function byId(a, b) {
  return a.id.localeCompare(b.id);
}

function byEndpoints(a, b) {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind);
}

function staleIds(specDir, rootDir) {
  try {
    return classify(specDir, { rootDir })
      .filter((verdict) => verdict.state === 'stale')
      .map((verdict) => verdict.element_id)
      .sort();
  } catch {
    return [];
  }
}

// The flag gate runs BEFORE any corpus read, so an opted-out project gets a
// well-formed empty document rather than an ENOENT from a directory it never
// agreed to have.
export function buildGraphDocument({ specDir, rootDir = process.cwd() } = {}) {
  if (!architectureMapEnabled({ rootDir })) {
    return { version: SCHEMA_VERSION, nodes: [], edges: [], orphans: [], stale: [] };
  }
  const elements = readRecords(specDir, 'elements');
  const concepts = readConcepts(specDir);
  return {
    version: SCHEMA_VERSION,
    nodes: [
      ...elements.map((element) => elementNode(specDir, rootDir, element)),
      ...concepts.map(conceptNode),
    ].sort(byId),
    edges: deriveEdges(rootDir, elements).map(graphEdge).sort(byEndpoints),
    orphans: findOrphanShards(specDir).sort(),
    stale: staleIds(specDir, rootDir),
  };
}
