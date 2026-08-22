// Epic 13 (baseline-mcp) Slice A — rename the `sprint-channel` MCP server to `baseline`.
//
// Covers AC-005, AC-006, AC-007, AC-008, AC-009 of docs/specs/baseline-mcp.md.
//
// The defect this slice fixes: `computeMergedMcpServers` preserves any server the
// consumer's `.mcp.json` carries that the template does not name. That rule is
// correct for a user-added server and wrong for a renamed one — after the rename
// a consumer would carry BOTH `sprint-channel` (pointing at a directory that no
// longer ships) and `baseline`, forever, with no way to shed the stale entry short
// of hand-editing. `src/cli/renames.js` records the rename so the merge can tell a
// renamed-away server from a user-added one.
//
// Scope decision for AC-008 (recorded here because the AC's phrase "no non-archive
// file" needs a boundary): the assertion covers the RUNTIME and GOVERNANCE surfaces
// — the ones a consumer install executes or a maintainer treats as binding. Files
// that record history (CHANGELOG.md, docs/specs, docs/intake, docs/research,
// docs/scout, .claude/memory) legitimately name the old server, because that is
// what they are for: this very spec describes the rename and must be able to say
// the old name out loud.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { computeMergedMcpServers } = await import('../src/cli/mcp.js');
const { threeWayMerge, ACTION_KINDS } = await import('../src/cli/merge.js');

function jsonBytes(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function makeFixture({ templateMcp, targetMcp }) {
  const tplDir = await mkdtemp(join(tmpdir(), 'mcp-rename-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, '.mcp.json'), jsonBytes(templateMcp));

  const target = await mkdtemp(join(tmpdir(), 'mcp-rename-target-'));
  await mkdir(join(target, '.claude'));
  await writeFile(join(target, '.mcp.json'), jsonBytes(targetMcp));

  const placeholderSha = sha(await readFile(join(tplDir, '.mcp.json')));
  const oldManifest = { manifest_version: 2, files: { '.mcp.json': placeholderSha }, baseline_version: '0.0.0' };
  const newManifest = { manifest_version: 2, files: { '.mcp.json': placeholderSha }, baseline_version: '0.0.1' };
  return { tplDir, target, oldManifest, newManifest };
}

const BASELINE_SERVER = { command: 'node', args: ['.claude/mcp/baseline/server.mjs'] };
const CONTEXT7 = { command: 'npx', args: ['-y', '@upstash/context7-mcp'] };

describe('Slice A — MCP server rename: merge semantics', () => {
  it('test_when_consumer_mcp_json_carries_sprint_channel_then_merge_removes_it_and_adds_baseline', async () => {
    // AC-005. The consumer is on a pre-rename install; the template has moved on.
    const { tplDir, target } = await makeFixture({
      templateMcp: { mcpServers: { context7: CONTEXT7, baseline: BASELINE_SERVER } },
      targetMcp: {
        mcpServers: {
          context7: CONTEXT7,
          'sprint-channel': { command: 'node', args: ['.claude/mcp/sprint-channel/server.mjs'] },
        },
      },
    });

    const { merged } = await computeMergedMcpServers(join(tplDir, '.mcp.json'), join(target, '.mcp.json'));
    const servers = JSON.parse(merged).mcpServers;

    assert.ok('baseline' in servers, 'the renamed-to server must be present after the merge');
    assert.ok(
      !('sprint-channel' in servers),
      'the renamed-from server must be dropped, not carried alongside its replacement',
    );
  });

  it('test_when_consumer_mcp_json_carries_third_party_server_then_merge_leaves_it_untouched', async () => {
    // AC-006. The rename record must not become a licence to prune user-added servers.
    const thirdParty = { command: 'npx', args: ['-y', 'acme-tools-mcp'], env: { ACME_TOKEN: 'xyz' } };
    const { tplDir, target } = await makeFixture({
      templateMcp: { mcpServers: { context7: CONTEXT7, baseline: BASELINE_SERVER } },
      targetMcp: {
        mcpServers: {
          context7: CONTEXT7,
          'sprint-channel': { command: 'node', args: ['.claude/mcp/sprint-channel/server.mjs'] },
          'acme-tools': thirdParty,
        },
      },
    });

    const { merged } = await computeMergedMcpServers(join(tplDir, '.mcp.json'), join(target, '.mcp.json'));
    const servers = JSON.parse(merged).mcpServers;

    assert.deepEqual(servers['acme-tools'], thirdParty, 'a server absent from both template and rename record survives verbatim');
    assert.ok(!('sprint-channel' in servers), 'the renamed server is still dropped alongside it');
  });

  it('test_when_template_does_not_carry_the_new_name_then_the_old_server_is_left_alone', async () => {
    // Boundary. A consumer merging an OLDER template that still ships `sprint-channel`
    // must keep it — the rename only applies once the template actually offers the
    // replacement. Without this rule the merge would strip a server the consumer
    // still needs and leave nothing in its place.
    const { tplDir, target } = await makeFixture({
      templateMcp: { mcpServers: { context7: CONTEXT7 } },
      targetMcp: {
        mcpServers: {
          context7: CONTEXT7,
          'sprint-channel': { command: 'node', args: ['.claude/mcp/sprint-channel/server.mjs'] },
        },
      },
    });

    const { merged } = await computeMergedMcpServers(join(tplDir, '.mcp.json'), join(target, '.mcp.json'));
    const servers = JSON.parse(merged).mcpServers;

    assert.ok('sprint-channel' in servers, 'no replacement in the template means no rename to apply');
  });

  it('test_when_merge_result_is_byte_identical_then_three_way_merge_classifies_noop', async () => {
    // AC-007. The rename logic must not perturb the byte-equal short-circuit that
    // keeps an idempotent re-run from rewriting the file.
    const settled = { mcpServers: { context7: CONTEXT7, baseline: BASELINE_SERVER } };
    const { tplDir, target, oldManifest, newManifest } = await makeFixture({
      templateMcp: settled,
      targetMcp: settled,
    });

    const before = await stat(join(target, '.mcp.json'));
    const report = await threeWayMerge(tplDir, target, oldManifest, newManifest);
    const after = await stat(join(target, '.mcp.json'));

    const mcpAction = report.actions.find((a) => a.path === '.mcp.json');
    assert.ok(mcpAction, 'the merge must classify .mcp.json');
    assert.equal(mcpAction.kind, ACTION_KINDS.NOOP, 'a byte-identical merge is a NOOP, not a SPECIAL_MERGE');
    assert.equal(after.mtimeMs, before.mtimeMs, 'a NOOP must not rewrite the file');
  });
});

describe('Slice A — renamed tree is internally consistent', () => {
  it('test_when_renamed_tree_is_audited_then_expected_servers_name_baseline_not_sprint_channel', async () => {
    // AC-008, first half.
    const { EXPECTED_MCP_SERVERS } = await import('../.claude/skills/audit-baseline/expected-baseline.mjs');
    assert.ok(EXPECTED_MCP_SERVERS.has('baseline'), 'the audit must expect the renamed server');
    assert.ok(!EXPECTED_MCP_SERVERS.has('sprint-channel'), 'the audit must no longer expect the old name');

    const mcpJson = JSON.parse(await readFile(join(ROOT, '.mcp.json'), 'utf8'));
    assert.ok('baseline' in mcpJson.mcpServers, '.mcp.json registers the renamed server');
    assert.ok(!('sprint-channel' in mcpJson.mcpServers), '.mcp.json no longer registers the old name');
  });

  it('test_when_runtime_and_governance_surfaces_are_scanned_then_only_the_rename_record_names_sprint_channel', () => {
    // AC-008, second half. Scope is the runtime + governance surfaces (see the header
    // note); history-bearing documents are deliberately excluded.
    //
    // `git ls-files` names the tracked set, but each file is read from the WORKING TREE:
    // the index only holds what has been staged, so an index read would report a rename
    // as incomplete right up until the moment it is committed.
    const GOVERNED = [
      '.claude/mcp',
      '.claude/skills',
      '.claude/agents',
      '.claude/hooks',
      '.mcp.json',
      'src',
      'scripts',
      'site-src',
      'docs/system',
      'CLAUDE.md',
      '.claude/CONSTITUTION.md',
      'docs/init/seed.md',
      'README.md',
      'PRODUCT.md',
    ];
    const ALLOWED = new Set(['src/cli/renames.js']);

    const tracked = execFileSync('git', ['ls-files', '-z', '--', ...GOVERNED], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);

    const offenders = [];
    for (const rel of tracked) {
      if (ALLOWED.has(rel)) continue;
      let text;
      try {
        text = readFileSync(join(ROOT, rel), 'utf8');
      } catch {
        continue; // renamed or deleted in the working tree — nothing on disk to scan
      }
      if (text.includes('sprint-channel')) offenders.push(rel);
    }

    assert.deepEqual(offenders, [], `these governed files still name the old server: ${offenders.join(', ')}`);
  });

  it('test_when_amendment_lands_then_both_template_mirrors_reconcile', async () => {
    // AC-009. The two mirrors are NOT the same kind: CLAUDE.md copies whole into
    // src/CLAUDE.template.md, while docs/init/seed.md splices around the template's
    // own §16-§17 block. `reconcile` is the contract that knows the difference, so a
    // naive byte compare would be wrong for the seed pair.
    const { reconcile } = await import('../scripts/sync-constitution-mirror.mjs');
    const result = reconcile({ rootDir: ROOT, mode: 'check' });
    assert.deepEqual(result.drifted, [], `template mirrors drifted: ${result.drifted.join(', ')}`);
    assert.equal(result.exitCode, 0, 'a drifted mirror exits non-zero');
  });
});
