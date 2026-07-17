// Domain — migrate the seven flat canonical files to per-fact category dirs and
// back. Forward explodes each `## <heading>` block into <category>/<slug>.md,
// preserving the ORIGINAL heading verbatim as the fact's `key:` (stable keys like
// path:line and lib@version must survive — the filename is a safe slug, the key is
// not), backfilling a `scope:` from the category so decision-point surfacing fires,
// and proving file-count == block-count before removing the source (AC-005). Reverse
// rebuilds the flat file from each fact's `key:`, key-sorted (reversible).

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../../hooks/lib/frontmatter-parser.mjs';

const CANONICAL_CATEGORIES = [
  'landmarks', 'libraries', 'decisions', 'landmines',
  'conventions', 'pending-questions', 'backlog',
];

const OWNERS = {
  landmarks: 'scout', libraries: 'research', decisions: 'spec, rca',
  landmines: 'security, integrate, scout', conventions: 'scenario, implement',
  'pending-questions': 'any', backlog: 'memory-flush',
};

// Backfill scope for legacy entries that predate the scope: field. Chosen so the
// decision-point cases the redesign targets fire: landmines (incl. the -7f3a
// outcome-AC case) surface at spec/tdd; decisions at spec; the rest at their owner
// phase. New entries declare scope: explicitly and are not backfilled.
const SCOPE_BY_CATEGORY = {
  landmarks: ['scout'],
  libraries: ['research'],
  decisions: ['spec'],
  landmines: ['scout', 'spec', 'tdd', 'security', 'integrate'],
  conventions: ['scenario', 'implement', 'tdd'],
  'pending-questions': [],
  backlog: [],
};

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export class MigrationFidelityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationFidelityError';
  }
}

export function assertSafeFactKey(slug) {
  if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) {
    throw new Error(`unsafe fact key/filename slug (REJECT, never normalize): ${JSON.stringify(slug)}`);
  }
  return slug;
}

export function factKeyFromHeading(heading) {
  const slug = heading.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return assertSafeFactKey(slug);
}

function uniqueSlug(slug, used) {
  let candidate = slug;
  let n = 2;
  while (used.has(candidate)) candidate = `${slug}-${n++}`;
  used.add(candidate);
  return candidate;
}

function stripPreamble(text) {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function emitScalar(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : value;
}

function toFactFile(heading, category, blockBody) {
  const fields = [];
  const bodyLines = [];
  for (const line of blockBody.split('\n')) {
    const field = /^-\s+([a-z][a-z-]*):\s+(.+)$/.exec(line.trim());
    if (field && field[1] !== 'key' && field[1] !== 'category' && field[1] !== 'scope') fields.push([field[1], field[2]]);
    else if (!field) bodyLines.push(line);
  }
  const preamble = [
    `key: ${heading}`,
    `category: ${category}`,
    `scope: ${emitScalar(SCOPE_BY_CATEGORY[category] || [])}`,
    ...fields.map(([k, v]) => `${k}: ${v}`),
  ];
  return `---\n${preamble.join('\n')}\n---\n\n${bodyLines.join('\n').trim()}\n`;
}

function splitBlocks(text, category, usedSlugs) {
  // split(/^## /m) yields [pre-heading prose, block1, block2, ...]; slice(1) drops
  // the file-level description that precedes the first entry so it never becomes a
  // spurious fact file.
  return stripPreamble(text)
    .split(/^## /m)
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const newline = part.indexOf('\n');
      const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
      const rest = newline === -1 ? '' : part.slice(newline + 1).trim();
      const slug = uniqueSlug(factKeyFromHeading(heading), usedSlugs);
      return { slug, content: toFactFile(heading, category, rest) };
    });
}

export function verifyMigrationFidelity(perCategory) {
  for (const [category, { blocks, files }] of Object.entries(perCategory)) {
    if (blocks !== files) {
      throw new MigrationFidelityError(`fidelity mismatch in ${category}: ${blocks} blocks vs ${files} files`);
    }
  }
}

export function migrateForward(memRoot) {
  const perCategory = {};
  const migrated = [];
  for (const category of CANONICAL_CATEGORIES) {
    const flat = join(memRoot, `${category}.md`);
    if (!existsSync(flat)) continue;
    const blocks = splitBlocks(readFileSync(flat, 'utf8'), category, new Set());
    const dir = join(memRoot, category);
    mkdirSync(dir, { recursive: true });
    for (const block of blocks) writeFileSync(join(dir, `${block.slug}.md`), block.content);
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).length;
    perCategory[category] = { blocks: blocks.length, files };
    migrated.push({ flat });
  }
  verifyMigrationFidelity(perCategory);
  for (const { flat } of migrated) rmSync(flat);
  return { perCategory, dropped: 0 };
}

function factFileToBlock(frontmatter, body) {
  const fields = Object.entries(frontmatter)
    .filter(([k]) => k !== 'key' && k !== 'category')
    .map(([k, v]) => `- ${k}: ${emitScalar(v)}`);
  const parts = [`## ${frontmatter.key}`, '', body.trim()];
  if (fields.length) parts.push('', fields.join('\n'));
  return parts.join('\n');
}

export function migrateReverse(memRoot) {
  for (const category of CANONICAL_CATEGORIES) {
    const dir = join(memRoot, category);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    const blocks = files.map((file) => {
      const { frontmatter, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
      return factFileToBlock(frontmatter, body);
    });
    const preamble = `---\nowners: [${OWNERS[category]}]\nsize-cap: 500\n---\n\n`;
    writeFileSync(join(memRoot, `${category}.md`), `${preamble}${blocks.join('\n\n')}\n`);
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const memRoot = rootFlag !== -1 ? argv[rootFlag + 1] : join(process.cwd(), '.claude/memory');
  if (argv.includes('--reverse')) {
    migrateReverse(memRoot);
    process.stdout.write('reverse migration complete\n');
    return;
  }
  const report = migrateForward(memRoot);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`migrate: ${err.message}\n`);
    process.exit(1);
  }
}
