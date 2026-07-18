// Constitutional integrity — the Article XII / §17 citations, the CLAUDE.md
// character cap (Article I.6 / seed §14), and the mirror derived-header exemption.
const CLAUDE_CHAR_CAP = 40000;

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { readText } = ctx;

  const claudeText = readText('CLAUDE.md');
  const seedT = readText('docs/init/seed.md');
  if (!claudeText.includes('## Article XII') || !claudeText.includes('manifest')) {
    add('CLAUDE.md citation', 'FAIL', 'CLAUDE.md missing Article XII citation');
  } else {
    add('CLAUDE.md citation', 'PASS', 'Article XII present');
  }
  if (!seedT.includes('## §17') || !seedT.includes('manifest')) {
    add('seed.md citation', 'FAIL', 'seed.md missing §17 citation');
  } else {
    add('seed.md citation', 'PASS', '§17 present');
  }

  const targets = [['CLAUDE.md', readText('CLAUDE.md')]];
  const srcTemplate = readText('src/CLAUDE.template.md');
  if (srcTemplate) targets.push(['src/CLAUDE.template.md', srcTemplate]);
  for (const [rel, text] of targets) {
    if (!text) { add(`size cap: ${rel}`, 'FAIL', 'missing or empty'); continue; }
    const chars = text.length;
    if (chars > CLAUDE_CHAR_CAP) {
      add(`size cap: ${rel}`, 'FAIL',
        `${chars} chars > ${CLAUDE_CHAR_CAP} — move history/narration/appendices to .claude/CONSTITUTION.md`);
    } else {
      add(`size cap: ${rel}`, 'PASS', `${chars}/${CLAUDE_CHAR_CAP} chars`);
    }
  }

  for (const rel of ctx.EXEMPT_RELPATHS) {
    const text = readText(rel);
    if (!text) continue;
    if (ctx.hasDerivedHeader(text)) {
      add(`derived-header exemption: ${rel}`, 'FAIL',
        'a constitution mirror must not carry a derived-header banner — byte-equality with its live source is the guard');
    } else {
      add(`derived-header exemption: ${rel}`, 'PASS', 'no derived header (byte-equality guarded)');
    }
  }
  return rows;
}
