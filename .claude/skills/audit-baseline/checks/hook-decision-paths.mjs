// Hook decision paths — every named decision path a hook implements must appear
// in that hook's bullet in the annex (`.claude/CONSTITUTION.md`).
//
// WHY THIS EXISTS. `harness_continuation.mjs` implements a disjunctive gate:
// Path A (mid-loop continuation) and Path B (consent-resume). `docs/init/seed.md`
// documented both from the start, but three derived governance docs described
// only a "three-rung gate" that was "silent otherwise". Nothing compared a hook's
// implemented paths against its documented ones, so the drift survived two
// commits and led an operator to report correct behavior as a defect. Full
// analysis: docs/rca/2026-08-06-harness-continuation-false-misfire.md.
//
// WHY THE ANNEX AND NOT seed.md OR CLAUDE.md. seed.md was correct throughout, so
// checking it would have caught nothing. CLAUDE.md is capped at 40,000 chars and
// its Article VIII states that fuller per-hook behavior lives in the annex — so
// the annex is the document that owes this detail.
//
// SCOPE IS NARROW ON PURPOSE. Only hooks that declare a `Path <X>` label are
// checked; the rest are skipped rather than failed, because 25 of 26 hooks have
// no such convention today. The coverage row reports how many were actually
// checked, so a check that silently narrows to zero is visible rather than
// vacuously green.

const PATH_LABEL_RE = /\bPath ([A-Z])\b/g;

function declaredPaths(source) {
  return new Set([...source.matchAll(PATH_LABEL_RE)].map((m) => `Path ${m[1]}`));
}

// The bullet runs from its own `- **\`<hook>\`**` marker to the next top-level
// bullet, so a multi-line entry is read whole rather than truncated at line one.
function annexBullet(annex, hook) {
  const start = annex.indexOf(`- **\`${hook}\`**`);
  if (start === -1) return '';
  const next = annex.indexOf('\n- **', start + 1);
  return next === -1 ? annex.slice(start) : annex.slice(start, next);
}

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);

  const annex = ctx.readText('.claude/CONSTITUTION.md');
  const hooks = ctx.listDir('.claude/hooks').filter((n) => n.endsWith('.mjs') || n.endsWith('.sh'));

  let covered = 0;
  for (const file of hooks.sort()) {
    const hook = file.replace(/\.(mjs|sh)$/, '');
    const paths = declaredPaths(ctx.readText(`.claude/hooks/${file}`));
    if (paths.size === 0) continue;
    covered++;

    const bullet = annexBullet(annex, hook);
    if (!bullet) {
      add(`hook decision paths: ${hook}`, 'FAIL', `no annex bullet; declares ${[...paths].join(', ')}`);
      continue;
    }
    const missing = [...paths].filter((label) => !bullet.includes(label));
    add(
      `hook decision paths: ${hook}`,
      missing.length === 0 ? 'PASS' : 'FAIL',
      missing.length === 0
        ? `${paths.size} path(s) documented`
        : `undocumented in the annex: ${missing.join(', ')}`,
    );
  }

  add('hook decision paths: coverage', 'PASS', `${covered} of ${hooks.length} hooks declare path labels`);
  return rows;
}
