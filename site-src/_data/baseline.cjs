// Eleventy data file — governance counts for the rendered site.
//
// Computed at build time from the on-disk artifacts via the shared deriver
// (.claude/skills/audit-baseline/derive-counts.mjs), the same module audit-baseline
// cross-checks against. Replaces the prior static `baseline.json`, which carried
// hand-typed literals that drifted from reality (it claimed `commands: 5` while
// disk had 6). Adding/removing a hook, skill, command, or track now updates the
// site automatically; numbers cannot go stale.
//
// Eleventy awaits a function export, so the async deriver import resolves before
// templates render. Every `{{ baseline.* }}` field the .njk files read is
// preserved below.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const deriverUrl = pathToFileURL(
    path.resolve(repoRoot, '.claude/skills/audit-baseline/derive-counts.mjs'),
  ).href;
  const { deriveCounts, numToWord, SKILL_CATEGORIES } = await import(deriverUrl);
  const c = deriveCounts(repoRoot);

  return {
    hooks: { total: c.hooks },
    skills: {
      total: c.skills,
      categoriesWord: numToWord(Object.keys(SKILL_CATEGORIES).length),
      sharedGlobalsWord: numToWord(SKILL_CATEGORIES.sharedGlobals),
      byCategory: SKILL_CATEGORIES,
    },
    subagents: { total: c.subagents, totalWord: numToWord(c.subagents) },
    commands: c.commands,
    phases: 11,
    gates: 4,
    phaseGates: 3,
    runtimeGates: 1,
    tracks: { canonical: c.tracks.canonical, subTracks: c.tracks.subTracks },
    mcpServersWord: numToWord(c.mcpServers),
    size: { unpacked: '1.5 MB', plantumlJar: '19 MB' },
  };
};
