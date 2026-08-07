// central-system-spec slice E — /archive folds the landed change back in (AC-019, AC-020).
//
// `applyContribution` has had a full test suite and ZERO callers since it was
// written. Wiring it to Phase 10.5 is what makes the central spec stay true to disk
// instead of drifting the moment the next cycle ships.
//
// The load-bearing assertion here is the NEGATIVE one. A sync-back that re-stamps
// every element on every landing makes `classify()` permanently green and launders
// exactly the drift the digest exists to catch — the decay-evasion shape this system
// has already removed twice (backfill D3; the retired "HEAD is permanently fresh"
// semantics). Applying to touched anchors only is the whole discipline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyLiveCorpus } from './helpers/memory-fixtures.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule(rel) {
  const abs = resolve(REPO_ROOT, rel);
  if (!existsSync(abs)) return { module: null, reason: `${rel} does not exist yet` };
  try {
    return { module: await import(abs), reason: null };
  } catch (err) {
    return { module: null, reason: `${rel} exists but failed to load: ${err.message}` };
  }
}

const elementPath = (specDir, id) => join(specDir, 'elements', `${id}.md`);
const readElement = (specDir, id) => readFileSync(elementPath(specDir, id), 'utf8');

// Two real elements with FILE anchors: a glob-anchored element is never digested,
// so it would satisfy the "untouched" half for the wrong reason.
function twoFileAnchoredElements(specDir) {
  const found = [];
  for (const name of readdirSync(join(specDir, 'elements'))) {
    const text = readFileSync(join(specDir, 'elements', name), 'utf8');
    const anchor = /^anchor:\s*(\S+)\s*$/m.exec(text)?.[1];
    if (anchor && !anchor.includes('*')) found.push({ id: name.replace(/\.md$/, ''), anchor });
    if (found.length === 2) break;
  }
  return found;
}

describe('E — the landed change folds back into the central spec', () => {
  it('test_when_archive_runs_then_only_touched_anchors_are_written', async () => {
    const { module: contribute, reason } = await loadModule('.claude/skills/workspace/contribute.mjs');
    assert.ok(contribute, reason);
    assert.equal(typeof contribute.syncBack, 'function',
      'contribute.mjs must export syncBack — /archive has no other way to fold a landing back in');

    // The corpus copy is writable, but its anchors describe the REAL tree — so the
    // digest must resolve against REPO_ROOT. Pointing rootDir at the tmpdir makes
    // every anchor dangling and the stamp a no-op for the wrong reason.
    const { memDir, specDir } = copyLiveCorpus('syncback-');
    const root = REPO_ROOT;
    const [touched, untouched] = twoFileAnchoredElements(specDir);
    assert.ok(touched && untouched, 'the live corpus must supply two file-anchored elements');

    // Stale the touched element's digest so the re-stamp has something to DO. This
    // used to assert byte-inequality against the unmodified copy, which passed only
    // because `renderRecord` re-framed an already-framed body and appended two blank
    // lines on every write — the element "changed" whether or not it was stamped
    // (landmine `materialize-appends-blank-lines-every-run`, fixed 2026-08-07). With
    // the writer idempotent, re-stamping a current digest is correctly a no-op, so
    // byte-inequality no longer witnesses anything. A moved digest does.
    const STALE = '000000000000';
    writeFileSync(
      elementPath(specDir, touched.id),
      readElement(specDir, touched.id).replace(/^anchor_digest:.*$/m, `anchor_digest: ${STALE}`),
      'utf8',
    );
    const before = { touched: readElement(specDir, touched.id), untouched: readElement(specDir, untouched.id) };
    assert.match(before.touched, new RegExp(`anchor_digest: ${STALE}`), 'sanity: the fixture is staled');

    const result = contribute.syncBack({
      specDir, memDir, rootDir: root, slug: 'central-system-spec', touchedPaths: [touched.anchor],
    });

    assert.ok(Array.isArray(result.applied), 'syncBack must report what it applied');
    assert.ok(result.applied.includes(touched.id),
      `the element anchored to the touched path must be re-stamped; applied: ${JSON.stringify(result.applied)}`);

    const after = readElement(specDir, touched.id);
    assert.notEqual(after, before.touched, 'the touched element must actually change — a no-op sync-back records nothing');
    assert.ok(!after.includes(STALE), 'and the stale digest must be gone, not merely rewritten alongside');

    // The real assertion: everything the landing did not touch is byte-identical.
    assert.equal(readElement(specDir, untouched.id), before.untouched,
      'an untouched element must be byte-identical — re-stamping it would launder its drift');
    assert.ok(!result.applied.includes(untouched.id),
      'an untouched element must not appear in the applied set');
  });

  it('test_when_stampall_called_without_id_list_then_refuses', async () => {
    const { module: digest, reason } = await loadModule('.claude/skills/workspace/digest.mjs');
    const { module: contribute, reason: cReason } = await loadModule('.claude/skills/workspace/contribute.mjs');
    assert.ok(digest, reason);
    assert.ok(contribute, cReason);

    const { root, memDir, specDir } = copyLiveCorpus('syncback-refuse-');

    assert.throws(
      () => digest.stampAll(specDir, undefined, { rootDir: root }),
      /explicit id list/,
      'there must be no stamp-everything default — that is the bulk refresh D3 forbids',
    );

    // Non-derivable changes are PROPOSED, never written: a scanner cannot check a
    // rationale link or a behavioural diagram, so a human ratifies them.
    const [subject] = twoFileAnchoredElements(specDir);
    const before = readElement(specDir, subject.id);
    const result = contribute.syncBack({
      specDir, memDir, rootDir: root, slug: 'central-system-spec',
      touchedPaths: [],
      nonDerivable: [{ kind: 'rationale', element_id: subject.id, detail: 'links to a decision' }],
    });

    assert.ok(Array.isArray(result.proposed), 'syncBack must return proposals for what it cannot verify');
    assert.equal(result.proposed.length, 1, 'the non-derivable change must come back as a proposal');
    assert.equal(readElement(specDir, subject.id), before,
      'a proposal must not be written — that is what makes it a proposal');
  });
});
