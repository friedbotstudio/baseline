// Quickfix invariants (5/6/7) — no stale doc-site refs in scoped baseline files,
// the hooks count regex accepts bare phrasing, and the swarm-worker description
// uses imperative voice.
import { headPatterns } from './cross-doc-patterns.mjs';

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const needle = 'docs/' + 'site';

  const scan = (rel, lineRange, cached) => {
    const text = cached !== undefined ? cached : ctx.readText(rel);
    if (!text) return [];
    const lines = text.split('\n');
    const hits = [];
    if (lineRange) {
      const [lo, hi] = lineRange;
      for (let i = lo - 1; i < Math.min(hi, lines.length); i++) if (lines[i].includes(needle)) hits.push([rel, i + 1]);
    } else {
      for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) hits.push([rel, i + 1]);
    }
    return hits;
  };
  const targets = [
    ['.claude/skills/audit-baseline/audit.mjs', null, null],
    ['.claude/skills/audit-baseline/SKILL.md', null, null],
    ['.claude/commands/init-project.md', null, null],
    ['docs/init/seed.md', [100, 136], ctx.seedText],
  ];
  const hits = [];
  for (const [p, r, cached] of targets) hits.push(...scan(p, r, cached));
  if (hits.length) {
    const detail = hits.slice(0, 3).map(([p, ln]) => `${p}:${ln}`).join('; ');
    const more = hits.length > 3 ? `; +${hits.length - 3} more` : '';
    add('quickfix-5: no stale doc-site refs in scoped baseline files', 'FAIL', detail + more);
  } else {
    add('quickfix-5: no stale doc-site refs in scoped baseline files', 'PASS', '4 paths clean');
  }

  const qf6Pat = headPatterns(ctx).find(([, , kind]) => kind === 'hooks')?.[0];
  if (!qf6Pat) {
    add('quickfix-6: hooks count regex accepts bare phrasing', 'FAIL', 'could not locate hooks pattern in HEAD_PATTERNS');
  } else {
    const re = new RegExp(qf6Pat.source, qf6Pat.flags);
    const m = re.exec('the harness has 17 hooks total');
    if (m && ctx.toInt(m[1]) === 17) add('quickfix-6: hooks count regex accepts bare phrasing', 'PASS', `matched "${m[0]}" -> 17`);
    else add('quickfix-6: hooks count regex accepts bare phrasing', 'FAIL', 'bare-form regex did not match "17 hooks total"');
  }

  const qf7Text = ctx.readText('.claude/agents/swarm-worker.md');
  const qf7m = qf7Text.match(/^description:\s*(\S+)/m);
  if (!qf7Text) {
    add('quickfix-7: swarm-worker description uses imperative voice', 'FAIL', '.claude/agents/swarm-worker.md not present');
  } else if (!qf7m) {
    add('quickfix-7: swarm-worker description uses imperative voice', 'FAIL', 'no `description:` line found in swarm-worker.md frontmatter');
  } else {
    const first = qf7m[1].replace(/[,.;:]+$/, '');
    if (/^(Execute|Run|Receive|Perform)\b/.test(first)) add('quickfix-7: swarm-worker description uses imperative voice', 'PASS', `imperative voice: ${first}`);
    else add('quickfix-7: swarm-worker description uses imperative voice', 'FAIL', `description starts with "${first}" — expected imperative verb (Execute|Run|Receive|Perform)`);
  }
  return rows;
}
