// Domain — branded install flow. Composes the pure-data install + plantuml
// foundations behind a clack-style presentation seam. The `prompts` parameter
// defaults to @clack/prompts but is injected in tests.

import * as clackModule from '@clack/prompts';
import { readFile } from 'node:fs/promises';
import { freshInstall, forceInstall } from '../install.js';
import { fetchPlantumlIfMissing, FETCH_OUTCOMES, runJavaPreflight } from '../plantuml.js';
import { renderHeader } from './splash.js';

const SUCCESS = 0;
const ERR_INSTALL_FAILED = 1;
const ERR_PLANTUML_REQUIRED = 4;

export async function run({ target, opts = {}, prompts = clackModule } = {}) {
  if (!target || typeof target !== 'string') {
    throw new Error('tui.install.run requires a non-empty string target');
  }
  if (!opts.templateDir) {
    throw new Error('tui.install.run requires opts.templateDir');
  }

  const version = await readPackageVersion();
  process.stdout.write(renderHeader({ version, subtitle: 'install' }));
  prompts.intro('create-baseline');

  const spinner = prompts.spinner();
  spinner.start('Copying baseline files');

  try {
    await copyTemplate(target, opts);
  } catch (err) {
    spinner.error('Install failed');
    prompts.outro(err.message);
    return ERR_INSTALL_FAILED;
  }

  const javaExit = reportJavaPreflightBranded(opts, prompts);
  if (javaExit !== SUCCESS) return javaExit;
  const plantumlExit = await fetchPlantumlBranded(target, opts, prompts, spinner);
  if (plantumlExit !== SUCCESS) return plantumlExit;

  spinner.stop('Baseline installed');
  prompts.outro(`Installed at ${target}`);
  return SUCCESS;
}

async function copyTemplate(target, opts) {
  const installOpts = { withNpmrc: !!opts.withNpmrc };
  if (opts.force) await forceInstall(opts.templateDir, target, installOpts);
  else await freshInstall(opts.templateDir, target, installOpts);
}

function reportJavaPreflightBranded(opts, prompts) {
  if (opts.noPlantuml) return SUCCESS;
  const probe = runJavaPreflight();
  if (probe.present) return SUCCESS;
  if (opts.requirePlantuml) {
    prompts.outro(`--require-plantuml: Java not found on PATH (${probe.reason}). Install JDK 8+ and re-run.`);
    return ERR_PLANTUML_REQUIRED;
  }
  prompts.log.warn(`Java not found on PATH (${probe.reason}). PlantUML diagram validation will be skipped until Java is installed.`);
  return SUCCESS;
}

async function fetchPlantumlBranded(target, opts, prompts, spinner) {
  if (opts.noPlantuml) return SUCCESS;
  spinner.message('Fetching PlantUML jar');
  const result = await fetchPlantumlIfMissing(target, {
    noPlantuml: opts.noPlantuml,
    requirePlantuml: opts.requirePlantuml,
  });
  if (result.outcome === FETCH_OUTCOMES.ERRORED_REQUIRE_PLANTUML) {
    spinner.error('PlantUML required but unavailable');
    prompts.outro(result.reason);
    return ERR_PLANTUML_REQUIRED;
  }
  if (
    result.outcome === FETCH_OUTCOMES.WARNED_NETWORK_FAILURE ||
    result.outcome === FETCH_OUTCOMES.WARNED_HASH_MISMATCH
  ) {
    prompts.log.warn(`PlantUML jar: ${result.reason} — install continued`);
  }
  return SUCCESS;
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
