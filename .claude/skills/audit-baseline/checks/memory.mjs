// Memory store shape — the .claude/memory directory, its canonical categories
// (sharded dirs OR the classic flat files), and the README. Detects the on-disk
// shape and validates accordingly; the two layouts are byte-distinct.
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Re-exported so the docs site's _data/roster.cjs renders the same list this check
// validates. The list itself now lives in memory-index/categories.mjs (spec
// decision B2) — one oracle, every reader.
export { CANONICAL } from '../../memory-index/categories.mjs';
import { CANONICAL } from '../../memory-index/categories.mjs';

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const memDir = join(ctx.root, '.claude', 'memory');
  if (!existsSync(memDir) || !statSync(memDir).isDirectory()) {
    add('memory directory exists', 'FAIL', 'missing .claude/memory/');
    return rows;
  }
  add('memory directory exists', 'PASS', '');
  const memShape = ctx.checkMemoryShape(memDir);
  if (memShape.categories > 0) {
    if (memShape.ok) add('memory files present', 'PASS', `sharded: ${memShape.categories} category dirs, ${memShape.trails} continuity trails`);
    else add('memory files present', 'FAIL', `sharded store incomplete — missing category dirs: ${JSON.stringify(memShape.missing)}`);
    for (const name of CANONICAL) {
      const dir = join(memDir, name);
      const ok = existsSync(dir) && statSync(dir).isDirectory();
      const n = ok ? ctx.listDir(`.claude/memory/${name}`).filter(f => f.endsWith('.md')).length : 0;
      add(`memory shape: ${name}/`, ok ? 'PASS' : 'FAIL', ok ? `${n} fact file(s)` : 'missing category dir');
    }
  } else {
    const diskMemory = new Set(ctx.listDir('.claude/memory').filter(n => n.endsWith('.md') && n !== 'README.md').map(n => n.replace(/\.md$/, '')));
    const missing = [...ctx.EXPECTED_MEMORY_FILES].filter(x => !diskMemory.has(x)).sort();
    const unexpected = [...diskMemory].filter(x => !ctx.EXPECTED_MEMORY_FILES.has(x)).sort();
    if (missing.length || unexpected.length) {
      const bits = [];
      if (missing.length) bits.push(`missing: ${JSON.stringify(missing)}`);
      if (unexpected.length) bits.push(`unexpected: ${JSON.stringify(unexpected)}`);
      add('memory files present', 'FAIL', bits.join('; '));
    } else {
      add('memory files present', 'PASS', `${diskMemory.size} files`);
    }
    for (const name of [...ctx.EXPECTED_MEMORY_FILES].sort()) {
      const p = join(memDir, `${name}.md`);
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf8');
      if (name === '_pending' || name === '_thread') { add(`memory shape: ${name}.md`, 'PASS', ''); continue; }
      const [ok, reason] = ctx.isValidPreamble(text);
      if (!ok) { add(`memory shape: ${name}.md`, 'FAIL', reason); continue; }
      const splitOnce = text.split('---');
      const body = splitOnce.length >= 3 ? splitOnce.slice(2).join('---') : text;
      const entryCount = (body.replace(/^```[\s\S]*?^```\s*$/gm, '').match(/^##\s+\S/gm) || []).length;
      add(`memory shape: ${name}.md`, 'PASS', entryCount > 0 ? `${entryCount} entries` : 'empty (preamble-only)');
    }
  }
  add('memory README', existsSync(join(memDir, 'README.md')) ? 'PASS' : 'FAIL', existsSync(join(memDir, 'README.md')) ? '' : 'missing .claude/memory/README.md');
  return rows;
}
