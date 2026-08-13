// Ticket diagram-shard-rewrite-loses-fields — D1 (AC-001..AC-004, AC-007).
//
// writeDiagramShard renders a C4 Component line from {label, technology,
// description}. Its callers under-supply — delta.mjs:256 passes only {kind,
// rootDir} — so a rewrite collapsed the line to three arguments and destroyed the
// element's anchor, its techn value and its title. 17 shards in the corpus carry
// that damage. D1 puts preservation in the WRITER rather than in each caller: an
// omitted field keeps whatever the shard on disk already had, so a caller can only
// ever add information.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const SHARDS = '.claude/skills/workspace/shards.mjs';
const LIVE_DIAGRAMS = join(REPO_ROOT, 'docs', 'system', 'diagrams');

const RICH = [
  '!startsub audit_baseline_checks',
  "' @kind c4_component",
  'Component(audit_baseline_checks, ".claude/skills/audit-baseline/checks/*.mjs", "subsystem", "Per-surface baseline audit checks")',
  '!endsub',
  '',
].join('\n');

// THREE_ARG is the damage this ticket exists to end: id as label, kind as techn,
// no description. AC-007 asserts the live corpus contains none of it.
const THREE_ARG_RE = /Component\([a-z_]+,\s*"[a-z0-9-]+",\s*"c4_[a-z_]+"\)/;

// The fixture MUST enable architecture_map. shards.mjs:104 returns
// {path:null,written:false} when the flag is off, so a corpus without it makes
// every call a silent no-op and every assertion below pass vacuously. The
// written===true assertion in the first test is the tripwire for that.
function seededCorpus(shardText = RICH, elementId = 'audit-baseline-checks') {
  const root = mkdtempSync(join(tmpdir(), 'shardpres-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(
    join(root, '.claude', 'project.json'),
    JSON.stringify({ memory: { architecture_map: { enabled: true } } }),
    'utf8',
  );
  const specDir = join(root, 'docs', 'system');
  if (shardText !== null) {
    mkdirSync(join(specDir, 'diagrams'), { recursive: true });
    writeFileSync(join(specDir, 'diagrams', `${elementId}.puml`), shardText, 'utf8');
  }
  return { root, specDir, shardPath: join(specDir, 'diagrams', `${elementId}.puml`) };
}

async function loadWriter() {
  const mod = await tryImport(SHARDS);
  assert.ok(mod, `${SHARDS} must be importable`);
  assert.equal(typeof mod.writeDiagramShard, 'function', 'expected named export `writeDiagramShard`');
  return mod.writeDiagramShard;
}

describe('D1 — a rewrite preserves what the caller does not supply (AC-001..AC-004)', () => {
  it('test_when_a_rewrite_omits_fields_then_the_existing_values_survive', async () => {
    const writeDiagramShard = await loadWriter();
    const { root, specDir, shardPath } = seededCorpus();

    const result = writeDiagramShard(specDir, 'audit-baseline-checks', { kind: 'c4_component', rootDir: root });

    // `path`, not `written`: a complete shard rewritten with no new information
    // legitimately writes nothing, so `written` cannot tell a healthy no-op from a
    // fixture that forgot architecture_map. The flag-off path returns path:null,
    // so path is the signal that separates them.
    assert.notEqual(result.path, null, 'the fixture must resolve a shard path — a null here means architecture_map is off and every other assertion in this file is vacuous');
    const text = readFileSync(shardPath, 'utf8');
    assert.match(text, /"\.claude\/skills\/audit-baseline\/checks\/\*\.mjs"/, 'the anchor label must survive a rewrite that did not supply one');
    assert.match(text, /"subsystem"/, 'the techn value must survive — it exists nowhere else on disk, so losing it here loses it permanently');
    assert.match(text, /"Per-surface baseline audit checks"/, 'the description must survive');
  });

  it('test_when_a_caller_supplies_a_field_then_it_overrides_the_existing_value', async () => {
    const writeDiagramShard = await loadWriter();
    const { root, specDir, shardPath } = seededCorpus();

    writeDiagramShard(specDir, 'audit-baseline-checks', {
      kind: 'c4_component',
      description: 'A deliberately new title',
      rootDir: root,
    });

    const text = readFileSync(shardPath, 'utf8');
    assert.match(text, /"A deliberately new title"/, 'an explicit caller value wins over the existing one');
    assert.doesNotMatch(text, /"Per-surface baseline audit checks"/, 'the superseded description must be gone, not appended');
    assert.match(text, /"subsystem"/, 'the fields the caller still omitted are still preserved');
  });

  it('test_when_the_merged_shard_equals_the_existing_bytes_then_nothing_is_written', async () => {
    const writeDiagramShard = await loadWriter();
    const { root, specDir, shardPath } = seededCorpus();
    const before = statSync(shardPath).mtimeMs;

    const result = writeDiagramShard(specDir, 'audit-baseline-checks', { kind: 'c4_component', rootDir: root });

    assert.equal(result.written, false, 'a rewrite that changes nothing must report written:false — the return shape already carries that flag for the flag-disabled path');
    assert.equal(statSync(shardPath).mtimeMs, before, 'the file must not be rewritten with identical bytes');
  });

  it('test_when_no_shard_exists_then_label_and_technology_take_their_defaults', async () => {
    const writeDiagramShard = await loadWriter();
    const { root, specDir } = seededCorpus(null);

    writeDiagramShard(specDir, 'brand-new-element', { kind: 'c4_component', rootDir: root });

    const text = readFileSync(join(specDir, 'diagrams', 'brand-new-element.puml'), 'utf8');
    assert.equal(
      text,
      ['!startsub brand_new_element', "' @kind c4_component", 'Component(brand_new_element, "brand-new-element", "c4_component")', '!endsub', ''].join('\n'),
      'creating a shard with nothing to preserve keeps todays defaults byte-for-byte (D3) — label falls back to the id, techn to the kind, description omitted',
    );
  });

  it('test_when_the_existing_shard_is_unparseable_then_the_write_still_proceeds', async () => {
    const writeDiagramShard = await loadWriter();
    const broken = ['!startsub audit_baseline_checks', "' @kind c4_component", 'Component(this is not a valid macro line', '!endsub', ''].join('\n');
    const { root, specDir, shardPath } = seededCorpus(broken);

    const result = writeDiagramShard(specDir, 'audit-baseline-checks', { kind: 'c4_component', rootDir: root });

    assert.equal(result.written, true, 'preservation is best-effort — a shard nobody can parse must not wedge a legitimate write');
    assert.match(readFileSync(shardPath, 'utf8'), /Component\(audit_baseline_checks, "audit-baseline-checks", "c4_component"\)/, 'with nothing recoverable, the write falls back to the defaults');
  });

  it('test_when_a_preserved_field_contains_a_double_quote_then_the_write_is_rejected', async () => {
    const writeDiagramShard = await loadWriter();
    const quoted = [
      '!startsub audit_baseline_checks',
      "' @kind c4_component",
      'Component(audit_baseline_checks, ".claude/x/*.mjs", "subsystem", "a title with a " quote inside")',
      '!endsub',
      '',
    ].join('\n');
    const { root, specDir } = seededCorpus(quoted);

    assert.throws(
      () => writeDiagramShard(specDir, 'audit-baseline-checks', { kind: 'c4_component', rootDir: root }),
      /REJECT, never normalize/,
      'quotedArgument rejects a double quote because it escapes the C4 argument. Preservation is a NEW path into componentLine and must not become a hole in that guard',
    );
  });
});

// Security review 2026-08-12. renderComponentLine became a public export when the
// guards moved into it, so the section — the one argument that is interpolated raw
// rather than quoted — needs its check at the sink, not at each call site.
describe('the section is guarded at the sink, because the export is public', () => {
  it('test_when_the_section_is_not_a_bare_identifier_then_the_line_is_rejected', async () => {
    const mod = await tryImport(SHARDS);
    assert.equal(typeof mod?.renderComponentLine, 'function', 'expected named export `renderComponentLine`');

    assert.throws(
      () => mod.renderComponentLine('x") junk(', { label: 'a', technology: 'b', description: null }),
      /REJECT, never normalize/,
      'quotes and parens in the section escape the C4 macro exactly as they do in a quoted argument',
    );
    assert.equal(
      mod.renderComponentLine('audit_baseline_checks', { label: 'a', technology: 'b', description: null }),
      'Component(audit_baseline_checks, "a", "b")',
      'a legitimate section still renders unchanged',
    );
  });
});

describe('D2 — the corpus carries no degraded shard (AC-007)', () => {
  it('test_when_the_corpus_is_scanned_then_no_shard_carries_the_three_argument_form', () => {
    const degraded = readdirSync(LIVE_DIAGRAMS)
      .filter((name) => name.endsWith('.puml'))
      .filter((name) => THREE_ARG_RE.test(readFileSync(join(LIVE_DIAGRAMS, name), 'utf8')));

    assert.deepEqual(
      degraded,
      [],
      `${degraded.length} shard(s) still carry the three-argument form: ${degraded.join(', ')}. This is the standing guard — it fails if any future rewrite degrades a shard again, including this workflow's own /archive`,
    );
  });
});
