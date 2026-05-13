#!/usr/bin/env node
// install-smoke-verify.mjs — post-install manifest hash diff.
//
// Invoked by the release workflow's install-smoke job after `npm install
// create-baseline@<v>` + running the CLI against a target directory. Compares
// every files{}-hash in the PUBLISHED manifest (shipped in the installed
// tarball) against the MATERIALIZED manifest the CLI wrote into the target.
// Exit non-zero with `HASH_MISMATCH: <path>` on the first mismatch. Materialized
// manifest is permitted to carry extra keys absent from published (locally-
// generated state files, etc.); only published-side keys are gated.
//
// Usage:
//   node install-smoke-verify.mjs <published-manifest-path> <materialized-manifest-path>
//
// Exit codes:
//   0 — every published files{} key matches the materialized hash
//   1 — at least one HASH_MISMATCH or a manifest file is unreadable
//   2 — bad invocation (wrong arg count)

import { readFileSync } from 'node:fs';

const [, , publishedPath, materializedPath] = process.argv;
if (!publishedPath || !materializedPath) {
  process.stderr.write('usage: install-smoke-verify <published-manifest-path> <materialized-manifest-path>\n');
  process.exit(2);
}

function loadManifest(label, path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    process.stderr.write(`${label} manifest unreadable at ${path}: ${e.message}\n`);
    process.exit(1);
  }
}

const published = loadManifest('published', publishedPath);
const materialized = loadManifest('materialized', materializedPath);

const publishedFiles = published.files || {};
const materializedFiles = materialized.files || {};

let checked = 0;
for (const [relpath, publishedHash] of Object.entries(publishedFiles)) {
  if (materializedFiles[relpath] !== publishedHash) {
    process.stderr.write(`HASH_MISMATCH: ${relpath}\n`);
    process.stderr.write(`  published:    ${publishedHash}\n`);
    process.stderr.write(`  materialized: ${materializedFiles[relpath] ?? '(absent)'}\n`);
    process.exit(1);
  }
  checked += 1;
}

process.stdout.write(`install-smoke OK: ${checked} file hashes verified\n`);
process.exit(0);
