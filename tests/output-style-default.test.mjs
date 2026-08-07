import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Covers AC-001..AC-008 of ship-baseline-output-style.
//
// The Baseline output style ships as an installed default: the style file rides the
// Stage 1 `.claude/` rsync into the payload, and `outputStyle` in the shipped
// settings turns it on without the consumer doing anything. These tests pin both
// halves plus the governance amendment that declares them.
//
// The payload-presence half (a REQUIRED_PATTERNS row) lives in
// tests/template-payload.test.mjs, next to the build it already performs.

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-template.sh');
const STYLE_PATH = '.claude/output-styles/baseline.md';
const CLAUDE_MD_CHAR_CEILING = 38800;

const readRepoText = (rel) => readFile(join(ROOT, rel), 'utf8');
const readRepoJson = async (rel) => JSON.parse(await readRepoText(rel));

function frontmatterOf(markdown) {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()])
  );
}

const modeHeadings = (markdown) => markdown.match(/^##\s+.*\bMode\b.*$/gm) ?? [];

describe('output style — shipped default', () => {
  it('test_when_settings_template_read_then_output_style_is_baseline', async () => {
    const settings = await readRepoJson('src/settings.template.json');
    assert.equal(
      settings.outputStyle,
      'Baseline',
      'src/settings.template.json must set outputStyle so a fresh install speaks in the Baseline voice'
    );
  });

  it('test_when_live_settings_read_then_output_style_is_baseline', async () => {
    const settings = await readRepoJson('.claude/settings.json');
    assert.equal(
      settings.outputStyle,
      'Baseline',
      '.claude/settings.json must match the template — tests/template-drift.test.mjs asserts byte parity'
    );
  });

  it('test_when_settings_local_read_then_output_style_key_absent', async (t) => {
    // settings.local.json is gitignored dev-local state; a clean clone has none.
    if (!existsSync(join(ROOT, '.claude/settings.local.json'))) {
      t.skip('no dev-local settings.local.json in this tree');
      return;
    }
    const local = await readRepoJson('.claude/settings.local.json');
    assert.ok(
      !Object.hasOwn(local, 'outputStyle'),
      'the project default now comes from settings.json; a duplicate key in settings.local.json hides which file wins'
    );
  });

  it('test_when_style_file_read_then_frontmatter_and_two_modes_present', async () => {
    const style = await readRepoText(STYLE_PATH);
    const frontmatter = frontmatterOf(style);
    assert.ok(frontmatter, `${STYLE_PATH} must open with a YAML frontmatter block`);
    for (const key of ['name', 'description', 'keep-coding-instructions']) {
      assert.ok(Object.hasOwn(frontmatter, key), `frontmatter must declare ${key}`);
    }
    assert.equal(frontmatter.name, 'Baseline', 'the frontmatter name is what outputStyle resolves against');
    assert.equal(
      modeHeadings(style).length,
      2,
      'the shipped style carries exactly two modes (Engineer, Analyst)'
    );
    assert.ok(!/quirky/i.test(style), 'Quirky Mode is deliberately excluded from the shipped style');
    assert.ok(/^##\s+Scope\s*$/m.test(style), 'the Scope section keeps STE out of code and skill-owned files');
  });

  it('test_when_seed_read_then_tree_entry_and_section_4_9_present', async () => {
    // seed.md is deliberately NOT a byte-mirror of its template (the template keeps
    // the §16 reservation), so each file is asserted on its own content.
    for (const rel of ['docs/init/seed.md', 'src/seed.template.md']) {
      const seed = await readRepoText(rel);
      assert.ok(
        /output-styles\//.test(seed),
        `${rel} §3 directory tree must list output-styles/`
      );
      assert.ok(
        /###\s+§4\.9\s+Output styles \(1\)/.test(seed),
        `${rel} must declare the output style as a component in §4.9`
      );
    }
  });

  it('test_when_claude_md_read_then_orientation_names_style_and_stays_under_ceiling', async () => {
    const claudeMd = await readRepoText('CLAUDE.md');
    const orientation = /^Quick orientation:.*$/m.exec(claudeMd);
    assert.ok(orientation, 'CLAUDE.md must carry the quick-orientation line');
    assert.ok(
      /output style/.test(orientation[0]),
      'the quick-orientation line must name the output style so a session knows one is installed'
    );
    assert.ok(
      claudeMd.length <= CLAUDE_MD_CHAR_CEILING,
      `CLAUDE.md is ${claudeMd.length} chars, over the ${CLAUDE_MD_CHAR_CEILING} ceiling — trim prose, never raise the ceiling`
    );
  });

  it('test_when_merge_lists_read_then_settings_json_uses_the_default_path', async () => {
    const { NEVER_TOUCH, SPECIAL_MERGE } = await import('../src/cli/install.js');
    const settingsRel = '.claude/settings.json';
    assert.ok(
      !NEVER_TOUCH.includes(settingsRel),
      'settings.json must stay upgradeable, so it cannot be NEVER_TOUCH'
    );
    assert.ok(
      !SPECIAL_MERGE.includes(settingsRel),
      'settings.json wires all 26 hooks; an edited consumer copy is staged for /upgrade-project, never auto-merged'
    );
  });
});

describe('output style — built payload', () => {
  let templateDir;
  let isolatedRoot;

  before(async () => {
    // Build into an isolated copy so this never races the real obj/template with
    // the other build-driven suites.
    isolatedRoot = await mkdtemp(join(tmpdir(), 'output-style-'));
    for (const entry of ['.claude', 'src', 'scripts', 'docs', '.githooks', '.github']) {
      const from = join(ROOT, entry);
      if (existsSync(from)) await cp(from, join(isolatedRoot, entry), { recursive: true });
    }
    for (const entry of ['.mcp.json', 'CLAUDE.md', 'README.md']) {
      const from = join(ROOT, entry);
      if (existsSync(from)) await cp(from, join(isolatedRoot, entry));
    }
    execFileSync('bash', [BUILD_SCRIPT], {
      cwd: isolatedRoot,
      env: { ...process.env, PKG_ROOT: isolatedRoot },
      stdio: 'pipe',
    });
    templateDir = join(isolatedRoot, 'obj', 'template');
  });

  after(async () => {
    if (isolatedRoot) await rm(isolatedRoot, { recursive: true, force: true });
  });

  it('test_when_built_template_read_then_settings_and_manifest_carry_the_style', async () => {
    assert.ok(existsSync(join(templateDir, STYLE_PATH)), `the build must ship ${STYLE_PATH}`);

    const shipped = JSON.parse(await readFile(join(templateDir, '.claude/settings.json'), 'utf8'));
    assert.equal(shipped.outputStyle, 'Baseline', 'the shipped settings must enable the style by default');

    const manifest = JSON.parse(await readFile(join(templateDir, '.claude/manifest.json'), 'utf8'));
    const entry = manifest.files?.[STYLE_PATH];
    assert.ok(entry, `${STYLE_PATH} must be hashed into the shipped manifest so drift is detectable`);
    assert.match(
      typeof entry === 'string' ? entry : entry.sha256 ?? '',
      /^[0-9a-f]{64}$/,
      'the manifest entry must carry a sha256'
    );
  });
});
