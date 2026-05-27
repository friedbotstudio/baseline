// Drift detection — the five workflows.jsonl-driven modules ship under both
// src/cli/ (dev canonical) AND .claude/skills/{triage,harness}/ (consumer-
// facing mirror) per A1: "src/cli/ stays canonical, build copies into shipped
// paths". This test asserts byte-equality across each pair. Any maintainer who
// edits one copy without the other (or skips running scripts/build-template.sh
// after touching src/cli/) trips this test in CI.
//
// Tests are RED until /implement creates the mirror files under
// .claude/skills/{triage,harness}/.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

const MIRROR_PAIRS = [
  {
    canonical: 'src/cli/workflows-validator.js',
    mirror: '.claude/skills/triage/workflows-validator.js',
  },
  {
    canonical: 'src/cli/workflows-validator-invariants.js',
    mirror: '.claude/skills/triage/workflows-validator-invariants.js',
  },
  {
    canonical: 'src/cli/workflows-validator-predicates.js',
    mirror: '.claude/skills/triage/workflows-validator-predicates.js',
  },
  {
    canonical: 'src/cli/track-tasklist-materializer.js',
    mirror: '.claude/skills/triage/track-tasklist-materializer.js',
  },
  {
    canonical: 'src/cli/workflow-migrator.js',
    mirror: '.claude/skills/harness/workflow-migrator.js',
  },
];

async function sha256OfFile(relPath) {
  const buf = await readFile(resolve(REPO_ROOT, relPath));
  return createHash('sha256').update(buf).digest('hex');
}

describe('vendored mirror bytes — src/cli/ canonical sources vs .claude/skills/ shipped mirrors', () => {
  for (const { canonical, mirror } of MIRROR_PAIRS) {
    const safeName = mirror.replace(/[^\w]/g, '_');
    it(`test_when_vendored_mirror_${safeName}_then_bytes_match_canonical_source`, async () => {
      const [canonicalHash, mirrorHash] = await Promise.all([
        sha256OfFile(canonical),
        sha256OfFile(mirror),
      ]);
      assert.equal(
        mirrorHash,
        canonicalHash,
        `vendored mirror ${mirror} must be byte-equal to canonical source ${canonical}\n` +
          `canonical sha256: ${canonicalHash}\n` +
          `mirror sha256:    ${mirrorHash}\n` +
          `Fix: run \`bash scripts/build-template.sh\` to re-sync.`,
      );
    });
  }
});
