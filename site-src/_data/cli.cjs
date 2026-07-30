// Eleventy data file — the CLI surface for the reference page.
//
// Reads src/cli/surface.js, the same module tests/surface.test.mjs pins to the
// parseArgs OPTIONS object in bin/cli.js. A flag added to the CLI without a
// matching entry there fails that test, so the rendered page cannot quietly
// document a stale flag set the way a hand-typed table did.
//
// The async-export + pathToFileURL + dynamic import() indirection is mandatory,
// not stylistic: _data/*.cjs is CommonJS and src/cli/*.js is ESM, so a plain
// require() throws ERR_REQUIRE_ESM. Eleventy awaits a function export, so the
// import resolves before templates render. Same shape as _data/baseline.cjs.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const surfaceUrl = pathToFileURL(path.resolve(repoRoot, 'src/cli/surface.js')).href;
  const { COMMANDS, FLAGS, FLAG_GROUPS, EXIT_CODES } = await import(surfaceUrl);

  // Pre-group the flags here rather than in Nunjucks: a `{% for %}` filtering a
  // flat list per group would silently render nothing for a group whose id was
  // misspelled, and the empty section would look deliberate. Building the
  // groups in JS lets the template iterate what exists.
  const groups = FLAG_GROUPS
    .map((g) => ({
      id: g.id,
      label: g.label,
      flags: FLAGS.filter((f) => f.group === g.id),
    }))
    .filter((g) => g.flags.length > 0);

  const grouped = groups.reduce((n, g) => n + g.flags.length, 0);
  if (grouped !== FLAGS.length) {
    // A flag whose `group` matches no FLAG_GROUPS entry would vanish from the
    // page while every test still passed. Fail the build instead.
    const orphans = FLAGS.filter((f) => !FLAG_GROUPS.some((g) => g.id === f.group))
      .map((f) => f.cli)
      .join(', ');
    throw new Error(`_data/cli.cjs: flags in no FLAG_GROUPS group: ${orphans}`);
  }

  return {
    commands: COMMANDS,
    flags: FLAGS,
    flagGroups: groups,
    exitCodes: EXIT_CODES,
    flagCount: FLAGS.length,
  };
};
