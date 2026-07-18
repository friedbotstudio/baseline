// WF-5: derived-count surfaces — pin the two count literals that cannot be
// templated: the commands orientation line and the skills byCategory breakdown,
// both against the single-source deriver.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { checkSurfaceCount, checkByCategorySum } from './surface-helpers.mjs';

const COMMANDS_ORIENTATION_RE = /\.claude\/commands\/[^(]*\((\d+)\s+commands?\)/i;

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const derived = ctx.deriveCounts(ctx.root);
  for (const rel of ['CLAUDE.md', 'src/CLAUDE.template.md']) {
    const p = join(ctx.root, rel);
    if (!existsSync(p)) continue;
    const r = checkSurfaceCount(p, COMMANDS_ORIENTATION_RE, derived.commands);
    add(`commands count (${rel} orientation)`, r.status, r.detail);
  }
  const byCat = checkByCategorySum(ctx.SKILL_CATEGORIES, derived.skills);
  add('skills byCategory sum vs derived total', byCat.status, byCat.detail);
  return rows;
}
