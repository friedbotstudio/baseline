// Helper-script executability — the shipped baseline helpers must exist and be
// marked executable so their skills can invoke them directly.
const HELPERS = [
  '.claude/skills/swarm-plan/validate.mjs',
  '.claude/skills/swarm-dispatch/swarm_merge.mjs',
  '.claude/skills/spec-render/render.mjs',
  '.claude/skills/spec-lint/lint.mjs',
  '.claude/skills/archive/archive.sh',
  '.claude/skills/audit-baseline/audit.mjs',
];

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  for (const rel of HELPERS) {
    const label = `helper ${rel.split('/.claude/skills/')[1]}`;
    if (!ctx.exists(rel)) add(label, 'FAIL', 'missing');
    else if (ctx.accessX(rel)) add(label, 'PASS', '');
    else add(label, 'FAIL', 'not executable');
  }
  return rows;
}
