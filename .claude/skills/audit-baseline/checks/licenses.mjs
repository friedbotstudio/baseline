// Vendored license / notice — the recommender skill and the vendored PlantUML
// jar ship their LICENSE/NOTICE, and the NOTICE carries the pinned attribution.
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { root } = ctx;

  const recommender = join(root, '.claude', 'skills', 'claude-automation-recommender');
  if (existsSync(recommender) && statSync(recommender).isDirectory()) {
    for (const fname of ['LICENSE', 'NOTICE', 'SKILL.md']) {
      const p = join(recommender, fname);
      add(`recommender ${fname}`, existsSync(p) ? 'PASS' : 'FAIL', existsSync(p) ? '' : 'missing');
    }
  } else {
    add('recommender skill directory', 'FAIL', 'missing');
  }

  const plantumlDir = join(root, '.claude', 'bin');
  if (existsSync(plantumlDir) && statSync(plantumlDir).isDirectory()) {
    for (const fname of ['LICENSE', 'NOTICE']) {
      const p = join(plantumlDir, fname);
      add(`plantuml-vendored ${fname}`, existsSync(p) ? 'PASS' : 'FAIL', existsSync(p) ? '' : 'missing — required for Apache 2.0 redistribution of plantuml-asl jar');
    }
    const noticeP = join(plantumlDir, 'NOTICE');
    if (existsSync(noticeP)) {
      const noticeText = readFileSync(noticeP, 'utf8');
      const required = ['plantuml-asl-1.2026.2', 'c348f6a26d999f81fd05b5d49834bb70df9cf35fab0939c4edecb0909e64022b'];
      const missing = required.filter(s => !noticeText.includes(s));
      if (missing.length) add('plantuml-vendored NOTICE content', 'FAIL', `missing required attribution strings: ${JSON.stringify(missing)}`);
      else add('plantuml-vendored NOTICE content', 'PASS', 'upstream version + pinned sha256 present');
    }
  } else {
    add('.claude/bin directory', 'FAIL', 'missing — required for vendored PlantUML LICENSE/NOTICE');
  }
  return rows;
}
