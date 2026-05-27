// End-to-end regression smoke — walk every runtime file under
// obj/template/.claude/skills/{triage,harness}/ and assert that NO content
// references dev-only paths (src/, tests/, scripts/, obj/) as runtime
// invocations. This is the "the cybren-website bug must not recur" test.
//
// Scope:
//   - .mjs / .js / .sh / .py — full file content scanned for runtime
//     invocation patterns (import/require/node -e/node <file>) hitting
//     dev-only path prefixes.
//   - .md — every backticked code reference (inline single-backtick AND
//     ```fenced``` blocks) inspected for the same patterns.
//
// Out of scope: comments and prose mentions of `src/cli/...` for maintainer
// orientation. The patterns below match invocation syntax, not bare path
// strings; a comment line like `// canonical source: src/cli/foo.js` does
// NOT trip the test.
//
// Tests are RED until /implement (a) vendors the modules into the shipped
// tree, (b) updates seed-tasklist.mjs imports + harness/SKILL.md inline node
// -e, and (c) re-runs the build to refresh obj/template/.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const SHIPPED_TREE = resolve(REPO_ROOT, 'obj/template/.claude/skills');
const SCANNED_SKILLS = ['triage', 'harness'];

const RUNTIME_INVOCATION_PATTERNS = [
  /(?:import|require)\s*\(\s*['"`](?:\.\/)?((?:src|tests|scripts|obj)\/[\w./-]+)['"`]\s*\)/g,
  /(?:import|require)\s*\(\s*['"`](\.\.(?:\/\.\.)*\/(?:src|tests|scripts|obj)\/[\w./-]+)['"`]\s*\)/g,
  /^\s*import\s+[^;]*?from\s+['"`]([^'"`]*\/(?:src|tests|scripts|obj)\/[\w./-]+)['"`]/gm,
  /\b(?:node|python3?|bash|sh)\s+(?:\.\/)?((?:src|tests|scripts|obj)\/[\w./-]+\.\w+)\b/g,
];

const CODE_EXTENSIONS = new Set(['.mjs', '.js', '.sh', '.py']);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function scanText(text) {
  const hits = [];
  for (const re of RUNTIME_INVOCATION_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ match: m[0].trim(), captured: m[1] });
    }
  }
  return hits;
}

function extractCodeFromMarkdown(text) {
  const tripleFenceRe = /```[^\n]*\n([\s\S]*?)\n```/g;
  const inlineBacktickRe = /(?<!`)`([^`\n]+)`(?!`)/g;
  const out = [];
  let m;
  while ((m = tripleFenceRe.exec(text)) !== null) out.push(m[1]);
  while ((m = inlineBacktickRe.exec(text)) !== null) out.push(m[1]);
  return out.join('\n');
}

async function scanFile(absPath) {
  const text = await readFile(absPath, 'utf8');
  const ext = extname(absPath);
  if (ext === '.md') {
    return scanText(extractCodeFromMarkdown(text));
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return scanText(text);
  }
  return [];
}

describe('obj/template/.claude/skills/{triage,harness}/ — no dev-tree runtime refs', () => {
  for (const slug of SCANNED_SKILLS) {
    it(`test_when_shipped_${slug}_skill_walked_then_zero_runtime_dev_tree_refs`, async () => {
      const root = join(SHIPPED_TREE, slug);
      if (!existsSync(root)) {
        assert.fail(
          `${root} does not exist. Run \`bash scripts/build-template.sh\` after /implement lands.`,
        );
      }
      const offenders = [];
      for await (const file of walk(root)) {
        const hits = await scanFile(file);
        if (hits.length > 0) {
          offenders.push({ file: file.replace(REPO_ROOT + '/', ''), hits });
        }
      }
      assert.equal(
        offenders.length,
        0,
        `obj/template/.claude/skills/${slug}/ must not contain runtime invocations of dev-tree paths.\n` +
          `Offenders:\n${JSON.stringify(offenders, null, 2)}`,
      );
    });
  }
});
