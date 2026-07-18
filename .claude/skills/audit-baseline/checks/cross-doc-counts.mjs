// Cross-doc count claims — headline count claims in CLAUDE.md / README.md /
// seed.md must match the derived baseline inventory; local/scoped counts are
// classified out so only binding headline drift FAILs.
import { headPatterns, parenPatterns, nounFirstPatterns, QUALIFIER_PREFIXES, classifyMatch } from './cross-doc-patterns.mjs';

function scanDoc(text, ctx) {
  const headlineDrift = [];
  let headlineOk = 0, localN = 0;
  const ambiguous = [];

  for (const [pat, expected, kind] of headPatterns(ctx)) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const claimed = ctx.toInt(m[1]);
      if (claimed === null) continue;
      const tier = classifyMatch(text, m.index, m.index + m[0].length);
      if (tier === 'LOCAL') { localN += 1; continue; }
      if (claimed === expected) { if (tier === 'HEADLINE') headlineOk += 1; continue; }
      const snippet = m[0].trim();
      if (tier === 'HEADLINE') headlineDrift.push(`"${snippet}" → expected ${expected} ${kind}`);
      else ambiguous.push(`"${snippet}" (likely local; otherwise ${expected} ${kind})`);
    }
  }
  for (const [pat, expected, kind] of parenPatterns(ctx)) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const claimed = ctx.toInt(m[1]);
      if (claimed === null) continue;
      const preWord = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
      if (QUALIFIER_PREFIXES.some(q => preWord.endsWith(q))) { localN += 1; continue; }
      if (claimed === expected) headlineOk += 1;
      else headlineDrift.push(`"${m[0].trim()}" → expected ${expected} ${kind}`);
    }
  }
  for (const [pat, expected, kind] of nounFirstPatterns(ctx)) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const claimed = parseInt(m[1], 10);
      if (Number.isNaN(claimed)) continue;
      const tier = classifyMatch(text, m.index, m.index + m[0].length);
      if (tier === 'LOCAL') { localN += 1; continue; }
      if (claimed === expected) { headlineOk += 1; continue; }
      headlineDrift.push(`"${m[0].trim()}" → expected ${expected} ${kind}`);
    }
  }

  if (headlineDrift.length) {
    const head = headlineDrift.slice(0, 3).join('; ');
    const tail = headlineDrift.length > 3 ? `; +${headlineDrift.length - 3} more` : '';
    return { status: 'FAIL', detail: head + tail };
  }
  if (headlineOk) {
    const suffix = localN ? ` (${localN} local count${localN !== 1 ? 's' : ''} suppressed)` : '';
    return { status: 'PASS', detail: `${headlineOk} headline claim${headlineOk !== 1 ? 's' : ''} match${suffix}` };
  }
  if (ambiguous.length) return { status: 'WARN', detail: ambiguous.slice(0, 2).join('; ') };
  return { status: 'WARN', detail: 'no relevant claims found' };
}

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  for (const doc of ['CLAUDE.md', 'README.md', 'docs/init/seed.md']) {
    const text = ctx.readText(doc);
    if (!text) { if (doc !== 'README.md') add(`${doc} count claims`, 'WARN', 'file not present'); continue; }
    const { status, detail } = scanDoc(text, ctx);
    add(`${doc} count claims`, status, detail);
  }
  return rows;
}
