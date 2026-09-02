#!/usr/bin/env node
// Orchestration — the front door. Renders the engine's result for a human or
// for a machine; decides nothing.

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runConformance, ConformanceUnmeasured } from './engine.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURE_DIR = join(REPO_ROOT, '.claude', 'skills', 'conformance', 'fixtures');

function render(result) {
  const { rowCount, readerCount, assertionCount } = result.measured;
  const lines = [`${rowCount} rows · ${readerCount} readers · ${assertionCount} assertions`];
  for (const id of result.unmeasured) lines.push(`UNMEASURED  ${id} returned nothing on every row`);
  for (const f of result.failures) {
    lines.push(`FAIL        ${f.readerId} on ${f.rowId}`);
    lines.push(`              expected ${JSON.stringify(f.expected)}`);
    lines.push(`              actual   ${JSON.stringify(f.actual)}`);
  }
  if (result.failures.length === 0 && result.unmeasured.length === 0) lines.push('CLEAN');
  return lines.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  let result;
  try {
    result = runConformance({ fixtureDir: FIXTURE_DIR });
  } catch (err) {
    const label = err instanceof ConformanceUnmeasured ? 'UNMEASURED' : 'ERROR';
    process.stderr.write(`${label}  ${err.message}\n`);
    return 1;
  }
  process.stdout.write(`${json ? JSON.stringify(result, null, 2) : render(result)}\n`);
  return result.failures.length + result.unmeasured.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}

export { main, FIXTURE_DIR };
