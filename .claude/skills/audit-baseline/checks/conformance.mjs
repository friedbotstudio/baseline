// Reader conformance — every registered reader of an artifact section still
// returns the reviewed value for every adversarial fixture row.
//
// This caller ships. `tests/conformance.test.mjs` gates the release in CI and
// never reaches a consumer install; this one runs on the developer's write loop
// AND in a consumer's own tree, which is where the defect that produced this
// check was reported from. Both call the same engine over the same fixture and
// hold neither a fixture nor a comparison of their own.

import { join } from 'node:path';

import { runConformance, ConformanceUnmeasured } from '../../conformance/engine.mjs';
import { clipInline } from '../../lib/terminal-text.mjs';

const FIXTURE_DIR = ['.claude', 'skills', 'conformance', 'fixtures'];

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);

  let result;
  try {
    result = runConformance({ fixtureDir: join(ctx.root, ...FIXTURE_DIR) });
  } catch (err) {
    const measuredNothing = err instanceof ConformanceUnmeasured;
    add('reader conformance', 'FAIL', measuredNothing
      ? `check measured nothing — ${err.message}`
      : `engine error — ${clipInline(String(err?.message ?? err), 120)}`);
    return rows;
  }

  const { rowCount, readerCount, assertionCount } = result.measured;
  add('conformance fixture', 'PASS', `${rowCount} adversarial rows, ${readerCount} readers, ${assertionCount} assertions`);

  if (result.unmeasured.length) {
    add('conformance coverage', 'FAIL',
      `reader(s) measured nothing on every row: ${result.unmeasured.join(', ')}`);
  } else {
    add('conformance coverage', 'PASS', 'every registered reader returned a real value');
  }

  if (result.failures.length === 0) {
    add('reader conformance', 'PASS', 'every reader matches its reviewed value');
    return rows;
  }

  for (const f of result.failures) {
    add('reader conformance', 'FAIL',
      `${f.readerId} on ${f.rowId}: expected ${clipInline(JSON.stringify(f.expected), 60)}, got ${clipInline(JSON.stringify(f.actual), 60)}`);
  }
  return rows;
}
