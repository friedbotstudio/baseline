// consent-decision.test.mjs — workflow-scoped commit consent with time-window fallback.
//
// Generalizes the ERP's ADR-0033: slug-scope inside an active workflow, fall back to the
// time window when no workflow.json is present, fail closed when one is present but broken.
// These assertions pin all three branches + the token/marker shapes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCommitConsentToken,
  decideCommitConsent,
  buildGrantCommitMarkerLines,
  resolveWorkflow,
} from '../.claude/hooks/lib/consent-decision.mjs';

const NOW = 1_000_000;
const TTL = 900;

describe('parseCommitConsentToken', () => {
  it('parses slug-mode (line1 slug, line2 epoch)', () => {
    assert.deepEqual(parseCommitConsentToken('my-slug\n1000000\nnote'), { slug: 'my-slug', epoch: 1000000 });
  });
  it('parses empty-slug token (ad-hoc)', () => {
    assert.deepEqual(parseCommitConsentToken('\n1000000\n'), { slug: '', epoch: 1000000 });
  });
  it('parses legacy epoch-only token (numeric line1, no line2)', () => {
    assert.deepEqual(parseCommitConsentToken('1000000'), { slug: '', epoch: 1000000 });
  });
  it('yields null epoch for a malformed token', () => {
    assert.deepEqual(parseCommitConsentToken('slug\nnot-a-number'), { slug: 'slug', epoch: null });
  });
});

describe('decideCommitConsent — time-window fallback (no workflow)', () => {
  const absent = { present: false, slug: '', readable: true };
  it('allows a fresh ad-hoc token when no workflow is active', () => {
    const d = decideCommitConsent({ token: { slug: '', epoch: NOW - 10 }, workflow: absent, now: NOW, ttl: TTL });
    assert.equal(d.allow, true);
    assert.equal(d.mode, 'time-window');
  });
  it('denies an expired ad-hoc token', () => {
    const d = decideCommitConsent({ token: { slug: '', epoch: NOW - 1000 }, workflow: absent, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
  });
  it('denies when the token has no epoch', () => {
    const d = decideCommitConsent({ token: { slug: '', epoch: null }, workflow: absent, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
  });
});

describe('decideCommitConsent — slug-scoped (workflow present)', () => {
  const live = { present: true, slug: 'my-workflow', readable: true };
  it('allows a fresh token whose slug matches the live workflow', () => {
    const d = decideCommitConsent({ token: { slug: 'my-workflow', epoch: NOW - 10 }, workflow: live, now: NOW, ttl: TTL });
    assert.equal(d.allow, true);
    assert.equal(d.mode, 'slug');
  });
  it('denies a token granted for a different workflow', () => {
    const d = decideCommitConsent({ token: { slug: 'other-workflow', epoch: NOW - 10 }, workflow: live, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
    assert.match(d.reason, /other-workflow/);
  });
  it('denies a slugless (ad-hoc) token inside a workflow', () => {
    const d = decideCommitConsent({ token: { slug: '', epoch: NOW - 10 }, workflow: live, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
  });
  it('denies an expired matching token', () => {
    const d = decideCommitConsent({ token: { slug: 'my-workflow', epoch: NOW - 1000 }, workflow: live, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
  });
});

describe('decideCommitConsent — fail closed (workflow present but broken)', () => {
  it('denies when workflow.json is present but unreadable', () => {
    const d = decideCommitConsent({ token: { slug: 'x', epoch: NOW }, workflow: { present: true, slug: '', readable: false }, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
  });
  it('denies when workflow.json is present but carries no slug', () => {
    const d = decideCommitConsent({ token: { slug: 'x', epoch: NOW }, workflow: { present: true, slug: '', readable: true }, now: NOW, ttl: TTL });
    assert.equal(d.allow, false);
  });
});

describe('buildGrantCommitMarkerLines', () => {
  it('writes slug-first (3 lines) inside a workflow', () => {
    assert.deepEqual(buildGrantCommitMarkerLines('my-slug', NOW, 'note'), ['my-slug', String(NOW), 'note']);
  });
  it('writes epoch-first (2 lines) with no workflow', () => {
    assert.deepEqual(buildGrantCommitMarkerLines('', NOW, ''), [String(NOW), '']);
  });
});

describe('resolveWorkflow — absent vs present vs broken (the ADR-0033 conflation split)', () => {
  function tmpRoot() {
    const root = mkdtempSync(join(tmpdir(), 'cwf-'));
    mkdirSync(join(root, '.claude', 'state'), { recursive: true });
    return root;
  }
  it('absent workflow.json → present:false (fallback path)', () => {
    const root = tmpRoot();
    assert.deepEqual(resolveWorkflow(root), { present: false, slug: '', readable: true });
  });
  it('valid workflow.json with slug → present:true, readable, slug', () => {
    const root = tmpRoot();
    writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify({ slug: 'my-workflow', track_id: 'spec-entry' }));
    assert.deepEqual(resolveWorkflow(root), { present: true, slug: 'my-workflow', readable: true });
  });
  it('unparseable workflow.json → present:true, readable:false (fail closed)', () => {
    const root = tmpRoot();
    writeFileSync(join(root, '.claude/state/workflow.json'), '{ not json');
    assert.deepEqual(resolveWorkflow(root), { present: true, slug: '', readable: false });
  });
  it('present but slugless workflow.json → readable:true, slug empty (decide fails it closed)', () => {
    const root = tmpRoot();
    writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify({ track_id: 'spec-entry' }));
    assert.deepEqual(resolveWorkflow(root), { present: true, slug: '', readable: true });
  });
});
