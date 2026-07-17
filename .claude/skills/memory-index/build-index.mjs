// Domain — build the graph index injected at session start. Reads only each
// fact's frontmatter + one-line hook, never the body, so the upfront payload
// stays cheap (AC-002). Edges come from the `links:` list, so a [[category/key]]
// reference is a navigable graph edge (AC-008).

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, asArray } from '../../hooks/lib/frontmatter-parser.mjs';

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

function readCategory(memRoot, category) {
  const dir = join(memRoot, category);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { entries: [], edges: [] };
  const entries = [];
  const edges = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const { frontmatter, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
    const key = frontmatter.key || file.replace(/\.md$/, '');
    entries.push({ key, category, hook: firstHook(body), scope: asArray(frontmatter.scope), links: asArray(frontmatter.links) });
    for (const link of asArray(frontmatter.links)) edges.push({ from: `${category}/${key}`, to: link });
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
