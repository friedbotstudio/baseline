// Foundation — reading the WORKING TREE.
//
// Split out of store.mjs, which had grown to hold two filesystem responsibilities:
// the corpus (records the model owns) and the tree (source the model points AT).
// They differ in who writes them — the corpus is ours, the tree is the subject —
// so a change to one should not be able to break the other.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// An anchor that escapes the tree the corpus is contracted to describe. REJECT,
// never normalize — silently rewriting the path would read a different file than
// the author named.
//
// Two spellings of the same intent, both previously unguarded (backlog -7e51): a
// `..` segment was refused loudly while a LEADING SEPARATOR was quietly
// reinterpreted, because `join('.', '/etc/passwd')` yields `etc/passwd`. A drive
// or UNC prefix is the Windows spelling of the same escape. Anchors are contracted
// to be repo-relative, so no legitimate anchor is affected.
const ABSOLUTE_PREFIX = /^([\\/]|[A-Za-z]:)/;

export function assertNoTraversal(rel) {
  const text = String(rel ?? '');
  const reject = () => {
    throw new Error(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(text)}`);
  };
  if (text.split(/[\\/]/).includes('..')) reject();
  if (ABSOLUTE_PREFIX.test(text)) reject();
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

// The symmetric write. `writeWorkspaceFile` covers a corpus SUBDIRECTORY and takes
// a kind; a root-level file such as README.md has no kind, and passing an empty
// one would be a hack at every call site. Siting the pair together is what keeps
// the Domain modules free of node:fs.
export function writeSourceText(rootDir, rel, text) {
  assertNoTraversal(rel);
  const path = join(rootDir, rel);
  writeFileSync(path, text, 'utf8');
  return path;
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
