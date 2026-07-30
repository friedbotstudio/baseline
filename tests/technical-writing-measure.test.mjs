// technical-writing measurement engine.
// SUT: .claude/skills/technical-writing/measure.mjs + corpus-bands.json
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  sentences, openingMove, classifyHeading, parseSource, measure, evaluate, loadBands,
} from '../.claude/skills/technical-writing/measure.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/technical-writing/measure.mjs');
const FIX = path.join(ROOT, 'tests/fixtures/technical-writing');

const run = (args) => {
  try {
    return { code: 0, out: execFileSync('node', [SUT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
};

// ── primitives ──────────────────────────────────────────────────────────────

describe('sentence splitting', () => {
  it('splits on terminal punctuation', () => {
    assert.equal(sentences('The guard runs. It exits zero. The call proceeds.').length, 3);
  });

  it('does not split on abbreviations, initials, decimals or versions', () => {
    assert.equal(sentences('Use a runner, e.g. the test runner, before you commit.').length, 1);
    assert.equal(sentences('Node 18.2 is required for the parser to work correctly.').length, 1);
    assert.equal(sentences('See W. Hipp on the design of the storage engine here.').length, 1);
  });

  it('drops fragments with no alphabetic content', () => {
    assert.equal(sentences('42. 7.').length, 0);
  });
});

describe('paragraph opening moves', () => {
  const cases = [
    ['If the branch is protected, the commit needs consent.', 'condition'],
    ['When a wave is active, the boundary guard applies.', 'condition'],
    ['To run a workflow, invoke the harness.', 'purpose'],
    ['A guard is a Node script invoked at a tool boundary.', 'definition'],
    ['The roster is derived from settings.json at build time.', 'definition'],
    ['By default, the runner is in guide mode.', 'aside'],
    ['You can override the target with a flag.', 'address-reader'],
    ['We chose worktrees because they isolate the filesystem.', 'authorial'],
    ['However, the advisory guard never blocks.', 'contrast'],
    ['Install the overlay into an existing repository.', 'directive'],
    ['There are three outcomes for any guard.', 'existential'],
    ['Guards resolve to exactly one outcome per call.', 'assertion'],
  ];
  for (const [text, expected] of cases) {
    it(`classifies "${text.slice(0, 38)}…" as ${expected}`, () => {
      assert.equal(openingMove(text), expected);
    });
  }
});

describe('heading grammar', () => {
  const cases = [
    ['Merge semantics', 'noun-phrase'],
    ['Exit codes', 'noun-phrase'],
    ['Writing your first view', 'gerund'],
    ['Configure your stack', 'imperative'],
    ['What is ownership?', 'question'],
    ['How do I deploy this', 'question'],
    ['Consent cannot be forged', 'sentence'],
  ];
  for (const [text, expected] of cases) {
    it(`classifies "${text}" as ${expected}`, () => assert.equal(classifyHeading(text), expected));
  }
});

// ── parsing ─────────────────────────────────────────────────────────────────

describe('source parsing', () => {
  it('keeps code out of prose and counts it separately', () => {
    const html = '<p>The call proceeds when the guard allows it here.</p>'
      + '<pre>const x = 1;\nconst y = 2;</pre>'
      + '<p>Otherwise the reason is returned to the model instead.</p>';
    const p = parseSource(html, '.html');
    assert.equal(p.paragraphs.length, 2);
    assert.equal(p.code.length, 1);
    assert.ok(!p.paragraphs.join(' ').includes('const x'));
  });

  it('collapses an inline identifier to a single token', () => {
    const p = parseSource('<p>Set <code>subprocess.Popen</code> before the runner starts here.</p>', '.html');
    assert.equal(p.inlineCode, 1);
    assert.ok(p.paragraphs[0].includes('CODETOKEN'));
    assert.ok(!p.paragraphs[0].includes('Popen'));
  });

  it('strips navigation, scripts and styles', () => {
    const html = '<nav><p>Skip to the main content of this documentation page.</p></nav>'
      + '<script>var a = "The quick brown fox jumps over the lazy dog again";</script>'
      + '<p>The guard exits non-zero and the call is stopped immediately.</p>';
    assert.equal(parseSource(html, '.html').paragraphs.length, 1);
  });

  it('parses markdown headings, lists and fenced code', () => {
    const md = '## Outcomes\n\nEach guard resolves to one outcome per call it sees.\n\n'
      + '- block, the call never runs\n- allow, the call proceeds\n\n'
      + '```js\nconst a = 1;\n```\n';
    const p = parseSource(md, '.md');
    assert.equal(p.headings.length, 1);
    assert.equal(p.headings[0].text, 'Outcomes');
    assert.equal(p.code.length, 1);
    assert.ok(p.items >= 2);
  });

  it('ignores markdown front matter', () => {
    const md = '---\ntitle: A page title that is long enough to look like prose here\n---\n\n'
      + 'The guard exits non-zero and the pending call is stopped immediately.\n';
    assert.equal(parseSource(md, '.md').paragraphs.length, 1);
  });
});

// ── metrics ─────────────────────────────────────────────────────────────────

describe('metrics', () => {
  const build = (paras) => measure(parseSource(paras.map((p) => `<p>${p}</p>`).join(''), '.html'));

  it('refuses to score a sample too small to be meaningful', () => {
    assert.throws(() => build(['The guard runs before the call proceeds onward.']), /too little to measure/);
  });

  it('reports uniform sentence length as a near-zero adjacent step', () => {
    const same = Array.from({ length: 40 }, () => 'The guard blocks the call now.').join(' ');
    const m = build([same, same, same]);
    assert.ok(m.adjacentDelta < 1, `expected flat rhythm, got ${m.adjacentDelta}`);
  });

  it('counts modal verbs against the prose total', () => {
    const m = build([
      'The guard may block the call and it must report a reason to the caller.'.repeat(1),
      'A worker can retry the step, though it should stop after three attempts have failed.',
      Array.from({ length: 30 }, () => 'plain filler words here').join(' '),
    ]);
    assert.ok(m.modalsPer1k > 0);
    assert.equal(typeof m.counts.negationDefPer1k, 'number');
  });

  it('scores the assertion share of paragraph openings', () => {
    const m = build(Array.from({ length: 12 }, (_, i) =>
      `Guards resolve to exactly one outcome per call number ${i} in the roster today.`));
    assert.equal(m.openAssertionPct, 100);
    assert.equal(m.openConditionPct, 0);
  });
});

// ── evaluation ──────────────────────────────────────────────────────────────

describe('evaluation', () => {
  const bands = loadBands();

  it('ships a calibrated threshold', () => {
    assert.equal(typeof bands.threshold, 'number');
    assert.ok(bands.threshold > 0 && bands.threshold < 20);
  });

  it('gives every band a corpus value and a weight', () => {
    const specs = [bands.shared, ...Object.values(bands.byType)];
    for (const group of specs) {
      for (const [key, spec] of Object.entries(group)) {
        assert.ok(Number.isFinite(spec.corpus), `${key} has no corpus value`);
        assert.ok(Number.isFinite(spec.weight), `${key} has no weight`);
        assert.ok(Number.isFinite(spec.min) || Number.isFinite(spec.max), `${key} has no bound`);
      }
    }
  });

  it('names only axes the engine actually produces', () => {
    const m = measure(parseSource(fs.readFileSync(path.join(FIX, 'good-reference.md'), 'utf8'), '.md'));
    const known = new Set(Object.keys(m));
    for (const group of [bands.shared, ...Object.values(bands.byType)]) {
      for (const key of Object.keys(group)) assert.ok(known.has(key), `band "${key}" is not measured`);
    }
  });

  it('rejects an unknown page type', () => {
    const m = measure(parseSource(fs.readFileSync(path.join(FIX, 'good-reference.md'), 'utf8'), '.md'));
    assert.throws(() => evaluate(m, 'marketing'), /unknown type/);
  });

  it('suppresses a ceiling breach that rests on too few occurrences', () => {
    const spec = bands.shared.negationDefPer1k;
    assert.ok(Number.isFinite(spec.minCount), 'negation ceiling needs a minimum count');
    const m = measure(parseSource(fs.readFileSync(path.join(FIX, 'good-reference.md'), 'utf8'), '.md'));
    const fired = evaluate(m, 'reference').findings.some((f) => f.key === 'negationDefPer1k');
    if (m.counts.negationDefPer1k < spec.minCount) {
      assert.equal(fired, false, 'a sub-threshold count must not raise a finding');
    }
  });
});

// ── behaviour: does the gate separate real prose from generated prose ───────

describe('separation', () => {
  it('passes prose written to the corpus profile', () => {
    const r = run(['--type', 'reference', path.join(FIX, 'good-reference.md')]);
    assert.equal(r.code, 0, `expected PASS:\n${r.out}`);
  });

  it('fails uniform assertive prose', () => {
    const r = run(['--type', 'reference', path.join(FIX, 'slop-reference.md')]);
    assert.equal(r.code, 1);
  });

  it('separates the two fixtures by a wide margin', () => {
    const score = (f) => {
      const r = run(['--type', 'reference', '--json', path.join(FIX, f)]);
      return JSON.parse(r.out).score;
    };
    const good = score('good-reference.md');
    const slop = score('slop-reference.md');
    assert.ok(good <= loadBands().threshold, `good fixture scored ${good}`);
    assert.ok(slop > good * 5 + 5, `expected a wide gap, got good=${good} slop=${slop}`);
  });

  it('diagnoses the failure modes that define generated prose', () => {
    const r = run(['--type', 'reference', '--json', path.join(FIX, 'slop-reference.md')]);
    const keys = JSON.parse(r.out).findings.map((f) => f.key);
    for (const expected of ['sentMean', 'adjacentDelta', 'modalsPer1k', 'openConditionPct']) {
      assert.ok(keys.includes(expected), `expected ${expected} among findings, got ${keys.join(', ')}`);
    }
  });

  it('explains each finding it reports', () => {
    const r = run(['--type', 'reference', '--json', path.join(FIX, 'slop-reference.md')]);
    for (const f of JSON.parse(r.out).findings) {
      assert.equal(typeof f.why, 'string', `${f.key} has no explanation`);
      assert.ok(f.why.length > 20, `${f.key} explanation is too thin`);
      assert.ok(['LOW', 'HIGH'].includes(f.dir));
    }
  });

  it('ranks findings by their contribution to the score', () => {
    const r = run(['--type', 'reference', '--json', path.join(FIX, 'slop-reference.md')]);
    const c = JSON.parse(r.out).findings.map((f) => f.contribution);
    assert.deepEqual(c, [...c].sort((a, b) => b - a));
  });
});

// ── CLI contract ────────────────────────────────────────────────────────────

describe('CLI', () => {
  it('exits 2 without a type', () => {
    assert.equal(run([path.join(FIX, 'good-reference.md')]).code, 2);
  });

  it('exits 2 on an unknown type', () => {
    assert.equal(run(['--type', 'blog', path.join(FIX, 'good-reference.md')]).code, 2);
  });

  it('exits 2 on a missing file', () => {
    const r = run(['--type', 'reference', path.join(FIX, 'does-not-exist.md')]);
    assert.equal(r.code, 2);
    assert.match(r.err, /cannot read/);
  });

  it('exits 2 when more than one file is given', () => {
    const f = path.join(FIX, 'good-reference.md');
    assert.equal(run(['--type', 'reference', f, f]).code, 2);
  });

  it('emits parseable JSON carrying metrics, score and findings', () => {
    const r = run(['--type', 'reference', '--json', path.join(FIX, 'slop-reference.md')]);
    const j = JSON.parse(r.out);
    assert.equal(j.type, 'reference');
    assert.equal(j.pass, false);
    assert.ok(Number.isFinite(j.score));
    assert.ok(Number.isFinite(j.metrics.sentMean));
    assert.ok(Array.isArray(j.findings));
  });

  it('accepts --type= in joined form', () => {
    assert.equal(run(['--type=reference', path.join(FIX, 'good-reference.md')]).code, 0);
  });
});
