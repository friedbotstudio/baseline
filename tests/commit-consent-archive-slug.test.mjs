// T9 / -7af6 — workflow-scoped commit consent must survive a long landing.
//
// The bug: /commit Step 1 archives workflow.json into docs/archive/<date>/<slug>/
// BEFORE the actual git commit, so resolveWorkflow sees ENOENT and the decision
// drops to the ad-hoc 900s time window. A landing longer than 900s between grant
// and commit then hits "consent expired" and forces a second /grant-commit.
//
// The fix is TWO-part, and neither half is sufficient alone: restoring slug mode
// via the archived bundle still expires, because the TTL check applies in slug
// mode too (consent-decision.mjs). So the archive lookup pairs with a separate,
// longer TTL that applies ONLY to the slug-bound branch.
//
// Covers: AC-005 (archive resolution), AC-006 (slug-mode TTL), AC-007 (ad-hoc
// window unchanged), AC-009 (no bundle → time-window fallback), AC-010 (archived
// authority still decays).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideCommitConsent, resolveWorkflow } from '../.claude/hooks/lib/consent-decision.mjs';

const NOW = 1_000_000;
const ADHOC_TTL = 900;
const WORKFLOW_TTL = 14_400;
const SLUG = 'slug-guard-hoist-and-consent-expiry';

function emptyRoot() {
  const root = mkdtempSync(join(tmpdir(), 'consent-archive-'));
  mkdirSync(join(root, '.claude', 'state'), { recursive: true });
  return root;
}

function withArchivedBundle(root, slug, date = '2026-07-25') {
  const bundle = join(root, 'docs', 'archive', date, slug);
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, 'workflow.json'), JSON.stringify({ slug, track_id: 'spec-entry' }));
  return root;
}

function withLiveWorkflow(root, slug) {
  writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify({ slug, track_id: 'spec-entry' }));
  return root;
}

describe('AC-005 archived-bundle slug resolution', () => {
  it('test_when_live_workflow_absent_and_archive_bundle_matches_token_then_resolve_from_archive', () => {
    const root = withArchivedBundle(emptyRoot(), SLUG);
    const resolved = resolveWorkflow(root, SLUG);
    assert.equal(resolved.present, true, 'the archived bundle must revive workflow scope');
    assert.equal(resolved.slug, SLUG);
    assert.equal(resolved.readable, true);
    assert.equal(resolved.source, 'archive');
  });

  it('test_when_archive_holds_a_different_slug_then_token_slug_alone_resolves', () => {
    const root = emptyRoot();
    withArchivedBundle(root, 'other-workflow', '2026-07-20');
    withArchivedBundle(root, SLUG, '2026-07-25');

    assert.equal(resolveWorkflow(root, SLUG).slug, SLUG);
    assert.equal(
      resolveWorkflow(root, 'not-present').present,
      false,
      'a token naming an unarchived workflow must not borrow another bundle',
    );
  });

  it('test_when_token_slug_is_hostile_then_archive_lookup_refuses_to_build_a_path', () => {
    const root = withArchivedBundle(emptyRoot(), SLUG);
    const resolved = resolveWorkflow(root, '../../etc/passwd');
    assert.equal(resolved.present, false, 'a hostile token slug must never reach a path build');
  });

  it('test_when_live_workflow_present_then_archive_is_not_consulted', () => {
    const root = withArchivedBundle(emptyRoot(), SLUG);
    withLiveWorkflow(root, 'live-workflow');
    const resolved = resolveWorkflow(root, SLUG);
    assert.equal(resolved.slug, 'live-workflow', 'the live file always wins over an archived bundle');
    assert.equal(resolved.source, undefined, 'the live path carries no source marker');
  });
});

describe('AC-009 no bundle degrades to the ad-hoc window', () => {
  it('test_when_no_bundle_and_no_live_workflow_then_falls_back_to_time_window', () => {
    const root = emptyRoot();
    const resolved = resolveWorkflow(root, 'anything');
    assert.equal(resolved.present, false);

    const decision = decideCommitConsent({
      token: { slug: 'anything', epoch: NOW - 10 },
      workflow: resolved,
      now: NOW,
      ttl: ADHOC_TTL,
      workflowTtl: WORKFLOW_TTL,
    });
    assert.equal(decision.mode, 'time-window');
  });

  it('test_when_docs_dir_absent_entirely_then_resolve_does_not_throw', () => {
    const root = mkdtempSync(join(tmpdir(), 'consent-nodocs-'));
    assert.doesNotThrow(() => resolveWorkflow(root, SLUG));
    assert.equal(resolveWorkflow(root, SLUG).present, false);
  });
});

describe('AC-006 / AC-010 slug-mode TTL is separate and still decays', () => {
  const live = { present: true, slug: SLUG, readable: true };

  it('test_when_workflow_scoped_token_within_workflow_ttl_then_allowed', () => {
    const decision = decideCommitConsent({
      token: { slug: SLUG, epoch: NOW - 1800 },
      workflow: live,
      now: NOW,
      ttl: ADHOC_TTL,
      workflowTtl: WORKFLOW_TTL,
    });
    assert.equal(decision.allow, true, 'a 1800s-old workflow grant must survive the ad-hoc window');
    assert.equal(decision.mode, 'slug');
  });

  it('test_when_workflow_scoped_token_past_workflow_ttl_then_denied', () => {
    const decision = decideCommitConsent({
      token: { slug: SLUG, epoch: NOW - 20_000 },
      workflow: live,
      now: NOW,
      ttl: ADHOC_TTL,
      workflowTtl: WORKFLOW_TTL,
    });
    assert.equal(decision.allow, false, 'archived-bundle authority must still decay');
    assert.equal(decision.mode, 'slug');
  });

  it('test_when_slug_mismatches_then_denied_regardless_of_ttl', () => {
    const decision = decideCommitConsent({
      token: { slug: 'another-workflow', epoch: NOW - 10 },
      workflow: live,
      now: NOW,
      ttl: ADHOC_TTL,
      workflowTtl: WORKFLOW_TTL,
    });
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /another-workflow/);
  });
});

describe('AC-007 the ad-hoc time window is unchanged', () => {
  const absent = { present: false, slug: '', readable: true };

  it('test_when_adhoc_token_past_time_window_then_denied_at_900', () => {
    const decision = decideCommitConsent({
      token: { slug: '', epoch: NOW - 1000 },
      workflow: absent,
      now: NOW,
      ttl: ADHOC_TTL,
      workflowTtl: WORKFLOW_TTL,
    });
    assert.equal(decision.allow, false, 'the longer workflow TTL must never rescue an ad-hoc token');
    assert.equal(decision.mode, 'time-window');
  });

  it('test_when_adhoc_token_fresh_then_still_allowed', () => {
    const decision = decideCommitConsent({
      token: { slug: '', epoch: NOW - 10 },
      workflow: absent,
      now: NOW,
      ttl: ADHOC_TTL,
      workflowTtl: WORKFLOW_TTL,
    });
    assert.equal(decision.allow, true);
    assert.equal(decision.mode, 'time-window');
  });
});

describe('back-compat — the existing consent-decision contract must not shift', () => {
  it('test_when_workflow_ttl_omitted_then_slug_mode_falls_back_to_ttl', () => {
    // tests/consent-decision.test.mjs calls decideCommitConsent WITHOUT workflowTtl
    // and expects a 1000s-old slug-mode token to be denied at ttl=900. The default
    // must therefore be `ttl`, never the 14400 config value.
    const decision = decideCommitConsent({
      token: { slug: SLUG, epoch: NOW - 1000 },
      workflow: { present: true, slug: SLUG, readable: true },
      now: NOW,
      ttl: ADHOC_TTL,
    });
    assert.equal(decision.allow, false, 'omitted workflowTtl must default to ttl for back-compat');
  });

  it('test_when_resolve_called_with_one_arg_then_shape_is_exactly_three_keys', () => {
    // tests/consent-decision.test.mjs asserts deepEqual on a 3-key object, so the
    // `source` key may appear ONLY on the archive-resolved result.
    const root = emptyRoot();
    assert.deepEqual(resolveWorkflow(root), { present: false, slug: '', readable: true });

    withLiveWorkflow(root, 'my-workflow');
    assert.deepEqual(resolveWorkflow(root), { present: true, slug: 'my-workflow', readable: true });
  });
});
