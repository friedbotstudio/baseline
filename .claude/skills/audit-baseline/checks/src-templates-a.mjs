// src/ templates, part A — the directory presence gate plus the constitution,
// project, and seed pristine-template checks. Skipped on a consumer install
// (manifest present, src/ absent).
export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { exists, readText } = ctx;

  if (ctx.skipSrc) {
    if (ctx.consumerManifest) add('src templates: directory', 'PASS', 'consumer install (manifest present, src/ absent) — src/ checks skipped');
    else add('src templates: directory', 'FAIL', 'missing src/');
    return rows;
  }
  add('src templates: directory', 'PASS', '');

  if (!exists('src/CLAUDE.template.md')) {
    add('src templates: CLAUDE.template.md', 'FAIL', 'missing');
  } else {
    const head = readText('src/CLAUDE.template.md').slice(0, 1200);
    if (head.includes('is a general-purpose Claude setup')) {
      add('src templates: CLAUDE.template.md', 'FAIL',
        "lede uses dogfood voice ('is a general-purpose Claude setup'); template must read as ship-to-user constitution");
    } else if (/\bArticle\s+I\b/.test(head) || head.toLowerCase().includes('in-session constitution')) {
      add('src templates: CLAUDE.template.md', 'PASS', 'constitution voice');
    } else if (head.includes('uses the Claude Code baseline')) {
      add('src templates: CLAUDE.template.md', 'PASS', 'user-voice lede (pre-constitution)');
    } else {
      add('src templates: CLAUDE.template.md', 'FAIL',
        "lede missing — expected constitution markers ('Article I', 'in-session constitution') or transitional user-voice phrase 'uses the Claude Code baseline'");
    }
  }

  if (!exists('src/project.template.json')) {
    add('src templates: project.template.json', 'FAIL', 'missing');
  } else {
    let pjSeed = null;
    try { pjSeed = JSON.parse(readText('src/project.template.json')); }
    catch (e) { add('src templates: project.template.json', 'FAIL', `invalid JSON: ${e.message}`); }
    if (pjSeed !== null) {
      if (pjSeed.configured !== false) {
        add('src templates: project.template.json', 'FAIL', `must be pristine — \`configured\` should be false (got ${JSON.stringify(pjSeed.configured)})`);
      } else {
        add('src templates: project.template.json', 'PASS', 'configured=false');
      }
    }
  }

  if (!exists('src/seed.template.md')) {
    add('src templates: seed.template.md', 'FAIL', 'missing');
  } else {
    const s16 = readText('src/seed.template.md').match(/##\s+§16\s+—\s+Project-specific configuration[\s\S]{0,400}/);
    if (!s16) add('src templates: seed.template.md', 'FAIL', 'missing §16 reservation');
    else if (s16[0].includes('Generated:')) add('src templates: seed.template.md', 'FAIL', '§16 has been populated (`Generated:` stamp present); template must stay pristine');
    else add('src templates: seed.template.md', 'PASS', '§16 reserved (pristine)');
  }
  return rows;
}
