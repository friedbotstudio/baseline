// The skills reference page renders one gloss per skill from its SKILL.md
// frontmatter. The gloss reader was anchored with `$` under the `m` flag, so it
// stopped at the first newline: a YAML block scalar (`>` folded, `|` literal)
// yielded its indicator character as the whole description, and the page shipped
// `>` and `|` as the glosses for roadmap-planner and humanizer.
//
// SUT: site-src/_data/roster.cjs → skillDescription / glossOf
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const roster = async () => {
  const mod = require(join(REPO_ROOT, 'site-src/_data/roster.cjs'));
  return typeof mod === 'function' ? mod() : mod;
};

// A gloss shorter than this is a stub: an indicator character, or a bare label
// like "EXPERIMENTAL." that names nothing.
const MIN_GLOSS = 40;

describe('skill glosses — every skill describes itself', () => {
  it('test_when_roster_built_then_no_skill_has_a_stub_gloss', async () => {
    const { skills } = await roster();
    assert.ok(skills.length > 0, 'roster must carry skills');
    const stubs = skills
      .filter((s) => !s.gloss || s.gloss.trim().length < MIN_GLOSS)
      .map((s) => `${s.name} -> ${JSON.stringify(s.gloss)}`);
    assert.deepEqual(stubs, [], `every skill needs a real gloss:\n  ${stubs.join('\n  ')}`);
  });

  it('test_when_description_is_a_yaml_block_scalar_then_the_body_is_read', async () => {
    const skillsDir = join(REPO_ROOT, '.claude/skills');
    // Find the skills that actually use a block scalar, so this test keeps
    // covering the real cases rather than a hardcoded pair that may be rewritten.
    const blockScalar = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => {
        const md = join(skillsDir, e.name, 'SKILL.md');
        if (!existsSync(md)) return false;
        const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(md, 'utf8'));
        return fm ? /^description:[ \t]*[>|][-+]?[ \t]*$/m.test(fm[1]) : false;
      })
      .map((e) => e.name);

    assert.ok(blockScalar.length > 0, 'expected at least one block-scalar description to cover');

    const { skills } = await roster();
    for (const name of blockScalar) {
      const entry = skills.find((s) => s.name === name);
      if (!entry) continue; // user-owned skills are not on the baseline roster
      assert.ok(
        !/^[>|]/.test(entry.gloss.trim()),
        `${name}: gloss is the YAML indicator, not the description (${JSON.stringify(entry.gloss)})`,
      );
      assert.ok(
        entry.gloss.trim().length >= MIN_GLOSS,
        `${name}: block-scalar description did not resolve (${JSON.stringify(entry.gloss)})`,
      );
    }
  });

  it('test_when_first_sentence_is_a_bare_label_then_the_next_one_is_pulled_in', async () => {
    const { skills } = await roster();
    // `companion` opens "EXPERIMENTAL." and `tdd` reduces to "TDD coordinator."
    // once its phase prefix is stripped; both must carry more than the label.
    for (const name of ['companion', 'tdd']) {
      const entry = skills.find((s) => s.name === name);
      if (!entry) continue;
      const words = entry.gloss.trim().split(/\s+/).length;
      assert.ok(words > 4, `${name}: gloss is still a label (${JSON.stringify(entry.gloss)})`);
    }
  });

  it('test_when_page_rendered_then_every_cell_carries_its_gloss', () => {
    const page = join(REPO_ROOT, 'obj/site/skills/index.html');
    if (!existsSync(page)) return; // site not built in this run
    const html = readFileSync(page, 'utf8');
    const cells = [...html.matchAll(
      /<div class="cell-kicker">([a-z0-9-]+)<\/div>\s*<p class="excerpt">([\s\S]*?)<\/p>/g,
    )];
    assert.ok(cells.length > 0, 'skills page must render skill cells');
    const stubs = cells
      .map(([, name, gloss]) => [name, gloss.replace(/&gt;/g, '>').replace(/&lt;/g, '<').trim()])
      .filter(([, gloss]) => gloss.length < MIN_GLOSS)
      .map(([name, gloss]) => `${name} -> ${JSON.stringify(gloss)}`);
    assert.deepEqual(stubs, [], `rendered cells with a stub gloss:\n  ${stubs.join('\n  ')}`);
  });
});
