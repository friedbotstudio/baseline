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

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveCategory } from '../memory-index/lift-fields.mjs';

const ID_RE = /Q-(\d+)\b/;

// The id lives in the entry KEY, not the filename: a shard is stored under a
// CWE-22-safe lowercase slug (`q-002-...`), so reading the filename would miss the
// match and silently restart numbering at Q-001 — the exact collision this
// allocator exists to prevent.
function nextId(memdir) {
  const { entries } = resolveCategory(memdir, 'pending-questions');
  let max = 0;
  for (const entry of entries) {
    const match = ID_RE.exec(entry.key);
    if (!match) continue;
    const n = parseInt(match[1], 10);
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
