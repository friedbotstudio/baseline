// Domain — branded upgrade flow with interactive per-file conflict resolution.
// Plan/apply split:
//   1. dry-run threeWayMerge → enumerate SKIP_CUSTOMIZED conflicts
//   2. prompt the user once per conflict
//   3. on cancel/abort: bail before any write
//   4. on resolve: real threeWayMerge with onSkipCustomized backed by the Map

import * as clackModule from '@clack/prompts';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { threeWayMerge, ACTION_KINDS } from '../merge.js';
import { loadManifest, buildManifestFromDir } from '../manifest.js';
import { COPY_EXCLUDE } from '../install.js';
import { renderBrandStrip } from './splash.js';

const SUCCESS = 0;
const ERR_ABORT = 1;
const ERR_NO_MANIFEST = 2;
const ERR_DIVERGENCE = 3;

const CHOICE_OPTIONS = [
  { value: 'keep-mine', label: 'Keep mine', hint: 'preserve target file as-is' },
  { value: 'take-theirs', label: 'Take theirs', hint: 'overwrite with new baseline' },
  { value: 'abort', label: 'Abort', hint: 'exit without changes' },
];

export async function run({ target, opts = {}, prompts = clackModule } = {}) {
  if (!target || typeof target !== 'string') {
    throw new Error('tui.upgrade.run requires a non-empty string target');
  }
  if (!opts.templateDir) {
    throw new Error('tui.upgrade.run requires opts.templateDir');
  }

  const manifestPath = join(target, '.claude/.baseline-manifest.json');
  if (!existsSync(manifestPath)) {
    prompts.log.error(`No baseline manifest at ${manifestPath}. Run a fresh install first.`);
    return ERR_NO_MANIFEST;
  }

  const version = await readPackageVersion();
  process.stdout.write(renderBrandStrip({ version, subtitle: 'upgrade' }));
  prompts.intro('create-baseline upgrade');

  const { oldManifest, newManifest } = await loadManifests(opts.templateDir, manifestPath);
  const dryReport = await threeWayMerge(opts.templateDir, target, oldManifest, newManifest, { dryRun: true });
  const conflicts = dryReport.actions.filter((a) => a.kind === ACTION_KINDS.SKIP_CUSTOMIZED);

  const choices = new Map();
  for (const conflict of conflicts) {
    const choice = await prompts.select({
      message: `${conflict.path} has been customized — choose:`,
      options: CHOICE_OPTIONS,
    });
    if (prompts.isCancel(choice) || choice === 'abort') {
      prompts.cancel('Upgrade aborted; tree unchanged.');
      return ERR_ABORT;
    }
    choices.set(conflict.path, choice);
  }

  if (opts.dryRun) {
    for (const action of dryReport.actions) {
      prompts.log.info(`${action.kind.padEnd(24)} ${action.path}`);
    }
    prompts.outro('Dry run complete; no changes written.');
    return SUCCESS;
  }

  const onSkipCustomized = (rel) => choices.get(rel) ?? 'keep-mine';
  const finalReport = await threeWayMerge(opts.templateDir, target, oldManifest, newManifest, { onSkipCustomized });

  const applied = finalReport.actions.filter((a) => isApplied(a.kind)).length;
  const skipped = finalReport.actions.filter((a) => a.kind === ACTION_KINDS.SKIP_CUSTOMIZED).length;
  prompts.outro(`Applied ${applied}; ${skipped} skipped.`);
  return finalReport.exitCode === 3 ? ERR_DIVERGENCE : SUCCESS;
}

function isApplied(kind) {
  return (
    kind === ACTION_KINDS.ADD ||
    kind === ACTION_KINDS.OVERWRITE ||
    kind === ACTION_KINDS.PRUNE ||
    kind === ACTION_KINDS.SPECIAL_MERGE ||
    kind === ACTION_KINDS.NEVER_TOUCH_ADD
  );
}

async function loadManifests(templateDir, manifestPath) {
  const oldManifest = await loadManifest(manifestPath);
  const tplFiles = await listShippedFiles(templateDir);
  const newManifest = await buildManifestFromDir(templateDir, tplFiles);
  return { oldManifest, newManifest };
}

async function readPackageVersion() {
  try {
    const url = new URL('../../../package.json', import.meta.url);
    const pkg = JSON.parse(await readFile(url, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function listShippedFiles(root, base = root, acc = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) await listShippedFiles(full, base, acc);
    else if (entry.isFile()) acc.push(relative(base, full).split(sep).join('/'));
  }
  // COPY_EXCLUDE (single source of truth in install.js) now lists no paths —
  // the shipped manifest moved into `.claude/manifest.json` so the recursive
  // walk picks it up at the same path the consumer expects. The filter stays
  // for forward-compat; if a future path needs to be kept out of the merge,
  // add it to install.js → COPY_EXCLUDE in one place.
  return acc.filter((p) => !COPY_EXCLUDE.includes(p));
}
