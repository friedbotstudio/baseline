// Foundation — shape-aware read/write so the sweep modes work on both the flat
// store (`<name>.md` with `## key` blocks) and the sharded store (`<name>/<key>.md`
// per-fact files). The trick: present a sharded category to the caller as one
// synthetic flat text (each fact rendered as a `## key` block with bulleted
// fields), let the existing block-level mode logic mutate it, then write the
// mutated text back into per-fact files (updates in place, deletions removed).

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../../hooks/lib/frontmatter-parser.mjs';
import { parseFieldBullet } from '../memory-index/lift-fields.mjs';

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function slugFor(key) {
  const slug = String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe fact key/filename slug (REJECT, never normalize): ${JSON.stringify(key)}`);
  return slug;
}

function emitFieldValue(v) {
  return Array.isArray(v) ? `[${v.join(', ')}]` : v;
}

function factToBlock(frontmatter, body) {
  const fields = Object.entries(frontmatter)
    .filter(([k]) => k !== 'key' && k !== 'category')
    .map(([k, v]) => `- ${k}: ${emitFieldValue(v)}`);
  const parts = [`## ${frontmatter.key}`, '', body.trim()];
  if (fields.length) parts.push('', fields.join('\n'));
  return parts.join('\n');
}

function blockToFact(block, category) {
  const lines = block.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+/.test(l));
  const key = headingIdx >= 0 ? lines[headingIdx].replace(/^##\s+/, '').trim() : '';
  const fields = [];
  const bodyLines = [];
  // Policy note (deliberately NOT the migrate/relift allowlist): this reads back
  // the bullets factToBlock emitted from frontmatter, so every one must return to
  // frontmatter or a sweep round-trip would silently demote fields to body text.
  // Frontmatter keys are always lowercase; author prose (`- Trap:`, `- Path:`) is
  // capitalized and stays in the body. The regex itself is the shared one — see
  // lift-fields.mjs, which owns the single definition.
  for (const line of lines.slice(headingIdx + 1)) {
    const bullet = parseFieldBullet(line);
    const isEmittedField = bullet && bullet.name === bullet.name.toLowerCase();
    if (isEmittedField && bullet.name !== 'key' && bullet.name !== 'category') fields.push([bullet.name, bullet.value]);
    else if (!isEmittedField) bodyLines.push(line);
  }
  const preamble = [`key: ${key}`, `category: ${category}`, ...fields.map(([k, v]) => `${k}: ${v}`)];
  return { key, content: `---\n${preamble.join('\n')}\n---\n\n${bodyLines.join('\n').trim()}\n` };
}

export function categoryIsSharded(memdir, name) {
  const dir = join(memdir, name);
  return existsSync(dir) && statSync(dir).isDirectory();
}

export function readShardedAsFlat(memdir, name) {
  const dir = join(memdir, name);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const keyToFile = {};
  const blocks = [];
  for (const f of files) {
    const { frontmatter, body } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
    const key = frontmatter.key || f.replace(/\.md$/, '');
    keyToFile[key] = f;
    blocks.push(factToBlock(frontmatter, body));
  }
  return { text: blocks.length ? `${blocks.join('\n\n')}\n` : '', keyToFile };
}

export function writeShardedFromFlat(memdir, name, newText, keyToFile) {
  const dir = join(memdir, name);
  const present = new Set();
  const blocks = newText.split(/^## /m).slice(1).map((b) => `## ${b.trimEnd()}`).filter((b) => b.trim() !== '##');
  for (const block of blocks) {
    const { key, content } = blockToFact(block, name);
    if (!key) continue;
    const filename = keyToFile[key] || `${slugFor(key)}.md`;
    present.add(filename);
    writeFileSync(join(dir, filename), content);
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    if (!present.has(f)) rmSync(join(dir, f));
  }
}
