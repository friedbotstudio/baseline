#!/usr/bin/env node
// Covers AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007 of seed-template-mirror-autosync.
// Reconcile the live constitution into its derived shippable template mirrors.
//
// The maintainer amends the LIVE files (docs/init/seed.md is edited first per
// Article I.4, then CLAUDE.md); src/*.template.md is a DERIVED artifact that
// build Stage 2 overlays into obj/template. This helper keeps the invariant
// `template == reconcile(live)`:
//   - seed  → SPLICE: live head (<§16) + the template's reserved §16 block + live tail (§17..)
//   - CLAUDE → FULL byte-for-byte copy (no carve-out)
//
// --check exits 1 on drift (CI / npm test early-detection); --write reconciles
// (the one-command fix + build self-heal). Missing source or absent §16/§17
// markers fail closed (exit 2, zero writes). Stdlib only.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

// --- Foundation: markers, mirror pairs, the splice ---------------------------

const SEC16 = '\n## §16 — Project-specific configuration';
const SEC17 = '\n## §17';

const MIRROR_PAIRS = [
  { live: 'docs/init/seed.md', template: 'src/seed.template.md', kind: 'splice' },
  { live: 'CLAUDE.md', template: 'src/CLAUDE.template.md', kind: 'full' },
];

class ReconcileError extends Error {}

export function spliceSeedTemplate(liveSeed, currentTemplate) {
  const liveHeadEnd = liveSeed.indexOf(SEC16);
  const liveTailStart = liveSeed.indexOf(SEC17);
  const tplBlockStart = currentTemplate.indexOf(SEC16);
  const tplBlockEnd = currentTemplate.indexOf(SEC17);
  if (liveHeadEnd < 0 || liveTailStart < 0) {
    throw new ReconcileError('live seed missing the §16 or §17 marker');
  }
  if (tplBlockStart < 0 || tplBlockEnd < 0) {
    throw new ReconcileError('seed template missing the §16 or §17 marker');
  }
  return (
    liveSeed.slice(0, liveHeadEnd) +
    currentTemplate.slice(tplBlockStart, tplBlockEnd) +
    liveSeed.slice(liveTailStart)
  );
}

function readUtf8(path) {
  if (!existsSync(path)) throw new ReconcileError(`missing file: ${path}`);
  return readFileSync(path, 'utf8');
}

function desiredTemplate(pair, rootDir) {
  const live = readUtf8(join(rootDir, pair.live));
  if (pair.kind === 'full') return live;
  return spliceSeedTemplate(live, readUtf8(join(rootDir, pair.template)));
}

// --- Domain: reconcile ------------------------------------------------------

export function reconcile({ rootDir = process.cwd(), mode = 'check' } = {}) {
  try {
    const plan = MIRROR_PAIRS.map((pair) => {
      const templatePath = join(rootDir, pair.template);
      const current = existsSync(templatePath) ? readFileSync(templatePath, 'utf8') : null;
      return { pair, templatePath, desired: desiredTemplate(pair, rootDir), current };
    });
    const drifted = plan.filter((t) => t.desired !== t.current);
    if (mode === 'write') {
      for (const t of drifted) writeFileSync(t.templatePath, t.desired);
      return { mode, drifted: [], written: drifted.map((t) => t.pair.template), exitCode: 0 };
    }
    return { mode, drifted: drifted.map((t) => t.pair.template), written: [], exitCode: drifted.length ? 1 : 0 };
  } catch (err) {
    if (err instanceof ReconcileError) {
      return { mode, drifted: [], written: [], exitCode: 2, error: err.message };
    }
    throw err;
  }
}

// --- Orchestration: CLI -----------------------------------------------------

function parseArgs(argv) {
  let mode = null;
  let rootDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') mode = 'check';
    else if (argv[i] === '--write') mode = 'write';
    else if (argv[i] === '--root') rootDir = argv[++i];
  }
  return { mode, rootDir };
}

function reportCheck(result) {
  if (result.exitCode === 1) {
    process.stderr.write(`constitution mirror drift: ${result.drifted.join(', ')}\n`);
    process.stderr.write('run `npm run sync:constitution` to reconcile\n');
  } else {
    process.stdout.write('constitution mirror: in sync\n');
  }
}

function reportWrite(result) {
  process.stdout.write(
    result.written.length
      ? `constitution mirror: wrote ${result.written.join(', ')}\n`
      : 'constitution mirror: already in sync\n',
  );
}

function main(argv) {
  const { mode, rootDir } = parseArgs(argv);
  if (!mode) {
    process.stderr.write('usage: sync-constitution-mirror.mjs --check|--write [--root <dir>]\n');
    process.exit(2);
  }
  const result = reconcile({ rootDir, mode });
  if (result.exitCode === 2) {
    process.stderr.write(`constitution mirror: ${result.error}\n`);
    process.exit(2);
  }
  if (mode === 'check') reportCheck(result);
  else reportWrite(result);
  process.exit(result.exitCode);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) main(process.argv.slice(2));
