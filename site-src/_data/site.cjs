// Eleventy data file — site-wide constants.
//
// The `version` field reads from package.json at build time so the published
// version on npm and the version shown in the rendered docs site stay in sync
// automatically. Bumping `package.json → version` before `npm publish` is
// enough; the next `npm run build:site` picks up the new value.
//
// Replaces the prior `site.json` (which carried a hardcoded "v0" literal that
// drifted from package.json).

const fs = require('node:fs');
const path = require('node:path');

const pkg = require('../../package.json');

const [major, minor] = pkg.version.split('.');

// Canonical deployed origin, derived from the GitHub Pages CNAME so the sitemap
// (and any other absolute-URL need) stays in lockstep with the deploy domain.
// Update site-src/CNAME to change domains; this is not a second hardcoded copy.
const cname = fs.readFileSync(path.join(__dirname, '..', 'CNAME'), 'utf8').trim();

// Last-updated stamp, derived from the last commit that touched the site source
// rather than typed by hand. The hand-typed literal this replaces sat at
// 2026-04-29 for roughly three months while the site changed underneath it, and
// it renders in every docs-page footer, so it was the most-shown stale value on
// the whole site.
//
// Falls back to the build date when git is unavailable (a tarball build, a
// shallow checkout with no history). A slightly-too-recent date degrades better
// than a hardcoded one that is wrong by a quarter.
function lastUpdatedFromGit() {
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', 'site-src'],
      { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // fall through
  }
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  brand: 'baseline',
  url: `https://${cname}`,
  byline: 'by friedbotstudio',
  license: 'Apache 2.0',
  tagline: 'A discipline layer for Claude Code. Hooks, skills, and a workflow that runs from intake to commit.',
  repo: 'https://github.com/friedbotstudio/baseline',
  repoSlug: 'friedbotstudio/baseline',
  year: '2026',
  version: `v${pkg.version}`,
  versionMinor: `v${major}.${minor}`,
  pkgVersion: pkg.version,
  lastUpdated: lastUpdatedFromGit(),
};
