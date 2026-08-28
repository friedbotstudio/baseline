// AC-008 of docs/specs/stale-keying-and-glob-scope.md. Covers §Behavior #4.
//
// `governs:` answered two questions at once — what re-verifies an entry, and where
// that entry surfaces — and the documentation inherited the conflation. Three
// surfaces describe the field, and all three describe it as if it had one job:
//
//   .claude/memory/README.md:115-127  the two-leg reachability table
//   src/seed.template.md:172          the SHIPPED path-governed trigger description
//   site-src/memory.njk:116           "An entry names the paths it governs, and it
//                                      goes stale when one of those paths changes"
//
// A split that updates the code and not these ships a lie, and the shipped ones are
// worse than the dev ones: `obj/template/.claude/memory/README.md` is byte-identical
// to the dev copy (sha256 5e2af4d7…), so a consumer install reads whatever this says.
//
// These assert on the CLAIM, never on the sentence making it. `/document` may reword
// any of this freely; what it may not do is leave a surface that never mentions the
// surfacing field at all.
//
// RED until the split lands and the three surfaces are updated.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const SURFACING_FIELD = 'surfaces-on';

const DOC_SURFACES = [
  '.claude/memory/README.md',
  'src/seed.template.md',
  'site-src/memory.njk',
];

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

describe('surfacing scope — the documentation stops conflating the two roles (AC-008)', () => {
  it('test_when_the_three_doc_surfaces_are_read_then_none_claims_governs_decides_surfacing', () => {
    const silent = DOC_SURFACES.filter((rel) => !read(rel).includes(SURFACING_FIELD));

    assert.deepEqual(
      silent, [],
      `each surface must name \`${SURFACING_FIELD}\`; one that never mentions it still tells the reader `
      + '`governs:` decides who sees an entry, which is what this change makes false',
    );
  });

  it('test_when_the_readme_reachability_section_is_read_then_both_roles_are_named_separately', () => {
    const readme = read('.claude/memory/README.md');

    assert.ok(
      readme.includes('governs') && readme.includes(SURFACING_FIELD),
      'the README is the canonical entry-shape reference; it must carry both field names',
    );

    // The reachability table at :115-127 enumerates the legs that make an entry
    // reachable. `isReachable` gains a third disjunct (spec D4), so a table still
    // showing two legs documents a predicate that no longer exists.
    const reachability = /An entry is \*\*reachable\*\*[\s\S]*?(?=\n## )/.exec(readme);
    assert.ok(reachability, 'the reachability section must still exist — it is what a curator reads');
    assert.ok(
      reachability[0].includes(SURFACING_FIELD),
      'the reachability table must list the surfacing leg; an entry reachable only by it is writable (D4), '
      + 'and a table omitting it sends a curator to give the entry a `governs:` glob it does not need',
    );
  });

  it('test_when_the_shipped_seed_template_is_read_then_the_path_trigger_names_the_surfacing_field', () => {
    // seed.template.md ships to consumer installs. Its hook table is the only place
    // the path-governed trigger is described outside this repo's own docs.
    const seed = read('src/seed.template.md');
    const pathTrigger = seed.split('\n').filter((line) => line.includes('path-governed'));

    assert.ok(pathTrigger.length > 0, 'the path-governed trigger row must still exist in the hook table');
    assert.ok(
      pathTrigger.some((line) => line.includes(SURFACING_FIELD)),
      'the shipped description of what fires the path trigger must name the field that now decides it',
    );
  });
});
