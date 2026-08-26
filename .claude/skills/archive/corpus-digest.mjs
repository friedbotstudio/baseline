#!/usr/bin/env node
// Foundation — a fingerprint of what any check actually reads out of docs/archive.
//
// Split out of reverify-guard.mjs when that module crossed the 80-line budget. It
// computes a value and decides nothing, so it has no reason to change when the
// snapshot format or the verdict rules do.
//
// The three components below were MEASURED, not guessed. The first version hashed
// every file in every bundle, which is safe and useless: an archive always writes
// a fresh workflow.json and timing.md, so the digest always moved and the guard
// re-ran every time. Finding what genuinely reads the live tree gave this set.

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { readCorpus } from '../harness/timing-corpus.mjs';
import { envelopeFor } from '../harness/envelope.mjs';

function walk(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.isFile()) visit(full, entry.name);
  }
}

// 1. The artifact TYPES present. A bundle carrying a filename no bundle carried
//    before is a shape change, and shape is what a structural check asserts on.
// 2. Every archived spec, by path and content. `drift-check-contracts` sweeps all
//    of them and scores each, and `spec-drift-repair` resolves one by walking date
//    directories newest-first — so both the SET and the CONTENT are read.
// Bundle count and bundle paths are deliberately absent: they move on every single
// archive, and nothing asserts on them.
function treeFacts(rootDir) {
  const root = path.join(rootDir, 'docs', 'archive');
  if (!existsSync(root)) return { kinds: [], specs: [] };
  const kinds = new Set();
  const specs = [];
  walk(root, (full, name) => {
    kinds.add(name);
    if (name !== 'spec.md') return;
    const sha = createHash('sha256').update(readFileSync(full)).digest('hex');
    specs.push(`${path.relative(root, full)}:${sha}`);
  });
  return { kinds: [...kinds].sort(), specs: specs.sort() };
}

// 3. The fitted envelope per track — the value that re-fitted and broke CI. A
//    bundle that is not yet `measured` moves nothing here, which is what lets an
//    ordinary landing skip. Tracks come from the corpus rather than a literal, so
//    a new track needs no edit.
function envelopeFacts(rootDir) {
  const tracks = [...new Set(readCorpus({ rootDir }).map((b) => b.track).filter(Boolean))].sort();
  return tracks.map((track) => {
    const fit = envelopeFor({ rootDir, track });
    return `${track}:${fit.envelope_tokens}:${fit.fitted}:${fit.sample_count}`;
  });
}

export function corpusDigest({ rootDir }) {
  const { kinds, specs } = treeFacts(rootDir);
  const rows = [
    `kinds\n${kinds.join('\n')}`,
    `specs\n${specs.join('\n')}`,
    `envelopes\n${envelopeFacts(rootDir).join('\n')}`,
  ];
  return createHash('sha256').update(rows.join('\n--\n')).digest('hex');
}
