// Domain — branded upgrade flow with three-tier merge orchestration.
// Plan/apply split:
//   1. detect pending semantic-merge stage (idempotency short-circuit, AC-007)
//   2. dry-run threeWayMerge → enumerate SKIP_CUSTOMIZED conflicts (tier-1 only)
//   3. prompt the user once per tier-1 conflict (with Show-diff loop, cap-at-2)
//   4. on cancel/abort: bail before any write
//   5. on resolve: real threeWayMerge with onSkipCustomized backed by the Map.
// Tier-2 MECHANICAL and tier-3 SEMANTIC files are NOT prompted — they're
// dispatched by the merge engine via upgrade-tiers.dispatchByTier.

import * as clackModule from '@clack/prompts';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { threeWayMerge, ACTION_KINDS } from '../merge.js';
import { loadManifest, buildManifestFromDir } from '../manifest.js';
import { COPY_EXCLUDE } from '../install.js';
import { findPendingStage } from '../upgrade-tiers.js';
import { renderUnifiedDiff } from '../diff-render.js';
import { renderBrandStrip } from './splash.js';

const SUCCESS = 0;
const ERR_ABORT = 1;
const ERR_NO_MANIFEST = 2;
const ERR_DIVERGENCE = 3;
const ERR_MECHANICAL_CONFLICTED = 4;
const ERR_SEMANTIC_STAGED = 5;

const CHOICE_OPTIONS = [
  { value: 'keep-mine', label: 'Keep your version', hint: 'preserve target file as-is' },
  { value: 'take-theirs', label: 'Use new baseline', hint: 'overwrite with new template' },
  { value: 'show-diff', label: 'Show diff', hint: 'render local vs incoming and re-prompt' },
  { value: 'abort', label: 'Abort', hint: 'exit without changes' },
];

const SHOW_DIFF_CONSECUTIVE_CAP = 2;

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

  const pending = await findPendingStage(target);
  if (pending) return reportPendingStage(prompts, pending);

  const { oldManifest, newManifest } = await loadManifests(opts.templateDir, manifestPath);
  if (isLegacyManifest(oldManifest)) {
    prompts.log.warn('legacy manifest_version: 1 detected; BASE-content recovery unavailable. Tier-2 / tier-3 files will fall back to the binary prompt.');
  }

  const dryReport = await threeWayMerge(opts.templateDir, target, oldManifest, newManifest, { dryRun: true });
  const conflicts = dryReport.actions.filter((a) => a.kind === ACTION_KINDS.SKIP_CUSTOMIZED);

  const choices = new Map();
  const aborted = await collectUserChoices(prompts, conflicts, opts.templateDir, target, choices);
  if (aborted) {
    prompts.cancel('Upgrade aborted; tree unchanged.');
    return ERR_ABORT;
  }

  if (opts.dryRun) {
    for (const action of dryReport.actions) {
      prompts.log.info(`${action.kind.padEnd(28)} ${action.path}`);
    }
    prompts.outro('Dry run complete; no changes written.');
    return SUCCESS;
  }

  const onSkipCustomized = (rel) => choices.get(rel) ?? 'keep-mine';
  const finalReport = await threeWayMerge(opts.templateDir, target, oldManifest, newManifest, { onSkipCustomized });

  for (const action of finalReport.actions) {
    if (isReportableAction(action.kind)) {
      prompts.log.info(`${action.kind.padEnd(28)} ${action.path}`);
    }
    if (action.kind === ACTION_KINDS.MECHANICAL_MERGE_CONFLICTED) {
      prompts.log.warn(`Merged with conflicts — resolve in ${action.path}`);
    }
  }

  const stagedCount = finalReport.actions.filter((a) => a.kind === ACTION_KINDS.SEMANTIC_MERGE_STAGED).length;
  if (stagedCount > 0) {
    prompts.log.info(`${stagedCount} file(s) need semantic merge. Open Claude Code and run /upgrade-project to reconcile.`);
  }

  const applied = finalReport.actions.filter((a) => isApplied(a.kind)).length;
  const skipped = finalReport.actions.filter((a) => a.kind === ACTION_KINDS.SKIP_CUSTOMIZED).length;
  prompts.outro(`Applied ${applied}; ${skipped} skipped.`);
  return mapExitCode(finalReport.exitCode);
}

function reportPendingStage(prompts, pending) {
  const fileLines = pending.files.map((f) => `  - ${f}`).join('\n');
  prompts.log.warn(`Pending semantic-merge stage at ${pending.stage_ts}.\n${pending.files.length} file(s) awaiting reconciliation:\n${fileLines}\nOpen Claude Code and run /upgrade-project to reconcile.`);
  prompts.outro('No new work; existing stage pending.');
  return ERR_SEMANTIC_STAGED;
}

function isLegacyManifest(m) {
  if (!m) return false;
  if (m.manifest_version === 1) return true;
  return typeof m.baseline_version !== 'string';
}

async function collectUserChoices(prompts, conflicts, templateDir, target, choices) {
  for (const conflict of conflicts) {
    const choice = await pickForFile(prompts, conflict.path, templateDir, target);
    if (choice === 'abort') return true;
    if (choice !== null) choices.set(conflict.path, choice);
  }
  return false;
}

async function pickForFile(prompts, rel, templateDir, target) {
  let consecutiveShowDiff = 0;
  while (true) {
    const choice = await prompts.select({
      message: `${rel} has been customized — choose:`,
      options: CHOICE_OPTIONS,
    });
    if (prompts.isCancel(choice)) return 'abort';
    if (choice !== 'show-diff') return choice;
    await renderConflictDiff(prompts, rel, templateDir, target);
    consecutiveShowDiff++;
    if (consecutiveShowDiff >= SHOW_DIFF_CONSECUTIVE_CAP) {
      prompts.log.info(`Show-diff picked ${SHOW_DIFF_CONSECUTIVE_CAP} times for ${rel}; falling through (keeping your version). Re-run if you want to choose differently.`);
      return null;
    }
  }
}

async function renderConflictDiff(prompts, rel, templateDir, target) {
  const localBytes = await readFile(join(target, rel), 'utf8');
  const incomingBytes = await readFile(join(templateDir, rel), 'utf8');
  const diff = renderUnifiedDiff(localBytes, incomingBytes, { colorize: process.stdout.isTTY === true });
  prompts.log.info(`Diff for ${rel} (local → incoming):\n${diff}`);
}

function isReportableAction(kind) {
  return (
    kind === ACTION_KINDS.MECHANICAL_MERGE_CLEAN ||
    kind === ACTION_KINDS.MECHANICAL_MERGE_CONFLICTED ||
    kind === ACTION_KINDS.SEMANTIC_MERGE_STAGED
  );
}

function isApplied(kind) {
  return (
    kind === ACTION_KINDS.ADD ||
    kind === ACTION_KINDS.OVERWRITE ||
    kind === ACTION_KINDS.PRUNE ||
    kind === ACTION_KINDS.SPECIAL_MERGE ||
    kind === ACTION_KINDS.NEVER_TOUCH_ADD ||
    kind === ACTION_KINDS.MECHANICAL_MERGE_CLEAN
  );
}

function mapExitCode(mergeExit) {
  if (mergeExit === 5) return ERR_SEMANTIC_STAGED;
  if (mergeExit === 4) return ERR_MECHANICAL_CONFLICTED;
  if (mergeExit === 3) return ERR_DIVERGENCE;
  return SUCCESS;
}

async function loadManifests(templateDir, manifestPath) {
  const oldManifest = await loadManifest(manifestPath);
  const tplFiles = await listShippedFiles(templateDir);
  const newManifest = await buildManifestFromDir(templateDir, tplFiles);
  await overlayShippedTiers(templateDir, newManifest);
  return { oldManifest, newManifest };
}

async function overlayShippedTiers(templateDir, newManifest) {
  const shippedPath = join(templateDir, '.claude/manifest.json');
  if (!existsSync(shippedPath)) return;
  const shipped = JSON.parse(await readFile(shippedPath, 'utf8'));
  if (!shipped?.files) return;
  for (const rel of Object.keys(newManifest.files)) {
    const shippedEntry = shipped.files[rel];
    if (shippedEntry && typeof shippedEntry === 'object' && typeof shippedEntry.tier === 'string') {
      newManifest.files[rel] = { sha256: newManifest.files[rel], tier: shippedEntry.tier };
    }
  }
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
  return acc.filter((p) => !COPY_EXCLUDE.includes(p));
}
