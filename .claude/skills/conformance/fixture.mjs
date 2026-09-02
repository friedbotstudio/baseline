// Foundation — reads and validates the adversarial fixture.
//
// JSON, parsed by `JSON.parse`: the fixture must not be read by anything under
// test. Storing expected values in a document's own frontmatter would have the
// frontmatter readers under test parsing the fixture that tests them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_FILES = ['spec.json', 'epic-state.json', 'memory-entry.json'];
const REQUIRED_KEYS = ['id', 'artifact', 'doc', 'expect', 'why'];

export class ConformanceUnmeasured extends Error {}

function requireRowShape(row, source) {
  for (const key of REQUIRED_KEYS) {
    if (row?.[key] === undefined) {
      throw new ConformanceUnmeasured(`${source}: row is missing \`${key}\``);
    }
  }
}

/** Every fixture row across the three artifact files, validated and de-duplicated. */
export function loadFixture(fixtureDir) {
  const rows = [];
  const seen = new Set();
  for (const file of FIXTURE_FILES) {
    const source = join(fixtureDir, file);
    const parsed = JSON.parse(readFileSync(source, 'utf8'));
    if (!Array.isArray(parsed.rows)) {
      throw new ConformanceUnmeasured(`${source}: expected a \`rows\` array`);
    }
    for (const row of parsed.rows) {
      requireRowShape(row, source);
      if (seen.has(row.id)) throw new ConformanceUnmeasured(`${source}: duplicate row id \`${row.id}\``);
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

export { FIXTURE_FILES };
