import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifestFromDir, saveManifest } from './manifest.js';
import { deepMergeMcpServers } from './mcp.js';
import { pathExists } from './util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Package root contains src/ and obj/template/ as siblings of src/cli/.
const PACKAGE_ROOT = resolve(__dirname, '../..');
const NPMRC_TEMPLATE_PATH = join(PACKAGE_ROOT, 'src/.npmrc.template');

export const NEVER_TOUCH = Object.freeze(['.claude/project.json']);
export const SPECIAL_MERGE = Object.freeze(['.mcp.json']);
// Files present in the shipped template that must NOT be cp'd to target. These
// are reference artifacts the CLI consults from templateDir (or that ship for
// inspection-time provenance), never materialized at consumer project root.
// `manifest.json`: the shipped sha256 table. The CLI's runtime manifest lives
// at `target/.claude/.baseline-manifest.json` (written by writeBaselineManifest);
// `target/manifest.json` would be a confusing duplicate. Keep the file in the
// published tarball so anyone inspecting `node_modules/<pkg>/obj/template/` can
// see what shipped, but exclude it from the fresh/force install copy.
export const COPY_EXCLUDE = Object.freeze(['manifest.json']);

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

async function writeBaselineManifest(target) {
  const files = await listFiles(target);
  const filtered = files.filter((p) => p !== '.claude/.baseline-manifest.json');
  const m = await buildManifestFromDir(target, filtered);
  await mkdir(join(target, '.claude'), { recursive: true });
  await saveManifest(join(target, '.claude/.baseline-manifest.json'), m);
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
  await writeBaselineManifest(target);
}

export async function forceInstall(templateDir, target, opts = {}) {
  const filter = makeFilter({ templateRoot: templateDir, skipNeverTouch: true, skipSpecialMerge: true });
  await cp(templateDir, target, { recursive: true, force: true, filter });
  await applySpecialAndNeverTouch(templateDir, target);
  if (opts.withNpmrc === true) await materializeNpmrc(target);
  await writeBaselineManifest(target);
}
