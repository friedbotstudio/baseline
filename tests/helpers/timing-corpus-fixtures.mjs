// Foundation — build an archived-bundle corpus on disk.
//
// Three suites need the same primitive: a temp repo holding
// `docs/archive/<day>/<slug>/{timing.md,workflow.json}` pairs. The envelope is
// fitted from the RENDERED table (spec D1), so a fixture that fabricates JSONL
// instead would exercise a path production never takes.
//
// `tokens` accepts a number or a string so a suite can write the `n/a` cell that
// D2 turns on: an unmeasured bundle is excluded, never coerced to zero.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HEADER = [
  '| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |',
  '|---|---|---|---|---|---|',
];

export function corpusRoot(prefix = 'corpus-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeBundle(root, { day, slug, track, rows }) {
  const dir = join(root, 'docs/archive', day, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workflow.json'), JSON.stringify({ slug, track_id: track }, null, 2), 'utf8');
  const body = rows.map(([phase, tokens]) => `| ${phase} | 0 | 0 | ${tokens} | 0 | 0 |`);
  writeFileSync(
    join(dir, 'timing.md'),
    `# Phase timing — ${slug}\n\n${[...HEADER, ...body].join('\n')}\n`,
    'utf8',
  );
  return dir;
}

// n bundles of one track, each with the same phase rows. Days are generated so a
// caller never has to invent unique directory names.
export function writeBundles(root, { track, count, rows, prefix = 'b' }) {
  for (let i = 0; i < count; i++) {
    const day = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
    writeBundle(root, { day, slug: `${prefix}${i}`, track, rows });
  }
  return root;
}
