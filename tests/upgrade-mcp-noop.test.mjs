// AC-004 — When deepMergeMcpServers would produce byte-identical output to existing
// target .mcp.json, threeWayMerge classifies the action as NOOP (not SPECIAL_MERGE),
// it is excluded from the "applied" count, and the target file is not rewritten
// (mtime preserved). The inverse case (template adds baseline-named server) still
// produces SPECIAL_MERGE.
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #4.
// Bug 2 reference: src/cli/merge.js:101-106 currently emits SPECIAL_MERGE
// unconditionally whenever .mcp.json is in the template.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

let mergeMod;
try {
  mergeMod = await import('../src/cli/merge.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/merge.js: ${err.message}`);
}

let mcpMod;
try {
  mcpMod = await import('../src/cli/mcp.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/mcp.js: ${err.message}`);
}

const { threeWayMerge, ACTION_KINDS } = mergeMod;
const { deepMergeMcpServers } = mcpMod;

// Deterministic byte producer: matches the implementation contract of
// src/cli/mcp.js → "JSON.stringify(merged, null, 2) + '\n'". Tests use this same
// shape so byte-equality is well-defined.
function jsonBytes(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function makeFixture({ templateMcp, targetMcp }) {
  const tplDir = await mkdtemp(join(tmpdir(), 'mcp-noop-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, '.mcp.json'), jsonBytes(templateMcp));

  const target = await mkdtemp(join(tmpdir(), 'mcp-noop-target-'));
  await mkdir(join(target, '.claude'));
  await writeFile(join(target, '.mcp.json'), jsonBytes(targetMcp));

  // threeWayMerge iterates `Object.keys(oldFiles) ∪ Object.keys(newFiles)`. The
  // SPECIAL_MERGE branch checks `rel in newFiles` before applying the merge, so
  // `.mcp.json` must appear in newManifest.files for the branch to fire. The
  // hash value itself is unused by the SPECIAL_MERGE branch — only the key
  // presence matters.
  const placeholderSha = sha(await readFile(join(tplDir, '.mcp.json')));
  const oldManifest = {
    manifest_version: 2,
    files: { '.mcp.json': placeholderSha },
    baseline_version: '0.0.0',
  };
  const newManifest = {
    manifest_version: 2,
    files: { '.mcp.json': placeholderSha },
    baseline_version: '0.0.1',
  };
  return { tplDir, target, oldManifest, newManifest };
}

describe('threeWayMerge — .mcp.json NOOP (AC-004)', () => {
  it('test_when_mcp_deep_merge_is_byte_identical_then_emits_noop_not_special_merge', async () => {
    // Template + target both define the same baseline servers; the deep-merge of
    // template into target produces exactly target's existing bytes.
    const servers = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
        plantuml: { command: 'npx', args: ['-y', 'plantuml-mcp-server'] },
      },
    };
    const { tplDir, target, oldManifest, newManifest } = await makeFixture({
      templateMcp: servers,
      targetMcp: servers,
    });
    const mcpPath = join(target, '.mcp.json');
    const beforeBytes = await readFile(mcpPath);
    const beforeMtime = (await stat(mcpPath)).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));

    const report = await threeWayMerge(tplDir, target, oldManifest, newManifest);
    const mcpActions = report.actions.filter((a) => a.path === '.mcp.json');

    assert.equal(mcpActions.length, 1, 'exactly one action should be emitted for .mcp.json');
    assert.equal(
      mcpActions[0].kind,
      ACTION_KINDS.NOOP,
      `byte-identical deep-merge must classify as NOOP (not SPECIAL_MERGE); got ${mcpActions[0].kind}. AC-004.`,
    );

    const afterBytes = await readFile(mcpPath);
    assert.equal(sha(afterBytes), sha(beforeBytes), '.mcp.json content must be preserved byte-for-byte');
    const afterMtime = (await stat(mcpPath)).mtimeMs;
    assert.equal(afterMtime, beforeMtime, '.mcp.json mtime must be preserved on NOOP (no write occurred)');
  });

  it('test_when_mcp_deep_merge_diverges_then_emits_special_merge_and_writes', async () => {
    // Template ships refreshed args for context7; target still has stale args.
    // Target also has a user-added server (linear) that the merge must preserve.
    const templateMcp = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp', '--refresh-arg'] },
      },
    };
    const targetMcp = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] }, // stale
        linear: { command: 'npx', args: ['-y', 'linear-mcp'] },              // user-added
      },
    };
    const { tplDir, target, oldManifest, newManifest } = await makeFixture({
      templateMcp,
      targetMcp,
    });

    const report = await threeWayMerge(tplDir, target, oldManifest, newManifest);
    const mcpActions = report.actions.filter((a) => a.path === '.mcp.json');

    assert.equal(mcpActions.length, 1, 'exactly one action for .mcp.json');
    assert.equal(
      mcpActions[0].kind,
      ACTION_KINDS.SPECIAL_MERGE,
      `divergent deep-merge must still classify as SPECIAL_MERGE; got ${mcpActions[0].kind}. AC-004 inverse — the NOOP detection must not regress the refresh path.`,
    );

    const after = JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8'));
    assert.deepEqual(
      after.mcpServers.context7.args,
      ['-y', '@upstash/context7-mcp', '--refresh-arg'],
      'baseline-named context7 server must be refreshed from template args',
    );
    assert.ok(
      after.mcpServers.linear,
      'user-added linear server must be preserved byte-for-byte through the deep-merge',
    );
  });

  it('test_when_deepMergeMcpServers_byte_identical_then_returns_wrote_false', async () => {
    const servers = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
    };
    const tplDir = await mkdtemp(join(tmpdir(), 'mcp-deep-tpl-'));
    const target = await mkdtemp(join(tmpdir(), 'mcp-deep-target-'));
    await writeFile(join(tplDir, '.mcp.json'), jsonBytes(servers));
    await writeFile(join(target, '.mcp.json'), jsonBytes(servers));

    const result = await deepMergeMcpServers(join(tplDir, '.mcp.json'), join(target, '.mcp.json'));

    assert.ok(result && typeof result === 'object',
      `deepMergeMcpServers must return an object; got ${typeof result}. AC-004 contract (Contracts row).`);
    assert.equal(
      result.wrote,
      false,
      `deepMergeMcpServers must return {wrote: false} when merge result is byte-identical to existing target; got ${JSON.stringify(result)}`,
    );
  });
});
