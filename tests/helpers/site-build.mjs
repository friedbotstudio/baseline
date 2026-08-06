// Foundation layer for every test that reads the RENDERED site.
//
// Six suites in this batch (spine, reachability, shipped-claims, robots, llms,
// structured-data) each need a built site. Copying site-sitemap.test.mjs's
// `before()` build block into all six would run eleventy six times per suite
// run; this helper builds at most once per process and every suite shares it.
//
// THE BUILD TARGET IS ISOLATED, NOT `obj/site`. `audit-baseline` reads five
// enumerating pages out of the live `obj/site`
// (.claude/skills/audit-baseline/checks/docsite-drift.mjs), so a test that
// rebuilds that tree races every sibling test running the audit — the
// writer-vs-parallel-reader flake in the landmine
// `live-objtemplate-rebuild-races-parallel-test-readers`, one tree over. Under
// default-parallel `node --test tests/*.test.mjs` this helper alone was invoked
// from nine separate test processes. Eleventy's `--output` overrides
// `dir.output` from eleventy.config.cjs, so only the write target moves: the
// input tree (`site-src/`) is read-only during a run and needs no clone.
//
// Set SITE_SKIP_BUILD=1 to skip the build and read the live obj/site instead —
// the escape hatch for iterating against a tree you just built by hand.

import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIVE_SITE_DIR = path.join(REPO_ROOT, 'obj', 'site');

const ELEVENTY_BIN = path.join(REPO_ROOT, 'node_modules/.bin/eleventy');
const BUILD_TIMEOUT_MS = 180_000;

// Live binding: importers see the isolated path once ensureSiteBuilt() has run.
export let SITE_DIR = LIVE_SITE_DIR;

let built = false;

// An override of `undefined` REMOVES the variable rather than setting it to the
// string "undefined" — the "build with this var unset" case (GA4's dev-state
// test) needs a real absence, and inheriting process.env unedited would let a
// CI runner's own GITHUB_RUN_ID smuggle itself in.
function buildEnv(envOverride) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(envOverride)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

/**
 * Render the site into a fresh tmp directory and return it. `envOverride` sets
 * build-time env the templates read (e.g. GITHUB_RUN_ID for the GA4 tag) without
 * touching anything shared.
 */
export function buildSiteIsolated(label, envOverride = {}) {
  const outDir = mkdtempSync(path.join(tmpdir(), `site-${label}-`));
  const result = spawnSync(process.execPath, [ELEVENTY_BIN, `--output=${outDir}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: BUILD_TIMEOUT_MS,
    env: buildEnv(envOverride),
  });
  if (result.status !== 0) {
    throw new Error(
      `isolated site build failed (status ${result.status})\n` +
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return { outDir, stdout: result.stdout, stderr: result.stderr };
}

/** Build the site once per process into this process's own output dir. Idempotent. */
export function ensureSiteBuilt() {
  if (built) return;
  if (process.env.SITE_SKIP_BUILD === '1') {
    built = true;
    return;
  }
  ({ outDir: SITE_DIR } = buildSiteIsolated('shared'));
  built = true;
}

/** Absolute path to a file inside the rendered site. */
export function renderedPath(rel) {
  return path.join(SITE_DIR, rel);
}

/** Read a rendered file, or '' when absent (so assertions report the miss, not a throw). */
export function readRendered(rel) {
  const p = renderedPath(rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/** Every .html file under `dir`, as absolute paths. */
export function htmlFilesIn(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...htmlFilesIn(abs));
    else if (entry.endsWith('.html')) out.push(abs);
  }
  return out;
}

/** Every rendered .html file, as site-root-relative paths ('index.html', 'hooks/index.html', ...). */
export function renderedPages() {
  return htmlFilesIn(SITE_DIR)
    .map((abs) => path.relative(SITE_DIR, abs))
    .sort();
}

/** Deployed origin, derived from the CNAME so tests never hardcode a second copy. */
export function siteOrigin() {
  const cname = path.join(REPO_ROOT, 'site-src', 'CNAME');
  return existsSync(cname) ? `https://${readFileSync(cname, 'utf8').trim()}` : '';
}

/** Map a rendered file path to the URL path it serves at ('index.html' -> '/'). */
export function urlPathFor(relFile) {
  const noIndex = relFile.replace(/(^|\/)index\.html$/, '$1');
  return `/${noIndex}`.replace(/\/{2,}/g, '/');
}

/** All href targets in a rendered page, normalised to site-root-absolute URL paths. */
export function hrefsIn(html, fromRel) {
  const base = path.dirname(urlPathFor(fromRel));
  const raw = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const out = new Set();
  for (const href of raw) {
    if (/^(https?:|mailto:|#|data:)/.test(href)) continue;
    const abs = href.startsWith('/') ? href : path.posix.join(base, href);
    out.add(abs.split('#')[0].replace(/\/{2,}/g, '/'));
  }
  return [...out];
}
