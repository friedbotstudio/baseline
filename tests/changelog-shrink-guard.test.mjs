// Club A — changelog actuator data-loss guard.
//
// appendUnderUnreleased REPLACES the [Unreleased] body with the rendered
// entries. Feeding fewer entries than currently present silently drops the
// rest (hit live in WF-5: a 5-entry file would have wiped 27 accumulated
// entries). Guard: refuse a shrinking replace unless allowShrink is set, so the
// common accumulate case is safe by default and an intentional prune (3a5e) is
// explicit.
//
// RED until: unreleased-writer.mjs appendUnderUnreleased gains an opts arg with
// a shrinkage guard.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRITER = join(REPO_ROOT, '.claude/skills/changelog/unreleased-writer.mjs');

const FIXTURE = `# Changelog

## [Unreleased]

### Added
- existing one
- existing two
- existing three

# [0.1.0] - 2026-01-01

### Added
- shipped
`;

async function withChangelog(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'clog-shrink-'));
  try {
    const p = join(dir, 'CHANGELOG.md');
    writeFileSync(p, FIXTURE);
    return await fn(p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bullets = (p) => {
  const s = readFileSync(p, 'utf8');
  const u = s.slice(s.search(/^## \[Unreleased\]/m), s.search(/^#{1,2} \[\d/m));
  return (u.match(/^- /gm) || []).length;
};

describe('changelog shrink guard — refuses a shrinking replace without allowShrink', () => {
  it('test_when_changelog_entries_fewer_than_existing_then_refuses_without_allow_shrink', async () => {
    const { appendUnderUnreleased } = await import(WRITER);
    await withChangelog(async (p) => {
      // 3 existing bullets; supplying 1 entry is a shrink → must refuse when the
      // guard is on (the actuator turns it on unless --allow-shrink).
      await assert.rejects(
        () => appendUnderUnreleased(p, [{ section: 'Added', body: 'only one' }], { guardShrink: true }),
        /shrink|fewer|would drop|allow-shrink/i,
        'a shrinking replace must be refused when guardShrink is on'
      );
      // The file must be untouched (still 3 bullets) — refuse happens before write.
      assert.equal(bullets(p), 3, 'CHANGELOG must be unchanged after a refused shrink');
    });

    await withChangelog(async (p) => {
      // Same shrink, guard OFF (the --allow-shrink path) → proceeds, shrinks to 1.
      await appendUnderUnreleased(p, [{ section: 'Added', body: 'only one' }], { guardShrink: false });
      assert.equal(bullets(p), 1, 'guard off (--allow-shrink) permits the intentional prune');
    });
  });

  it('test_when_changelog_entries_ge_existing_then_replaces_without_flag', async () => {
    const { appendUnderUnreleased } = await import(WRITER);
    await withChangelog(async (p) => {
      // 5 entries >= 3 existing → growth proceeds even with the guard ON.
      const entries = [1, 2, 3, 4, 5].map((n) => ({ section: 'Added', body: `grown ${n}` }));
      await appendUnderUnreleased(p, entries, { guardShrink: true });
      assert.equal(bullets(p), 5, 'growth/equal proceeds even with guardShrink on (common accumulate case)');
    });
  });
});
