// A4 — approve-spec token from a provenance-anchored ledger entry. RED until
// approval-provenance.mjs exists and evidence-ledger.mjs gains
// appendApprovalProvenance. AC-403: /approve-swarm + /grant-commit guards must
// NOT gain the anchor requirement (regression).
// Covers: AC-401 (token carries resolvable anchor), AC-402 (dangling/absent
// anchor rejected), AC-403 (swarm/commit guards untouched).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AP = join(REPO_ROOT, '.claude/skills/spec/approval-provenance.mjs');
const LEDGER = join(REPO_ROOT, '.claude/skills/harness/evidence-ledger.mjs');

describe('A4 approval provenance', () => {
  it('test_when_deriveApprovalToken_then_carries_anchor', async () => {
    const { deriveApprovalToken, verifyAnchor } = await import(AP);
    const { appendApprovalProvenance } = await import(LEDGER);
    const dir = mkdtempSync(join(tmpdir(), 'ap-'));
    const ledgerPath = join(dir, 'ledger.json');
    const { entry } = appendApprovalProvenance(ledgerPath, {
      slug: 'demo-slug', class: 'B', evidence_verdict: 'ok', spec_hash: 'abc123',
    });
    const token = deriveApprovalToken({
      slug: 'demo-slug', ledgerEntry: entry, specHash: 'abc123', epoch: 111, absPath: '/x/spec.md', gitSha: 'N/A',
    });
    const lines = token.split(/\r?\n/);
    assert.equal(lines[0], 'APPROVED');
    assert.ok(lines.some((l) => l.startsWith('ledger_ref:')), 'token carries ledger_ref anchor');
    const v = verifyAnchor({ slug: 'demo-slug', tokenLines: lines, ledgerPath });
    assert.equal(v.ok, true);
  });

  it('test_when_verifyAnchor_dangling_ref_then_false', async () => {
    const { verifyAnchor } = await import(AP);
    const { appendApprovalProvenance } = await import(LEDGER);
    const dir = mkdtempSync(join(tmpdir(), 'ap-'));
    const ledgerPath = join(dir, 'ledger.json');
    appendApprovalProvenance(ledgerPath, { slug: 'demo-slug', class: 'B', evidence_verdict: 'ok', spec_hash: 'abc' });
    const v = verifyAnchor({ slug: 'demo-slug', tokenLines: ['APPROVED', 'ledger_ref: ap-demo-slug-999'], ledgerPath });
    assert.equal(v.ok, false);
  });

  it('test_when_verifyAnchor_absent_ledger_then_false', async () => {
    const { verifyAnchor } = await import(AP);
    const v = verifyAnchor({ slug: 'demo-slug', tokenLines: ['APPROVED', 'ledger_ref: ap-demo-slug-0'], ledgerPath: '/nonexistent/ledger.json' });
    assert.equal(v.ok, false);
  });

  it('test_when_verifyAnchor_no_anchor_line_then_false', async () => {
    const { verifyAnchor } = await import(AP);
    const v = verifyAnchor({ slug: 'demo-slug', tokenLines: ['APPROVED', '111'], ledgerPath: '/x.json' });
    assert.equal(v.ok, false);
  });

  it('test_when_deriveApprovalToken_unsafe_slug_then_throws', async () => {
    const { deriveApprovalToken } = await import(AP);
    assert.throws(() => deriveApprovalToken({ slug: '../etc', ledgerEntry: { id: 'x' }, specHash: 'a', epoch: 1, absPath: '/x', gitSha: 'N/A' }));
  });

  it('test_when_swarm_and_commit_guards_unchanged_then_no_provenance_import', async () => {
    // AC-403: A4 is scoped to spec_approval_guard only.
    const swarm = readFileSync(join(REPO_ROOT, '.claude/hooks/swarm_approval_guard.mjs'), 'utf8');
    const commit = readFileSync(join(REPO_ROOT, '.claude/hooks/git_commit_guard.mjs'), 'utf8');
    assert.ok(!/approval-provenance|approval-anchor|verifyAnchor/.test(swarm), 'swarm guard untouched by A4');
    assert.ok(!/approval-provenance|approval-anchor|verifyAnchor/.test(commit), 'commit guard untouched by A4');
  });
});
