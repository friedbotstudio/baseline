// Bug-repro: harness preflight Step 3a (in .claude/skills/harness/SKILL.md)
// runs an inline `node -e "import('<PATH>')..."` to migrate pre-§18
// workflow.json files. Today PATH is `./src/cli/workflow-migrator.js`, a
// dev-tree path that doesn't exist in consumer installs. After /implement
// vendors workflow-migrator.js into .claude/skills/harness/ and rewrites the
// SKILL.md invocation, this test extracts the path from the live SKILL.md
// (both the dev-tree copy and the shipped obj/template/ copy) and asserts it
// resolves inside the shipped tree.
//
// Tests are RED until /implement updates SKILL.md.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

const HARNESS_MD_DEV = join(REPO_ROOT, '.claude/skills/harness/SKILL.md');
const HARNESS_MD_SHIPPED = join(REPO_ROOT, 'obj/template/.claude/skills/harness/SKILL.md');

const MIGRATOR_INVOCATION_RE = /import\(['"`]([^'"`]*workflow-migrator\.js)['"`]\)/;

function extractMigratorPath(skillMdText) {
  const m = skillMdText.match(MIGRATOR_INVOCATION_RE);
  if (!m) {
    throw new Error('no inline `import(...workflow-migrator.js...)` found in SKILL.md');
  }
  return m[1];
}

function isDevTreePath(p) {
  const normalized = p.replace(/^\.\//, '');
  return normalized.startsWith('src/') || normalized.startsWith('tests/')
    || normalized.startsWith('scripts/') || normalized.startsWith('obj/');
}

function resolveAgainstRoot(p, root) {
  if (isAbsolute(p)) return p;
  return resolve(root, p.replace(/^\.\//, ''));
}

describe('harness/SKILL.md — migrator invocation resolves in consumer-like tree', () => {
  it('test_when_harness_skillmd_migrator_path_resolved_in_consumer_layout_then_no_module_not_found', async () => {
    const skillMd = await readFile(HARNESS_MD_DEV, 'utf8');
    const migratorPath = extractMigratorPath(skillMd);

    assert.equal(
      isDevTreePath(migratorPath),
      false,
      `harness/SKILL.md migrator path must not point into dev-tree (src/, tests/, scripts/, obj/).\n` +
        `Found: ${migratorPath}\n` +
        `A consumer install does not receive these directories; the inline node -e would ERR_MODULE_NOT_FOUND.`,
    );

    if (existsSync(HARNESS_MD_SHIPPED)) {
      const resolved = resolveAgainstRoot(migratorPath, dirname(dirname(HARNESS_MD_SHIPPED.replace('/SKILL.md', ''))).replace(/\/$/, '') + '/');
      const projectRootResolved = resolveAgainstRoot(migratorPath, join(REPO_ROOT, 'obj/template'));
      assert.ok(
        existsSync(resolved) || existsSync(projectRootResolved),
        `migrator path ${migratorPath} must resolve to an existing file inside obj/template/.\n` +
          `Tried: ${resolved}\n  and: ${projectRootResolved}`,
      );
    }
  });
});
