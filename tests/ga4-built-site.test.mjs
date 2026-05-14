// GA4 instrumentation — built-site smoke (AC-001 prod, AC-006 dev).
//
// Build the eleventy site under each env state, then walk obj/site/**.html
// and assert per-page presence/absence of the gtag loader.
//
// Pattern mirror: tests/site-relative-paths.test.mjs (build trigger + walk).
// Each test owns one build invocation; we cannot share `obj/site/` between
// the two env states. Set GA4_BUILT_SITE_SKIP_BUILD=1 to skip the rebuild
// when iterating locally (and obj/site/ is already in the desired state).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = path.join(REPO_ROOT, 'obj/site');
const PROD_MEASUREMENT_ID = 'G-MYCZFYXE38';
const PROD_LOADER_RE = new RegExp(
  `googletagmanager\\.com/gtag/js\\?id=${PROD_MEASUREMENT_ID.replace(/[-]/g, '\\-')}`,
  'g'
);
const GTM_DOMAIN_RE = /googletagmanager\.com/;

function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkHtml(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function runBuild(envOverride) {
  return spawnSync('npm', ['run', 'build:site'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 90_000,
    env: { ...process.env, ...envOverride },
  });
}

describe('ga4 built-site smoke (AC-001, AC-006)', () => {
  it('test_when_build_with_github_run_id_set_then_every_html_has_one_gtag_match', () => {
    const result = runBuild({ GITHUB_RUN_ID: 'gha-test-123' });
    assert.equal(
      result.status,
      0,
      `npm run build:site failed (exit ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(existsSync(SITE_DIR), `obj/site/ does not exist after build`);
    const htmlFiles = walkHtml(SITE_DIR);
    assert.ok(htmlFiles.length > 0, `obj/site/ contained no .html files`);

    const offenders = [];
    for (const file of htmlFiles) {
      const text = readFileSync(file, 'utf8');
      const matches = text.match(PROD_LOADER_RE) || [];
      if (matches.length !== 1) {
        offenders.push(`${path.relative(REPO_ROOT, file)}: ${matches.length} matches`);
      }
    }
    assert.equal(
      offenders.length,
      0,
      `every built HTML page must have exactly one googletagmanager loader for ${PROD_MEASUREMENT_ID}; offenders:\n${offenders.join('\n')}`
    );
  });

  it('test_when_build_without_github_run_id_then_no_html_contains_googletagmanager', () => {
    const previous = process.env.GITHUB_RUN_ID;
    const envOverride = { ...process.env };
    delete envOverride.GITHUB_RUN_ID;
    const result = spawnSync('npm', ['run', 'build:site'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 90_000,
      env: envOverride,
    });
    try {
      assert.equal(
        result.status,
        0,
        `npm run build:site failed (exit ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
      assert.ok(existsSync(SITE_DIR), `obj/site/ does not exist after build`);
      const htmlFiles = walkHtml(SITE_DIR);
      assert.ok(htmlFiles.length > 0, `obj/site/ contained no .html files`);

      const offenders = [];
      for (const file of htmlFiles) {
        const text = readFileSync(file, 'utf8');
        if (GTM_DOMAIN_RE.test(text)) {
          offenders.push(path.relative(REPO_ROOT, file));
        }
      }
      assert.equal(
        offenders.length,
        0,
        `no built HTML page may contain googletagmanager.com when GITHUB_RUN_ID is unset; offenders:\n${offenders.join('\n')}`
      );
    } finally {
      if (previous !== undefined) process.env.GITHUB_RUN_ID = previous;
    }
  });
});
