// remove-python-runtime-dep — Covers AC-003 (zero python3 references in shipped baseline tree).
//
// After the port lands, no shipped baseline file under `.claude/skills/` or
// `scripts/` may contain a literal `python3` invocation. Two analyzer patterns
// are exempt: they DETECT user-shipped python3 invocations (matching `python3?`
// in a regex) and SHOULD keep matching it.
//
// Failure mode this test catches: the implement worker missed a wrapper, a
// SKILL.md SOP, or a test fixture, and a python3 reference still ships.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

// Files whose JOB IS to mention python3 (analyzer regexes that catch
// user-shipped python3 invocations). The repo-relative paths are exempt.
const EXEMPT_FILES = new Set([
  '.claude/skills/spec-shippability-review/analyzer.mjs',
  '.claude/skills/spec-shippability-review/SKILL.md',
  // shipped-tree-no-dev-refs.test.mjs has the same role at the test layer
  // but lives outside .claude/skills/, so it isn't scanned anyway.
]);

const SCAN_ROOTS = [
  '.claude/skills',
  'scripts',
];

const EXTENSIONS = new Set(['.sh', '.mjs', '.md']);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

async function findPython3Refs() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root);
    try { await stat(abs); } catch { continue; }
    for await (const file of walk(abs)) {
      const ext = file.slice(file.lastIndexOf('.'));
      if (!EXTENSIONS.has(ext)) continue;
      const rel = relative(REPO_ROOT, file);
      if (EXEMPT_FILES.has(rel)) continue;
      const text = await readFile(file, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\bpython3\b/.test(lines[i])) {
          hits.push({ file: rel, line: i + 1, content: lines[i].trim().slice(0, 120) });
        }
      }
    }
  }
  return hits;
}

describe('no python3 references in shipped baseline tree', () => {
  it('finds zero python3 invocations under .claude/skills/ and scripts/ (excluding analyzer regex files)', async () => {
    const hits = await findPython3Refs();
    if (hits.length > 0) {
      const sample = hits.slice(0, 10)
        .map(h => `  ${h.file}:${h.line}  ${h.content}`)
        .join('\n');
      const more = hits.length > 10 ? `\n  ...and ${hits.length - 10} more` : '';
      assert.fail(`Expected zero python3 references; found ${hits.length}:\n${sample}${more}`);
    }
    assert.equal(hits.length, 0);
  });
});
