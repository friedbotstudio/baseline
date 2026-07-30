// Foundation layer for every test that reads the RENDERED site under obj/site.
//
// Six suites in this batch (spine, reachability, shipped-claims, robots, llms,
// structured-data) each need a built site. Copying site-sitemap.test.mjs's
// `before()` build block into all six would run eleventy six times per suite
// run; this helper builds at most once per process and every suite shares it.
//
// Set SITE_SKIP_BUILD=1 when obj/site is already fresh to skip the build.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE_DIR = path.join(REPO_ROOT, 'obj', 'site');

let built = false;

/** Build the site once per process. Idempotent; honours SITE_SKIP_BUILD=1. */
export function ensureSiteBuilt() {
  if (built || process.env.SITE_SKIP_BUILD === '1') {
    built = true;
    return;
  }
  const r = spawnSync('npm', ['run', 'build:site'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (r.status !== 0) {
    throw new Error(`build:site failed: ${r.stderr || r.stdout}`);
  }
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

/** Every rendered .html file, as site-root-relative paths ('index.html', 'hooks/index.html', ...). */
export function renderedPages() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (entry.endsWith('.html')) out.push(path.relative(SITE_DIR, abs));
    }
  };
  walk(SITE_DIR);
  return out.sort();
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
