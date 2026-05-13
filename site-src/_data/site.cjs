// Eleventy data file — site-wide constants.
//
// The `version` field reads from package.json at build time so the published
// version on npm and the version shown in the rendered docs site stay in sync
// automatically. Bumping `package.json → version` before `npm publish` is
// enough; the next `npm run build:site` picks up the new value.
//
// Replaces the prior `site.json` (which carried a hardcoded "v0" literal that
// drifted from package.json).

const pkg = require('../../package.json');

const [major, minor] = pkg.version.split('.');

module.exports = {
  brand: 'baseline',
  tagline: 'A discipline layer for Claude Code. Hooks, skills, and a workflow that runs from intake to commit.',
  repo: 'https://github.com/friedbotstudio/baseline',
  repoSlug: 'friedbotstudio/baseline',
  year: '2026',
  version: `v${pkg.version}`,
  versionMinor: `v${major}.${minor}`,
  lastUpdated: '2026-04-29',
};
