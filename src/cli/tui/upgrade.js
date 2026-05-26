// Domain — branded upgrade flow with three-tier merge orchestration.
// Plan/apply split:
//   1. detect pending semantic-merge stage (idempotency short-circuit, AC-007)
//   2. dry-run threeWayMerge → enumerate SKIP_CUSTOMIZED conflicts (tier-1 only)
//   3. prompt the user once per tier-1 conflict: Keep your version / Use new
//      baseline / Merge / Abort. The Merge pick stages incoming bytes for
//      /upgrade-project to reconcile (tier1-merge-option spec).
//   4. on cancel/abort: bail before any write
//   5. on resolve: real threeWayMerge with onSkipCustomized backed by the Map.
// Tier-2 MECHANICAL and tier-3 SEMANTIC files are NOT prompted — they're
// dispatched by the merge engine via upgrade-tiers.dispatchByTier.

import * as clackModule from '@clack/prompts';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { threeWayMerge, ACTION_KINDS, ACTION_LABELS, ACTION_LABEL_WIDTH, isVersionAwareNoop } from '../merge.js';
import { loadManifest, buildManifestFromDir } from '../manifest.js';
import { COPY_EXCLUDE } from '../install.js';
import { findPendingStage, formatStageTimestamp } from '../upgrade-tiers.js';
import { renderHeader } from './splash.js';

const SUCCESS = 0;
const ERR_ABORT = 1;
const ERR_NO_MANIFEST = 2;
const ERR_DIVERGENCE = 3;
const ERR_MECHANICAL_CONFLICTED = 4;
const ERR_SEMANTIC_STAGED = 5;

const CHOICE_OPTIONS = [
  { value: 'keep-mine', label: 'Keep your version', hint: 'preserve target file as-is' },
  { value: 'take-theirs', label: 'Use new baseline', hint: 'overwrite with new template' },
  { value: 'merge', label: 'Merge', hint: 'stage incoming bytes for /upgrade-project to reconcile' },
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
  process.stdout.write(renderHeader({ version, subtitle: 'upgrade' }));
  prompts.intro('create-baseline upgrade');

  const pending = await findPendingStage(target);
  if (pending) return reportPendingStage(prompts, pending);

  const { oldManifest, newManifest, currentVersion } = await loadManifests(opts.templateDir, manifestPath);

  const fastPath = await isVersionAwareNoop({
    target,
    templateDir: opts.templateDir,
    oldManifest,
    newManifest,
    currentVersion,
  });
  if (fastPath.hit) {
    prompts.outro(`already on baseline ${fastPath.version}; nothing to do`);
    return SUCCESS;
  }

  if (isLegacyManifest(oldManifest)) {
    prompts.log.warn("Your previous install predates version-tracked manifests, so this upgrade can't perform automatic three-way merges on customized files. You'll be prompted to keep your version or take the new baseline for each customized file. After you finish, run `/upgrade-project` in Claude Code on any staged files — the reconciliations are recorded so future upgrades silently skip files you've already reviewed against the current baseline.");
  }

  const dryReport = await threeWayMerge(opts.templateDir, target, oldManifest, newManifest, { dryRun: true });
  const conflicts = dryReport.actions.filter((a) => a.kind === ACTION_KINDS.SKIP_CUSTOMIZED);

  const choices = new Map();
  const aborted = await collectUserChoices(prompts, conflicts, choices);
  if (aborted) {
    prompts.cancel('Upgrade aborted; tree unchanged.');
    return ERR_ABORT;
  }

  if (opts.dryRun) {
    for (const action of dryReport.actions) {
      const label = ACTION_LABELS[action.kind] ?? action.kind;
      prompts.log.info(`${label.padEnd(ACTION_LABEL_WIDTH)}  ${action.path}`);
    }
    prompts.outro('Dry run complete; no changes written.');
    return SUCCESS;
  }

  const onSkipCustomized = (rel) => choices.get(rel) ?? 'keep-mine';
  const finalReport = await threeWayMerge(opts.templateDir, target, oldManifest, newManifest, { onSkipCustomized });

  for (const action of finalReport.actions) {
    if (isReportableAction(action.kind)) {
      const label = ACTION_LABELS[action.kind] ?? action.kind;
      prompts.log.info(`${label.padEnd(ACTION_LABEL_WIDTH)}  ${action.path}`);
    }
    if (action.kind === ACTION_KINDS.MECHANICAL_MERGE_CONFLICTED) {
      prompts.log.warn(`Merged with conflicts — resolve in ${action.path}`);
    }
  }

  const stagedCount = finalReport.actions.filter((a) => a.kind === ACTION_KINDS.SEMANTIC_MERGE_STAGED).length;
  if (stagedCount > 0) {
    prompts.log.info(`${stagedCount} file(s) staged. Open Claude Code and run /upgrade-project to reconcile.`);
  }

  const applied = finalReport.actions.filter((a) => isApplied(a.kind)).length;
  const skipped = finalReport.actions.filter((a) => a.kind === ACTION_KINDS.SKIP_CUSTOMIZED).length;
  prompts.outro(
    skipped === 0
      ? `Applied ${applied} update(s).`
      : `Applied ${applied} update(s); kept your version on ${skipped} customized file(s). Re-run \`create-baseline upgrade\` if you want to revisit those choices.`,
  );
  return mapExitCode(finalReport.exitCode);
}

function reportPendingStage(prompts, pending) {
  const fileLines = pending.files.map((f) => `  - ${f}`).join('\n');
  prompts.log.warn(`A previous upgrade staged ${pending.files.length} file(s) for Claude Code review (staged ${formatStageTimestamp(pending.stage_ts)}):\n${fileLines}\nOpen Claude Code and run /upgrade-project to reconcile.`);
  prompts.outro('No new work; previous staged files still need reconciliation.');
  return ERR_SEMANTIC_STAGED;
}

function isLegacyManifest(m) {
  if (!m) return false;
  if (m.manifest_version === 1) return true;
  return typeof m.baseline_version !== 'string';
}

async function collectUserChoices(prompts, conflicts, choices) {
  for (const conflict of conflicts) {
    const choice = await pickForFile(prompts, conflict.path);
    if (choice === 'abort') return true;
    choices.set(conflict.path, choice);
  }
  return false;
}

async function pickForFile(prompts, rel) {
  const choice = await prompts.select({
    message: `${rel} has been customized — choose:`,
    options: CHOICE_OPTIONS,
  });
  if (prompts.isCancel(choice)) return 'abort';
  return choice;
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
  const currentVersion = await readPackageVersion();
  const newManifest = await buildManifestFromDir(templateDir, tplFiles, { baseline_version: currentVersion });
  await overlayShippedTiers(templateDir, newManifest);
  return { oldManifest, newManifest, currentVersion };
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
