import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifestFromDir, saveManifest } from './manifest.js';
import { deepMergeMcpServers } from './mcp.js';
import { refreshBaselineVersion } from './project-json.js';
import { pathExists } from './util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Package root contains src/ and obj/template/ as siblings of src/cli/.
const PACKAGE_ROOT = resolve(__dirname, '../..');
const NPMRC_TEMPLATE_PATH = join(PACKAGE_ROOT, 'src/.npmrc.template');

export const NEVER_TOUCH = Object.freeze([
  '.claude/project.json',
  '.claude/workflows.jsonl',
  '.claude/schemas/workflow-track.v1.json',
  // Runtime-state files: bodies are gitignored and overwritten every
  // conversation turn by memory_stop.sh / memory_pre_compact.sh / /memory-flush.
  // Their on-disk hash will essentially never match the shipped template hash,
  // so any merge-time prompt is a structural false positive. Preserve silently.
  // See docs/specs/upgrade-no-replay-prompts.md §Behavior #1.
  '.claude/memory/_pending.md',
  '.claude/memory/_resume.md',
]);
export const SPECIAL_MERGE = Object.freeze(['.mcp.json']);
// The shipped manifest now lives at `.claude/manifest.json` (inside the
// template's .claude/ subtree), so the recursive cp drops it at the correct
// consumer path without any special-case filtering. The consumer-side audit
// (`.claude/skills/audit-baseline/audit.sh`) reads it from there for
// hash-drift detection. COPY_EXCLUDE stays as a list (currently empty) so
// future never-copy artifacts can be added without API churn at the callers.
export const COPY_EXCLUDE = Object.freeze([]);

async function listFiles(root, base = root, acc = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      await listFiles(full, base, acc);
    } else if (entry.isFile()) {
      acc.push(relative(base, full).split(sep).join('/'));
    }
  }
  return acc;
}

async function readPackageVersion() {
  try {
    const pkgPath = join(PACKAGE_ROOT, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function writeBaselineManifest(target, baseline_version) {
  const files = await listFiles(target);
  const filtered = files.filter((p) =>
    p !== '.claude/.baseline-manifest.json' && !p.startsWith('.claude/.baseline-prior/')
  );
  const m = await buildManifestFromDir(target, filtered, { baseline_version });
  await mkdir(join(target, '.claude'), { recursive: true });
  await saveManifest(join(target, '.claude/.baseline-manifest.json'), m);
}

async function writeBaselinePriorMirror(templateDir, target) {
  const priorRoot = join(target, '.claude/.baseline-prior');
  await mkdir(priorRoot, { recursive: true });
  await cp(templateDir, priorRoot, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = relative(templateDir, src).split(sep).join('/');
      if (rel === '') return true;
      if (COPY_EXCLUDE.includes(rel)) return false;
      return true;
    },
  });
  await writeFile(join(priorRoot, '.gitignore'), '*\n');
}

function makeFilter(opts) {
  return (src, _dest) => {
    const rel = relative(opts.templateRoot, src).split(sep).join('/');
    if (rel === '') return true;
    if (COPY_EXCLUDE.includes(rel)) return false;
    if (NEVER_TOUCH.includes(rel) && opts.skipNeverTouch) return false;
    if (SPECIAL_MERGE.includes(rel) && opts.skipSpecialMerge) return false;
    return true;
  };
}

async function applySpecialAndNeverTouch(templateDir, target) {
  for (const rel of NEVER_TOUCH) {
    const dst = join(target, rel);
    if (!(await pathExists(dst))) {
      const src = join(templateDir, rel);
      if (await pathExists(src)) {
        await mkdir(join(target, rel.split('/').slice(0, -1).join('/')), { recursive: true });
        await cp(src, dst);
      }
    }
  }

  for (const rel of SPECIAL_MERGE) {
    const src = join(templateDir, rel);
    const dst = join(target, rel);
    if (await pathExists(src)) {
      await deepMergeMcpServers(src, dst);
    }
  }
}

// npm pack drops `.npmrc` from the published tarball even when listed in
// package.json files (registry hardening). To ship the hardened operator
// defaults (`ignore-scripts=true`, `min-release-age=7`) into target projects,
// install.js overlays target/.npmrc from src/.npmrc.template at install time.
async function materializeNpmrc(target) {
  const dst = join(target, '.npmrc');
  if (await pathExists(dst)) return; // never overwrite an existing operator config
  if (!(await pathExists(NPMRC_TEMPLATE_PATH))) return; // fixture / dev tree without the template — no-op
  const bytes = await readFile(NPMRC_TEMPLATE_PATH, 'utf8');
  await writeFile(dst, bytes);
}

export async function freshInstall(templateDir, target, opts = {}) {
  const filter = makeFilter({ templateRoot: templateDir, skipNeverTouch: false, skipSpecialMerge: true });
  await cp(templateDir, target, { recursive: true, force: false, filter });
  await applySpecialAndNeverTouch(templateDir, target);
  if (opts.withNpmrc === true) await materializeNpmrc(target);
  await writeBaselinePriorMirror(templateDir, target);
  const baseline_version = await readPackageVersion();
  await writeBaselineManifest(target, baseline_version);
  await refreshBaselineVersion(target, baseline_version);
}

export async function forceInstall(templateDir, target, opts = {}) {
  const filter = makeFilter({ templateRoot: templateDir, skipNeverTouch: true, skipSpecialMerge: true });
  await cp(templateDir, target, { recursive: true, force: true, filter });
  await applySpecialAndNeverTouch(templateDir, target);
  if (opts.withNpmrc === true) await materializeNpmrc(target);
  await writeBaselinePriorMirror(templateDir, target);
  const baseline_version = await readPackageVersion();
  await writeBaselineManifest(target, baseline_version);
  await refreshBaselineVersion(target, baseline_version);
}
