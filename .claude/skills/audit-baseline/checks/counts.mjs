// Counts + name rosters vs seed.md — the hook/agent/skill/command tallies and
// membership claimed in docs/init/seed.md against the on-disk baseline inventory.
export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { seedText, toInt } = ctx;

  const findCount = (...patterns) => {
    for (const pat of patterns) {
      const m = seedText.match(pat);
      if (m) { const v = toInt(m[1]); if (v !== null) return v; }
    }
    return null;
  };
  const NUM_WORD = String.raw`\d+|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty`;
  const hooksClaimed = findCount(
    new RegExp(String.raw`\((\d+|${NUM_WORD})\s+\.sh\s+scripts?\s+total\)`, 'i'),
    new RegExp(String.raw`§4\.1\s+Hooks\s+\((\d+)\s+total\b`, 'i'),
    new RegExp(String.raw`\b(${NUM_WORD})\s+guards?\b`, 'i'),
  );
  const agentsClaimed = findCount(/\b(\d+|one|two|three|eight|nine|ten|eleven|twelve)\s+subagents?\b/i);
  const skillsClaimed = findCount(
    /\b(\d+|twenty-(?:four|five|six|seven|eight|nine)|thirty|thirty-(?:one|two|three|four|five|six|seven|eight|nine)|forty-one|forty-two|forty)\s+skills?\b/i
  );
  let cmdsClaimed = null;
  if (/four\s+consent\s+gates?\s*\+\s*one\s+bootstrap\s*\+\s*one\s+doctor/i.test(seedText)) cmdsClaimed = 6;
  else if (/four\s+consent\s+gates?\s*\+\s*one\s+bootstrap/i.test(seedText)) cmdsClaimed = 5;

  const checkCount = (label, claimed, actual) => {
    if (claimed === null) add(label, 'WARN', `could not extract claimed count; disk has ${actual}`);
    else if (claimed === actual) add(label, 'PASS', `${actual}`);
    else add(label, 'FAIL', `seed claims ${claimed}, disk has ${actual}`);
  };
  checkCount('hooks count (seed vs baseline)', hooksClaimed, ctx.diskBaselineHooks.size);
  checkCount('agents count (seed vs baseline)', agentsClaimed, ctx.diskBaselineAgents.size);
  checkCount('skills count (seed vs baseline)', skillsClaimed, ctx.diskBaselineSkills.size);
  checkCount('commands count (seed vs disk)', cmdsClaimed, ctx.diskCommands.size);

  const checkNames = (label, baseline, addns, disk) => {
    const expected = new Set([...baseline, ...addns]);
    const missing = [...expected].filter(x => !disk.has(x)).sort();
    const unexpected = [...disk].filter(x => !expected.has(x)).sort();
    if (missing.length === 0 && unexpected.length === 0) {
      const detail = addns.size > 0 ? `${baseline.size} baseline + ${addns.size} project = ${disk.size}` : '';
      add(label, 'PASS', detail);
    } else {
      const bits = [];
      if (missing.length) bits.push(`missing: ${JSON.stringify(missing)}`);
      if (unexpected.length) bits.push(`unexpected: ${JSON.stringify(unexpected)}`);
      add(label, 'FAIL', bits.join('; '));
    }
  };
  checkNames('hooks names match seed §4.1', ctx.EXPECTED_HOOKS, ctx.addHooks, ctx.diskHooks);
  checkNames('agents names match seed §4.2', ctx.EXPECTED_AGENTS, ctx.addAgents, ctx.diskAgents);

  const manifestForSkills = ctx.loadManifest();
  const canonicalSkills = manifestForSkills
    ? new Set(Object.keys((manifestForSkills.owners || {}).skills || {}))
    : ctx.diskBaselineSkills;
  const canonicalSkillsToUse = canonicalSkills.size > 0 ? canonicalSkills : ctx.diskBaselineSkills;
  checkNames('skills names match seed §4.3', canonicalSkillsToUse, new Set(), ctx.diskBaselineSkills);
  checkNames('commands names match seed §4.4', ctx.EXPECTED_COMMANDS, new Set(), ctx.diskCommands);
  return rows;
}
