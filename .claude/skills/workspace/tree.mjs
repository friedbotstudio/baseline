// Foundation — reading the WORKING TREE.
//
// Split out of store.mjs, which had grown to hold two filesystem responsibilities:
// the corpus (records the model owns) and the tree (source the model points AT).
// They differ in who writes them — the corpus is ours, the tree is the subject —
// so a change to one should not be able to break the other.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A `..` segment in an anchor or a member id escapes the tree the corpus is
// contracted to describe. REJECT, never normalize — the same register as
// assertSafeFactKey, and for the same reason: silently rewriting the path would
// read a different file than the author named.
export function assertNoTraversal(rel) {
  const text = String(rel ?? '');
  if (text.split(/[\\/]/).includes('..')) {
    throw new Error(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(text)}`);
  }
  return text;
}

export function readSourceText(rootDir, rel) {
  assertNoTraversal(rel);
  const path = join(rootDir, rel);
  try {
    return statSync(path).isFile() ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

const UNWALKED = new Set(['.git', 'node_modules']);

// Symlinks are returned as entries but never descended into: `Dirent.isDirectory()`
// is false for a symlink under `withFileTypes`, so a symlink cycle terminates
// instead of recursing forever (CWE-674, probed in the phase-8 review).
export function walkFiles(rootDir, prefix = '') {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(rootDir, prefix), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (UNWALKED.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(rootDir, rel));
    else out.push(rel);
  }
  return out;
}
