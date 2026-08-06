// Domain — bootstrap a corpus for a repository that has never had one.
//
// A consumer adopting baseline has no spec archive to migrate from: 68% of THIS
// repo's governed files appear in no spec, and a project that never ran the phase
// has none at all. Rebuild-from-code is their only path, which makes this the
// module that decides whether the central spec is baseline-only or general.
//
// D9 — the human confirms the concept map, ALWAYS. Concept membership is authored
// (seed-cycle D6, backfill D5), and an unattended run that inferred it would
// quietly undo every decision in that lineage. There is no --yes.

import { conceptTitles, readConceptMap } from './concepts.mjs';
import { findGaps, governedFiles } from './coverage.mjs';
import { stampElement } from './digest.mjs';
import { deriveId } from './identity.mjs';
import { materialize } from './materialize.mjs';
import { readAll, writeRecord } from './store.mjs';

const CONCEPT_FIELDS = ['kind', 'title', 'anchors', 'members'];

// Cluster by the directory that most nearly owns a file. The proposal is a starting
// point for a human to edit, not an inference to be trusted — which is why the
// heuristic can be this plain.
function clusterByDirectory(files) {
  const clusters = new Map();
  for (const path of files) {
    const segments = path.split('/').filter(Boolean);
    const owner = segments.length > 1 ? segments.slice(0, -1).join('/') : segments[0];
    if (!clusters.has(owner)) clusters.set(owner, []);
    clusters.get(owner).push(path);
  }
  return clusters;
}

function titleFor(owner) {
  return owner.split('/').filter(Boolean).join(' ').replace(/[-_]+/g, ' ');
}

export function proposeMap({ rootDir = process.cwd() } = {}) {
  const clusters = clusterByDirectory(governedFiles({ rootDir }));
  const concepts = [...clusters.entries()].map(([owner, files]) => ({
    id: deriveId(owner),
    title: titleFor(owner),
    anchors: files.map((path) => ({ id: deriveId(path), anchor: path })),
  }));
  return { concepts };
}

// Written only AFTER confirmation returns, so a refusal leaves the corpus exactly
// as it was rather than half-populated.
function writeConfirmedConcepts(specDir, concepts) {
  for (const concept of concepts) {
    const anchors = concept.anchors.map((row) => `${row.id}=${row.anchor}`).join(',');
    writeRecord(specDir, 'concepts', {
      id: concept.id, kind: 'concept', title: concept.title, anchors, members: [],
    }, CONCEPT_FIELDS);
  }
}

export function runSync({ rootDir = process.cwd(), specDir, confirm } = {}) {
  if (typeof confirm !== 'function') {
    throw new Error(
      'runSync: refusing to infer concept membership — membership is authored, so a '
      + 'confirm callback is required (there is no unattended path)',
    );
  }

  const proposal = proposeMap({ rootDir });
  const confirmed = confirm(proposal);
  if (!Array.isArray(confirmed) || confirmed.length === 0) {
    return { concepts: 0, elements: 0, gaps: [], confirmed: false };
  }

  writeConfirmedConcepts(specDir, confirmed);
  const result = materialize({ specDir, rootDir, map: readConceptMap(specDir) });

  for (const element of readAll(specDir).elements) {
    stampElement(specDir, element.id, { rootDir });
  }

  return {
    concepts: Object.keys(conceptTitles(specDir)).length,
    elements: result.elements,
    gaps: findGaps({ specDir, rootDir }),
    confirmed: true,
  };
}
