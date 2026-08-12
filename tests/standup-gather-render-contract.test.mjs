// Ticket consumer-install-defects — D3 (AC-004).
//
// The two standup halves were each unit-tested and both passed while the seam
// between them was broken: gather.mjs:189 emits `num`, render.mjs:73 read
// `epic.number`, and every recap line printed "Epic undefined". Neither existing
// test crossed the seam — standup-render.test.mjs hand-built fixtures with a
// `number` key and emoji statuses that collectRoadmap never produces. These
// tests pipe the real gather output into the real renderer so the join itself is
// under test, not two compatible-looking fixtures.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';

const GATHER = '.claude/skills/standup/gather.mjs';
const RENDER = '.claude/skills/standup/render.mjs';
const ROADMAP_REL = 'docs/roadmap-execution-plan.md';

function writeRoadmap(root, lines) {
  const path = join(root, ROADMAP_REL);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

async function loadSeam() {
  const gather = await tryImport(GATHER);
  const render = await tryImport(RENDER);
  assert.ok(gather, `${GATHER} must be importable`);
  assert.ok(render, `${RENDER} must be importable`);
  assert.equal(typeof gather.gatherSync, 'function', 'expected named export `gatherSync`');
  assert.equal(typeof render.renderRecap, 'function', 'expected named export `renderRecap`');
  return { gatherSync: gather.gatherSync, renderRecap: render.renderRecap };
}

function recapText({ gatherSync, renderRecap }, root) {
  return renderRecap(gatherSync({ rootDir: root })).join('\n');
}

describe('D3 — the gather-to-render seam (AC-004)', () => {
  it('test_when_gather_output_is_rendered_then_every_epic_line_carries_its_number', async () => {
    const seam = await loadSeam();
    const { root } = makeProject();
    writeRoadmap(root, [
      '## Epic 1 — Foundations ✅ (found)',
      '',
      '- ✅ T1. First done.',
      '- ✅ T2. Second done.',
      '',
      '## Epic 2 — Enforcement 🟡 (enforce)',
      '',
      '- ✅ T3. Third done.',
      '- ⬜ T4. Fourth planned.',
      '',
      '## Epic 3 — Velocity ⬜ (velocity)',
      '',
      '- ⬜ T5. Fifth planned.',
      '',
    ]);

    const text = recapText(seam, root);

    assert.doesNotMatch(
      text,
      /undefined/,
      'the recap must contain no "undefined" — the seam defect printed "Epic undefined" for every row',
    );
    for (const [num, title] of [[1, 'Foundations'], [2, 'Enforcement'], [3, 'Velocity']]) {
      assert.match(
        text,
        new RegExp(`Epic ${num}\\b[^\\n]*${title}`),
        `epic ${num} ("${title}") must render with its number on the same line as its title`,
      );
    }
  });

  it('test_when_epic_number_is_zero_then_the_line_renders_epic_zero', async () => {
    const seam = await loadSeam();
    const { root } = makeProject();
    writeRoadmap(root, [
      '## Epic 0 — Zeroth ✅ (zero)',
      '',
      '- ✅ T1. Done.',
      '',
    ]);

    const text = recapText(seam, root);

    assert.match(text, /Epic 0\b/, 'epic 0 must render as "Epic 0" — zero is a number, not absence');
    assert.doesNotMatch(
      text,
      /Epic \?/,
      'a falsy check on the epic number would collapse 0 to the unknown marker; the reader must test for absence, not for truthiness',
    );
  });

  it('test_when_render_receives_gather_status_words_then_it_prints_them_verbatim', async () => {
    const seam = await loadSeam();
    const { root } = makeProject();
    writeRoadmap(root, [
      '## Epic 1 — Landed ✅ (landed)',
      '',
      '- ✅ T1. Done.',
      '',
      '## Epic 2 — Ongoing 🟡 (ongoing)',
      '',
      '- 🟡 T2. In flight.',
      '',
    ]);

    const text = recapText(seam, root);

    assert.match(text, /done Epic 1\b/, 'gather emits the word "done"; the renderer prints that word');
    assert.match(
      text,
      /in-progress Epic 2\b/,
      'gather hyphenates the in-progress state; the emoji fixture in standup-render.test.mjs hid this half of the seam',
    );
  });
});
