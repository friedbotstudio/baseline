// Domain — build the graph index injected at session start. Reads only each
// fact's frontmatter + one-line hook, never the body, so the upfront payload
// stays cheap (AC-002). Edges come from the `links:` list, so a [[category/key]]
// reference is a navigable graph edge (AC-008).

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asArray } from '../../hooks/lib/frontmatter-parser.mjs';
import { resolveCategory } from './lift-fields.mjs';

const CANONICAL_CATEGORIES = [
  'landmarks', 'libraries', 'decisions', 'landmines',
  'conventions', 'pending-questions', 'backlog',
];

export function factIsClosed(frontmatter) {
  return Boolean(frontmatter && (frontmatter['superseded-at'] || frontmatter['resolved-at']));
}

function firstHook(body) {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return '';
}

// Dual-mode: build-template.sh ships consumers a FLAT store, so a shard-only
// reader is silently inert on every fresh install until the project migrates.
function readCategory(memRoot, category) {
  const { entries: facts, source } = resolveCategory(memRoot, category);
  if (source === 'absent') return { entries: [], edges: [] };
  const entries = [];
  const edges = [];
  for (const fact of facts) {
    const key = fact.key;
    const links = asArray(fact.fields.links);
    entries.push({ key, category, hook: firstHook(fact.body), scope: asArray(fact.fields.scope), links });
    for (const link of links) edges.push({ from: `${category}/${key}`, to: link });
  }
  return { entries, edges };
}

export function buildIndex(memRoot) {
  const entries = [];
  const edges = [];
  for (const category of CANONICAL_CATEGORIES) {
    const part = readCategory(memRoot, category);
    entries.push(...part.entries);
    edges.push(...part.edges);
  }
  return { entries, edges };
}

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const memRoot = rootFlag !== -1 ? argv[rootFlag + 1] : join(process.cwd(), '.claude/memory');
  process.stdout.write(JSON.stringify(buildIndex(memRoot)) + '\n');
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`build-index: ${err.message}\n`);
    process.exit(1);
  }
}
