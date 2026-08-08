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
  },
});
