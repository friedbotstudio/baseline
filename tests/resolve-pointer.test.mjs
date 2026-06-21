// resolve-pointer — AC-001 (tdd-state pointer resolution)
//
// resolvePointer({spec_slug, ac_id, anchor}, rootDir) returns the text of the
// referenced spec behavior section; throws DanglingPointerError when the spec
// slug or the anchor cannot be resolved. SUT: .claude/skills/tdd/resolve-pointer.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUT = join(HERE, '../.claude/skills/tdd/resolve-pointer.mjs');

const FIXTURE_SPEC = `# Spec — fixture

## Design

### Behavior — sequence per AC

\`\`\`plantuml
@startuml
title Behavior #1 — create order
actor Client
Client -> API : POST /orders {sku, qty}
API --> Client : 201 Created
@enduml
\`\`\`
`;

async function makeSpecRoot() {
  const root = await mkdtemp(join(tmpdir(), 'resolve-pointer-'));
  await mkdir(join(root, 'docs/specs'), { recursive: true });
  await writeFile(join(root, 'docs/specs/fixture.md'), FIXTURE_SPEC);
  return root;
}

describe('resolvePointer (tdd-state pointer → spec section)', () => {
  it('test_when_resolvepointer_valid_then_returns_section_text', async () => {
    const { resolvePointer } = await import(SUT);
    const root = await makeSpecRoot();
    try {
      const text = await resolvePointer(
        { spec_slug: 'fixture', ac_id: 'AC-001', anchor: 'Behavior #1' }, root,
      );
      assert.ok(typeof text === 'string' && text.length > 0, 'returns non-empty section text');
      assert.match(text, /POST \/orders/, 'resolved text carries the behavior contract body');
      assert.match(text, /Behavior #1/, 'resolved text includes the anchored heading/title');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_resolvepointer_missing_anchor_then_throws', async () => {
    const { resolvePointer, DanglingPointerError } = await import(SUT);
    const root = await makeSpecRoot();
    try {
      await assert.rejects(
        () => resolvePointer({ spec_slug: 'fixture', ac_id: 'AC-009', anchor: 'Behavior #99' }, root),
        (err) => err instanceof DanglingPointerError || err.name === 'DanglingPointerError',
        'a missing anchor must throw DanglingPointerError',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_resolvepointer_missing_slug_then_throws', async () => {
    const { resolvePointer, DanglingPointerError } = await import(SUT);
    const root = await makeSpecRoot();
    try {
      await assert.rejects(
        () => resolvePointer({ spec_slug: 'nonexistent', ac_id: 'AC-001', anchor: 'Behavior #1' }, root),
        (err) => err instanceof DanglingPointerError || err.name === 'DanglingPointerError',
        'a missing spec slug must throw DanglingPointerError',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_resolvepointer_traversal_slug_then_rejected', async () => {
    const { resolvePointer, DanglingPointerError } = await import(SUT);
    const root = await makeSpecRoot();
    try {
      for (const evil of ['../../../../etc/passwd', 'a/b', 'foo.bar', '..']) {
        await assert.rejects(
          () => resolvePointer({ spec_slug: evil, ac_id: 'AC-001', anchor: 'Behavior #1' }, root),
          (err) => err instanceof DanglingPointerError || err.name === 'DanglingPointerError',
          `a path-traversal / non-slug spec_slug (${evil}) must be rejected before any file read`,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
