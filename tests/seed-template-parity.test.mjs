// seed-template-md-pre-redesign-drift-a1f3 — src/seed.template.md is the
// pristine ship-time copy overlaid onto docs/init/seed.md at install. Like the
// CLAUDE.md <-> src/CLAUDE.template.md byte-mirror (Article XI), the seed
// template must stay in lockstep with the live genesis — with ONE deliberate
// carve-out: §16 ("Project-specific configuration").
//
// §16 is project-specific by construction. The TEMPLATE ships a `*Reserved.*`
// placeholder ("Until /init-project runs, this section stays empty"); the LIVE
// seed.md carries THIS self-hosted repo's filled-in /init-project output
// (detected stack, recommender JSON, deviations — all stamped to a specific
// run). A freshly-installed project must receive the reserved placeholder, NOT
// this repo's detected stack. So the two files are byte-identical everywhere
// EXCEPT §16, and a full-byte mirror test would be the wrong contract.
//
// This test therefore asserts:
//   1. The pre-§16 body (§0..§15 — the constitutional / governance / harness
//      content every project shares) is byte-identical between the two files.
//   2. The §17+ tail (skill provenance) is byte-identical.
//   3. The template's §16 is the reserved placeholder, NOT a filled-in run.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const SEC16 = '\n## §16 — Project-specific configuration';
const SEC17 = '\n## §17';

function sliceBefore(text, marker) {
  const i = text.indexOf(marker);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(marker)} in the document`);
  return text.slice(0, i);
}
function sliceFrom(text, marker) {
  const i = text.indexOf(marker);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(marker)} in the document`);
  return text.slice(i);
}

describe('src/seed.template.md mirrors docs/init/seed.md except the §16 carve-out', () => {
  const live = read('docs/init/seed.md');
  const tpl = read('src/seed.template.md');

  it('test_when_pre_section16_body_compared_then_byte_identical', () => {
    const liveHead = sliceBefore(live, SEC16);
    const tplHead = sliceBefore(tpl, SEC16);
    if (liveHead !== tplHead) {
      const a = liveHead.split('\n');
      const b = tplHead.split('\n');
      let firstDiff = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { firstDiff = i + 1; break; }
      }
      assert.fail(
        `src/seed.template.md drifted from docs/init/seed.md in the pre-§16 body ` +
        `(first diff at line ${firstDiff}; live ${a.length} lines, template ${b.length} lines). ` +
        `Sync the template head to the live genesis.`,
      );
    }
    assert.equal(tplHead, liveHead);
  });

  it('test_when_section17_onward_compared_then_byte_identical', () => {
    assert.equal(sliceFrom(tpl, SEC17), sliceFrom(live, SEC17));
  });

  it('test_when_template_section16_then_reserved_placeholder_not_filled_run', () => {
    const tpl16 = sliceFrom(tpl, SEC16).split(SEC17)[0];
    assert.match(tpl16, /\*Reserved\.\*/, 'template §16 must remain the reserved placeholder');
    assert.doesNotMatch(
      tpl16, /^Generated:/m,
      'template §16 must NOT carry a filled-in /init-project run stamp (that is repo-specific and belongs only in the live seed.md)',
    );
  });
});
