// T2 — assertWritable blames the wrong cause on malformed input.
//
// resolve.mjs reads `entry?.fields?.scope` and `entry?.fields?.governs`. A flat
// entry — `{key, category, scope, governs}` — has neither under `.fields`, so
// both legs read undefined and the entry is reported UNREACHABLE. The curator
// then edits an entry that was already correct.
//
// Reproduced during triage: a valid flat entry and a genuinely unreachable
// `{fields:{}}` entry emit byte-identical text.
//
// The irony is on the record: cli.mjs's own header states the intent this code
// fails to deliver — "an unreachable entry and a malformed one both fail, and a
// caller that cannot tell them apart fixes the wrong thing".
//
// RED until: assertWritable validates SHAPE before reachability and throws a
// distinct error naming the malformed wrapper.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESOLVE = join(REPO_ROOT, '.claude/skills/memory-index/resolve.mjs');

// A flat entry carrying BOTH legs. Nothing about it is unreachable.
const FLAT_BUT_VALID = {
  key: 'a-real-entry',
  category: 'landmarks',
  scope: ['scout'],
  governs: '.claude/hooks/**',
};

// Well-formed wrapper, both legs genuinely empty. This one IS unreachable.
const WELLFORMED_UNREACHABLE = {
  key: 'genuinely-unreachable',
  category: 'landmarks',
  fields: {},
};

function throwTextFrom(fn, entry) {
  try {
    fn(entry);
    return null;
  } catch (e) {
    return String(e?.message ?? e);
  }
}

describe('AC-005 — a malformed entry is named as malformed', () => {
  it('test_when_an_entry_lacks_the_fields_wrapper_then_assertwritable_names_the_shape_problem', async () => {
    const { assertWritable } = await import(RESOLVE);

    const text = throwTextFrom(assertWritable, FLAT_BUT_VALID);
    assert.notEqual(text, null, 'a malformed entry must still be refused, not silently accepted');
    assert.match(
      text,
      /shape|malformed|fields/i,
      `the message must name the shape problem, got: ${text}`
    );
    assert.doesNotMatch(
      text,
      /reachable by neither leg/i,
      'a malformed entry must NOT be reported as unreachable — that sends the curator to edit a correct entry'
    );
  });
});

describe('AC-006 — a genuinely unreachable entry still reports unreachable', () => {
  it('test_when_an_entry_is_wellformed_but_unreachable_then_the_message_differs_from_the_malformed_one', async () => {
    const { assertWritable } = await import(RESOLVE);

    const unreachableText = throwTextFrom(assertWritable, WELLFORMED_UNREACHABLE);
    assert.notEqual(unreachableText, null, 'an unreachable entry must still be refused');
    assert.match(
      unreachableText,
      /reachable by neither leg/i,
      'the existing unreachable message is preserved'
    );

    // The whole defect in one assertion. Compare the message SHAPE, not the raw
    // strings: the two carry different entry keys, so a naive notEqual passes
    // trivially and stays green even if the fix never lands.
    const shapeOf = (t) => String(t).replace(/"[^"]*"/, '"<key>"');
    const malformedText = throwTextFrom(assertWritable, FLAT_BUT_VALID);
    assert.notEqual(
      shapeOf(malformedText),
      shapeOf(unreachableText),
      'a malformed entry and an unreachable entry must not produce the same diagnostic'
    );
  });

  it('test_when_a_wellformed_reachable_entry_is_checked_then_it_is_accepted', async () => {
    const { assertWritable } = await import(RESOLVE);

    // Regression guard: the shape check must not start refusing valid entries.
    // Reachable by the PATH leg only. An explicit scope is avoided here because
    // assertWritable independently refuses a scope equal to the category default,
    // which would make this assert pass or fail for an unrelated reason.
    const ok = {
      key: 'fine',
      category: 'landmarks',
      fields: { scope: [], governs: '.claude/hooks/**' },
    };
    assert.equal(throwTextFrom(assertWritable, ok), null, 'a reachable well-formed entry stays accepted');
  });
});
