#!/usr/bin/env node
// Q-ID allocator for pending-questions.md. Reads the canonical file,
// finds the highest `## Q-NNN[ — suffix]` heading, and prints the next
// Q-NNN (max + 1) to stdout, zero-padded to 3 digits.
//
// Usage:
//   node .claude/skills/memory-flush/next-q-id.mjs
//   node .claude/skills/memory-flush/next-q-id.mjs --memory-dir .claude/memory
//
// Output: a single line `Q-NNN\n`. Exit 0 always (no entries → Q-001).
// Used by any skill that needs to append a new question — avoids manual
// numbering collisions when two skills write in the same session.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HEADING_RE = /^##\s+Q-(\d+)\b/gm;

function nextId(memdir) {
  const path = join(memdir, 'pending-questions.md');
  if (!existsSync(path)) return 1;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return 1; }
  let max = 0;
  let m;
  while ((m = HEADING_RE.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function formatId(n) {
  return `Q-${String(n).padStart(3, '0')}`;
}

function defaultMemoryDir() {
  // The script ships at .claude/skills/memory-flush/next-q-id.mjs; default
  // memory dir is the sibling .claude/memory/. Two levels up from this
  // file's directory is the .claude/ root.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'memory');
}

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { 'memory-dir': { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    process.stderr.write(`next-q-id: ${err.message}\n`);
    return 2;
  }
  const memdir = values['memory-dir'] ? resolve(values['memory-dir']) : defaultMemoryDir();
  process.stdout.write(formatId(nextId(memdir)) + '\n');
  return 0;
}

process.exit(main(process.argv.slice(2)));
