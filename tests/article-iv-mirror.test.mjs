// Workflow-extension-via-workflows-json — Article IV four-way mirror
//
// Per Article I.4 precedence: seed.md §17 + CLAUDE.md Article IV MUST mirror
// byte-equal across docs/ <-> src/*.template.* pairs. The amended Article IV
// (post-§17 landing) must satisfy this; failure to mirror is a constitutional
// drift the audit catches. Tests here read the live repo files (REPO_ROOT)
// rather than a tmp build — the assertion is on the dev-repo state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// Foundation: extract the body of a top-level section bounded by `## <heading>`
// to the next `## ` heading (or EOF). Returns the section body verbatim.
function extractTopLevelSection(text, headingRegex) {
  const startMatch = text.match(headingRegex);
  if (!startMatch) {
    throw new Error(`section heading not found: ${headingRegex}`);
  }
  const startIdx = startMatch.index;
  const rest = text.slice(startIdx + startMatch[0].length);
  const endMatch = rest.match(/^## /m);
  const body = endMatch ? rest.slice(0, endMatch.index) : rest;
  return startMatch[0] + body;
}

describe('Article IV / §17 four-way mirror (SP-007 / AC-015)', () => {
  it('test_when_clean_build_then_seed_md_section_17_byte_equal_to_src_seed_template_md_section_17', async () => {
    const seedLive = await fs.readFile(path.join(REPO_ROOT, 'docs/init/seed.md'), 'utf8');
    const seedTmpl = await fs.readFile(path.join(REPO_ROOT, 'src/seed.template.md'), 'utf8');
    const liveBody = extractTopLevelSection(seedLive, /^## §17[^\n]*\n/m);
    const tmplBody = extractTopLevelSection(seedTmpl, /^## §17[^\n]*\n/m);
    assert.equal(
      liveBody,
      tmplBody,
      'docs/init/seed.md §17 and src/seed.template.md §17 must be byte-equal mirrors'
    );
  });

  it('test_when_clean_build_then_claude_md_article_iv_byte_equal_to_src_claude_template_md_article_iv', async () => {
    const claudeLive = await fs.readFile(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const claudeTmpl = await fs.readFile(path.join(REPO_ROOT, 'src/CLAUDE.template.md'), 'utf8');
    const liveBody = extractTopLevelSection(claudeLive, /^## Article IV[^\n]*\n/m);
    const tmplBody = extractTopLevelSection(claudeTmpl, /^## Article IV[^\n]*\n/m);
    assert.equal(
      liveBody,
      tmplBody,
      'CLAUDE.md Article IV and src/CLAUDE.template.md Article IV must be byte-equal mirrors'
    );
  });
});
