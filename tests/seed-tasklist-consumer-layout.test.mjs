// Bug-repro tests for the cybren-website consumer crash:
//
//   $ node <consumer-root>/.claude/skills/triage/seed-tasklist.mjs --validate-only
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module
//     '<consumer-root>/src/cli/workflows-validator.js' imported from
//     <consumer-root>/.claude/skills/triage/seed-tasklist.mjs
//
// Today the helper imports from `../../../src/cli/workflows-validator.js`,
// which is a dev-tree path absent in consumer installs. After /implement
// vendors the validator + materializer modules under .claude/skills/triage/
// and rewrites the imports to sibling paths, this test exercises the helper
// in a stripped-down consumer-like tree (only .claude/, no src/).
//
// Tests are RED until /implement lands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const SHIPPED_CLAUDE_DIR = join(REPO_ROOT, 'obj/template/.claude');

async function makeConsumerLayout() {
  if (!existsSync(SHIPPED_CLAUDE_DIR)) {
    throw new Error(
      `${SHIPPED_CLAUDE_DIR} missing. Run \`bash scripts/build-template.sh\` first.`,
    );
  }
  const root = await mkdtemp(join(tmpdir(), 'seed-tasklist-consumer-'));
  await cp(SHIPPED_CLAUDE_DIR, join(root, '.claude'), { recursive: true });
  return root;
}

function spawnSeedTasklist(consumerRoot, args) {
  return spawnSync(
    'node',
    [join(consumerRoot, '.claude/skills/triage/seed-tasklist.mjs'), ...args],
    { encoding: 'utf8', cwd: consumerRoot },
  );
}

describe('seed-tasklist.mjs — consumer-layout invocation (no src/ available)', () => {
  it('test_when_seed_tasklist_invoked_from_consumer_layout_then_validate_only_succeeds', async () => {
    const consumerRoot = await makeConsumerLayout();
    try {
      const result = spawnSeedTasklist(consumerRoot, ['--validate-only']);
      assert.equal(
        result.status,
        0,
        `seed-tasklist.mjs --validate-only must exit 0 in a consumer-like tree without src/.\n` +
          `exit: ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(
        result.stderr,
        /validated \d+ tracks/,
        `stderr must report tracks validated; got: ${result.stderr}`,
      );
    } finally {
      await rm(consumerRoot, { recursive: true, force: true });
    }
  });

  it('test_when_seed_tasklist_invoked_from_consumer_layout_then_materialize_emits_canonical_tasklist', async () => {
    const consumerRoot = await makeConsumerLayout();
    try {
      const result = spawnSeedTasklist(consumerRoot, ['tdd-quickfix', 'sample-slug']);
      assert.equal(
        result.status,
        0,
        `seed-tasklist.mjs <track> <slug> must exit 0 in a consumer-like tree.\n` +
          `exit: ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      const parsed = JSON.parse(result.stdout);
      assert.ok(Array.isArray(parsed), 'stdout must be a JSON array');
      assert.ok(parsed.length >= 10, `tdd-quickfix track must emit >= 10 tasks; got ${parsed.length}`);
      assert.equal(parsed[0].metadata.phase, 'tdd', 'first task is the tdd phase');
      const hasGrantCommit = parsed.some((t) => t.metadata?.phase === 'grant-commit');
      assert.ok(hasGrantCommit, 'tdd-quickfix must include a grant-commit consent task');
    } finally {
      await rm(consumerRoot, { recursive: true, force: true });
    }
  });
});
