#!/usr/bin/env node
// Domain: decides whether /archive invalidated the binding test verdict.
//
// `/integrate` stamps the PASS at Phase 9 and `/archive` changes the tree at
// Phase 10.5, so a workflow can commit a tree its verdict never saw. Re-running
// the suite at every archive closes that and costs ~5 minutes on every workflow,
// nearly all of which archive nothing a check reads. This says which case it is.
//
// Fail-safe by construction, the same contract as simplify/reverify-guard.mjs:
// only a provable match yields the skip signal (exit 3). A missing snapshot, a
// corrupt one, an unreadable tree, or an unknown command yields re-verify (exit
// 0). Skipping a verification is sound only when nothing it reads has moved.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { corpusDigest } from './corpus-digest.mjs';

const SKIP = { changed: false, verdict: 'skip', exitCode: 3 };
const REVERIFY = { changed: true, verdict: 're-verify', exitCode: 0 };

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

// Rejected, never repaired. The slug reaches a filesystem path, and normalizing a
// malformed one writes to a different path than the caller named, which hides the
// mistake at the only moment it is still cheap to fix (CWE-22).
export function assertSafeSlug(slug) {
  if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) {
    throw new Error(`archive reverify-guard: refusing an unsafe slug ${JSON.stringify(slug)}`);
  }
  return slug;
}

function snapshotPath(rootDir, slug) {
  assertSafeSlug(slug);
  return path.join(rootDir, '.claude', 'state', 'archive-reverify', `${slug}.json`);
}

export { corpusDigest };

export function capture({ rootDir, slug }) {
  const target = snapshotPath(rootDir, slug);
  mkdirSync(path.dirname(target), { recursive: true });
  const digest = corpusDigest({ rootDir });
  writeFileSync(target, `${JSON.stringify({ slug, digest }, null, 2)}\n`, 'utf8');
  return digest;
}

export function decide({ rootDir, slug }) {
  let stored;
  try {
    stored = JSON.parse(readFileSync(snapshotPath(rootDir, slug), 'utf8')).digest;
  } catch {
    return { ...REVERIFY, reason: 'no readable pre-archive snapshot' };
  }
  let current;
  try {
    current = corpusDigest({ rootDir });
  } catch {
    return { ...REVERIFY, reason: 'the archive tree could not be read' };
  }
  if (typeof stored !== 'string' || stored !== current) {
    return { ...REVERIFY, reason: 'the archive changed what the corpus checks read' };
  }
  return { ...SKIP, reason: 'the archive added no artifact type or content the corpus checks read' };
}

function main(argv) {
  const [command, slug] = argv;
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (command === 'capture') {
    process.stdout.write(`${JSON.stringify({ digest: capture({ rootDir, slug }) })}\n`);
    return 0;
  }
  if (command === 'check') {
    const verdict = decide({ rootDir, slug });
    process.stdout.write(`${JSON.stringify(verdict)}\n`);
    return verdict.exitCode;
  }
  process.stderr.write('archive reverify-guard: usage: reverify-guard.mjs <capture|check> <slug>\n');
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`archive reverify-guard: ${err.message}\n`);
    process.exitCode = 0;
  }
}
