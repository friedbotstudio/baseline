// release-safety-2026-08-25 T7 — AC-014, AC-015, AC-016, AC-020.
//
// The documentation provider was named in the constitution, the genesis spec and
// eight skills, so replacing it meant an amendment. The pointer makes it a config
// edit: one file names the MCP server acting as documentation fetcher, and every
// consumer reads that name rather than a vendor.
//
// Three consumer moves fall out, each touching one file — self-host (change the
// url in .mcp.json), switch provider (replace the entry, then name it in the
// pointer), or go tool-free (remove the entry; VI.5 is an outcome mandate).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const RESOLVER = '.claude/skills/lib/docs-provider.mjs';
const POINTER_REL = '.claude/docs-provider.json';
const SHIPPED_DEFAULT = 'gitmcp';

// Asserted per test rather than thrown at module load: a top-level throw collapses
// twelve distinct reds into one, and the AC each test defends stops being legible.
async function resolver() {
  const mod = await tryImport(RESOLVER);
  assert.equal(
    typeof mod?.readDocsProvider,
    'function',
    `expected named export \`readDocsProvider\` from ${RESOLVER}`,
  );
  return mod;
}

function rootWithPointer(body) {
  const root = mkdtempSync(join(tmpdir(), 'docsprov-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  if (body !== null) writeFileSync(join(root, POINTER_REL), body, 'utf8');
  return root;
}

describe('T7 — the pointer names the provider (AC-014)', () => {
  it('test_when_the_pointer_names_a_provider_then_readDocsProvider_returns_it', async () => {
    const mod = await resolver();
    const root = rootWithPointer(JSON.stringify({ provider: SHIPPED_DEFAULT }));
    assert.equal(mod.readDocsProvider({ rootDir: root }), SHIPPED_DEFAULT);
  });

  it('test_when_the_pointer_names_an_undeclared_server_then_the_resolver_still_returns_it', async () => {
    const mod = await resolver();
    const root = rootWithPointer(JSON.stringify({ provider: 'a-server-the-baseline-never-heard-of' }));

    // A pointer, not a validator. Its whole value is naming a server the baseline
    // does not ship; an undeclared name surfaces when a skill calls it, and a
    // read-time validator would have to allow anything anyway.
    assert.equal(
      mod.readDocsProvider({ rootDir: root }),
      'a-server-the-baseline-never-heard-of',
      'the resolver must not fall back just because the server is absent from .mcp.json',
    );
  });
});

describe('T7 — a broken pointer never stops a skill (AC-015)', () => {
  const degenerate = [
    ['absent file', null],
    ['invalid JSON', '{ not json'],
    ['empty object', '{}'],
    ['empty provider string', JSON.stringify({ provider: '' })],
    ['provider is not a string', JSON.stringify({ provider: 42 })],
    ['top level is an array', JSON.stringify([SHIPPED_DEFAULT])],
  ];

  for (const [label, body] of degenerate) {
    it(`test_when_the_pointer_is_${label.replace(/\s+/g, '_')}_then_the_resolver_falls_back_to_the_default`, async () => {
      const mod = await resolver();
      const root = rootWithPointer(body);
      assert.equal(
        mod.readDocsProvider({ rootDir: root }),
        SHIPPED_DEFAULT,
        `a ${label} pointer must fail open to the shipped default, never throw — a broken pointer must not stop a skill verifying an API against current docs`,
      );
    });
  }
});

describe('T7 — the shipped configuration is usable out of the box (AC-016)', () => {
  it('test_when_the_provider_entry_is_read_then_it_declares_a_type_alongside_its_url', () => {
    const pointer = JSON.parse(readFileSync(join(REPO_ROOT, POINTER_REL), 'utf8'));
    const mcp = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));
    const entry = (mcp.mcpServers || {})[pointer.provider];

    assert.ok(entry, `.mcp.json must declare the server the pointer names (${pointer.provider})`);
    if (entry.url) {
      assert.ok(
        typeof entry.type === 'string' && entry.type.length > 0,
        'a remote entry carrying `url` must also carry `type` — Claude Code reads a type-less entry as stdio and skips the server silently',
      );
    }
  });

  it('test_when_the_shipped_pointer_is_read_then_it_names_the_default_provider', () => {
    const pointer = JSON.parse(readFileSync(join(REPO_ROOT, POINTER_REL), 'utf8'));
    assert.equal(pointer.provider, SHIPPED_DEFAULT, 'the baseline ships a working provider out of the box');
  });

  it('test_when_the_template_pointer_is_read_then_it_matches_the_live_pointer', () => {
    const live = readFileSync(join(REPO_ROOT, POINTER_REL), 'utf8');
    const template = readFileSync(join(REPO_ROOT, 'src', 'docs-provider.template.json'), 'utf8');
    assert.equal(template, live, 'the shipped mirror must match the live pointer, or a consumer installs a different default');
  });
});

describe('T7 — the audit reads the pointer, not a literal (AC-020)', () => {
  it('test_when_audit_baseline_reports_the_satisfier_then_the_name_comes_from_the_pointer', async () => {
    const mod = await tryImport('.claude/skills/audit-baseline/expected-baseline.mjs');
    assert.ok(mod, 'expected-baseline.mjs must be importable');

    const source = readFileSync(
      join(REPO_ROOT, '.claude', 'skills', 'audit-baseline', 'expected-baseline.mjs'),
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /DEFAULT_MCP_SERVERS\s*=\s*new Set\(\[\s*'[a-z0-9-]+'/,
      'DEFAULT_MCP_SERVERS must derive from the pointer rather than hard-coding a vendor name',
    );
    assert.match(
      source,
      /readDocsProvider/,
      'expected-baseline.mjs must consult the docs-provider resolver',
    );
  });
});
