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
import { liftFields, emitFrontmatter, LIFTABLE_FIELDS, parseFieldBullet, splitBodyLines } from './lift-fields.mjs';

import { CANONICAL as CANONICAL_CATEGORIES } from './categories.mjs';

export { CANONICAL_CATEGORIES as CANONICAL };

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

// Frontmatter is line-delimited, so a newline anywhere in a rendered field forges
// real fields — `title: x\nload_bearing: true` yields a genuine load_bearing entry
// that every reader believes. Applies to the NAME as well as the value: both are
// interpolated. Same bound recordCuration puts on the line-delimited ledger, and
// the same register as assertSafeFactKey — REJECT, never normalize, because
// stripping the newline would silently store something the author did not write.
export function assertSafeFieldValue(name, value) {
  for (const [what, text] of [['name', name], ['value', value]]) {
    if (/[\r\n]/.test(String(text))) {
      throw new Error(`unsafe field ${what} (REJECT, never normalize): ${JSON.stringify(String(text).slice(0, 80))}`);
    }
  }
  return value;
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
  const { fields, bodyLines } = liftFields(blockBody, {});
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

// Three sides, not one. The original count-only check passed a migration that
// stranded every stamp — both counts were right while the data was wrong. Each
// side names a distinct way a lift can be lossy:
//
//   residual-metadata — an allowlisted bullet left behind in a body (the old bug)
//   dropped-prose     — a non-allowlisted line lost from a body (over-lifting, the
//                       new bug the fix itself could introduce)
//   clobbered-field   — a lift overwrote a pre-existing frontmatter key
//
// clobbered-field is the one both original sides were blind to: they were body-side,
// so a frontmatter overwrite left the body correct and dropped nothing.
export function verifyMigrationFidelity(perCategory, perEntry = {}) {
  for (const [category, { blocks, files }] of Object.entries(perCategory)) {
    if (blocks !== files) {
      throw new MigrationFidelityError(`fidelity mismatch in ${category}: ${blocks} blocks vs ${files} files`);
    }
  }
  for (const [category, entries] of Object.entries(perEntry)) {
    for (const entry of entries || []) {
      assertEntrySides(category, entry);
    }
  }
}

function assertEntrySides(category, entry) {
  const { entryKey, residualMetadata = [], droppedProse = [], clobberedFields = [] } = entry;
  if (residualMetadata.length) {
    throw new MigrationFidelityError(
      `fidelity violation [residual-metadata] in ${category}/${entryKey}: `
      + `allowlisted bullet left in the body: ${residualMetadata.join(' | ')}`);
  }
  if (droppedProse.length) {
    throw new MigrationFidelityError(
      `fidelity violation [dropped-prose] in ${category}/${entryKey}: `
      + `body line lost: ${droppedProse.join(' | ')}`);
  }
  if (clobberedFields.length) {
    const detail = clobberedFields.map((c) => `${c.field} (${c.from} -> ${c.to})`).join(' | ');
    throw new MigrationFidelityError(
      `fidelity violation [clobbered-field] in ${category}/${entryKey}: `
      + `pre-existing frontmatter overwritten: ${detail}`);
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

function shardFilesIn(memRoot, category) {
  const dir = join(memRoot, category);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => join(dir, f));
}

// What the lift left behind, for the three fidelity sides. Computed from the real
// before/after rather than asserted by construction — a check that trusts the code
// it checks is the count-only check all over again.
function auditLift(entryKey, originalBody, result, originalFrontmatter, mergedFrontmatter) {
  const kept = new Set(result.bodyLines);
  return {
    entryKey,
    residualMetadata: result.bodyLines.filter((line) => {
      const bullet = parseFieldBullet(line);
      return bullet && LIFTABLE_FIELDS.has(bullet.name.toLowerCase());
    }),
    droppedProse: splitBodyLines(originalBody).filter((line) => {
      if (kept.has(line)) return false;
      const bullet = parseFieldBullet(line);
      return !bullet || !LIFTABLE_FIELDS.has(bullet.name.toLowerCase());
    }),
    clobberedFields: Object.keys(originalFrontmatter)
      .filter((k) => mergedFrontmatter[k] !== originalFrontmatter[k])
      .map((k) => ({ field: k, from: originalFrontmatter[k], to: mergedFrontmatter[k] })),
  };
}

// One-shot repair over an ALREADY-migrated store: move every stranded allowlisted
// bullet from the body into frontmatter. Nothing is written until every entry has
// passed the three-sided assertion — the pass touches ~127 tracked files and is
// never trusted on inspection.
export function reliftShards(memRoot) {
  const perCategory = {};
  const perEntry = {};
  const pendingWrites = [];
  const collisions = [];
  let scanned = 0;
  let relifted = 0;
  let unchanged = 0;

  for (const category of CANONICAL_CATEGORIES) {
    const files = shardFilesIn(memRoot, category);
    if (!files.length) continue;
    perCategory[category] = { blocks: files.length, files: files.length };
    perEntry[category] = [];

    for (const abs of files) {
      scanned += 1;
      const { frontmatter, body } = parseFrontmatter(readFileSync(abs, 'utf8'));
      const entryKey = frontmatter.key || abs;
      const result = liftFields(body, frontmatter);

      if (result.collisions.length) {
        for (const c of result.collisions) collisions.push({ entryKey, ...c });
        continue;
      }
      if (!result.fields.length) {
        unchanged += 1;
        continue;
      }

      const merged = { ...frontmatter };
      for (const [name, value] of result.fields) merged[name] = value;
      perEntry[category].push(auditLift(entryKey, body, result, frontmatter, merged));
      relifted += result.fields.length;
      pendingWrites.push([abs, `---\n${emitFrontmatter(merged)}\n---\n\n${result.bodyLines.join('\n').trim()}\n`]);
    }
  }

  verifyMigrationFidelity(perCategory, perEntry);
  for (const [abs, content] of pendingWrites) writeFileSync(abs, content);
  return { scanned, relifted, unchanged, refused: collisions.length, collisions };
}

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const memRoot = rootFlag !== -1 ? argv[rootFlag + 1] : join(process.cwd(), '.claude/memory');
  if (argv.includes('--reverse')) {
    migrateReverse(memRoot);
    process.stdout.write('reverse migration complete\n');
    return 0;
  }
  if (argv.includes('--relift')) {
    const report = reliftShards(memRoot);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    for (const c of report.collisions) {
      process.stderr.write(
        `collision: ${c.entryKey} field "${c.field}" — frontmatter=${JSON.stringify(c.frontmatterValue)} `
        + `body=${JSON.stringify(c.bodyValue)} (human must resolve; entry left untouched)\n`);
    }
    return report.refused > 0 ? 1 : 0;
  }
  const report = migrateForward(memRoot);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write(`migrate: ${err.message}\n`);
    process.exit(1);
  }
}
