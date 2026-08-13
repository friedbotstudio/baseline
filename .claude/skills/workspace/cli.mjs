// Orchestration — the front door to the corpus.
//
// A table of contents and nothing else: every subcommand names a query in
// queries.mjs, which composes the Domain modules that already existed. This file
// adds the entry point those modules never had, which is why 25 inline
// `node -e "import(...)"` blocks were scattered across 16 SOPs.

import { dispatch } from '../lib/argv.mjs';
import {
  describeElement,
  blastRadius,
  describeConcept,
  coverage,
  stale,
  constraintsFor,
  view,
  graph,
  flagStates,
  delta,
  digest,
  shards,
  restoreShards,
  placement,
  reconcile,
  annotations,
  sync,
} from './queries.mjs';

dispatch({
  name: 'workspace',
  subcommands: {
    describe: { summary: 'element record, shard kind, owning concepts, digest state', run: describeElement },
    'blast-radius': { summary: 'what an element depends on and what depends on it', run: blastRadius },
    concept: { summary: 'a concept\'s members and its internal/crossing edges', run: describeConcept },
    coverage: { summary: 'governed-surface paths no element claims', run: coverage },
    stale: { summary: 'elements whose anchor digest drifted', run: stale },
    'constraints-for': { summary: 'constraints governing a path', run: constraintsFor },
    view: { summary: 'compose a concept view; --render for SVG', run: view },
    graph: { summary: 'nodes, edges, orphans and stale as one document', run: graph },
    flags: { summary: 'the three architecture-map flag states', run: flagStates },
    // Added by the dispatcher sweep. The three writers sit beside the reads rather
    // than in a separate dispatcher because they answer about the same corpus; what
    // separates them is the W-1..W-5 contract they run through, not their address.
    delta: { summary: 'verify and apply a spec\'s declared System delta (writes)', run: delta },
    digest: { summary: 're-stamp one element\'s anchor digest (writes)', run: digest },
    shards: { summary: 'write one element\'s diagram shard; needs --kind (writes)', run: shards },
    'restore-shards': { summary: 'repair shards a rewrite collapsed; --dry-run to plan (writes)', run: restoreShards },
    placement: { summary: 'whether a memory entry is annotated load-bearing', run: placement },
    reconcile: { summary: 'the seven-check corpus drift report', run: reconcile },
    annotations: { summary: 'scan the governed surface for decision annotations', run: annotations },
    sync: { summary: 'propose a concept map from the governed surface', run: sync },
  },
});
