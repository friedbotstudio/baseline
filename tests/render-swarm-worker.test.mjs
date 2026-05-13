import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const RENDERER = join(ROOT, 'scripts', 'render-swarm-worker.mjs');

const VALID_TEMPLATE = `---
name: {{NAME}}
description: {{DESCRIPTION}}
tools: Read, Write, Edit
model: sonnet
skills:
{{SKILLS}}
---

{{ROLE_LINE}}

body content here
`;

function run(args, opts = {}) {
  return spawnSync(process.execPath, [RENDERER, ...args], { encoding: 'utf8', ...opts });
}

describe('render-swarm-worker', () => {
  it('renders all four tokens with baseline defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'render-sw-'));
    const tplPath = join(dir, 'template.md');
    const outPath = join(dir, 'out.md');
    await writeFile(tplPath, VALID_TEMPLATE);

    const result = run([tplPath, outPath]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const out = await readFile(outPath, 'utf8');
    assert.ok(!out.includes('{{NAME}}'),        'NAME token still present');
    assert.ok(!out.includes('{{DESCRIPTION}}'), 'DESCRIPTION token still present');
    assert.ok(!out.includes('{{SKILLS}}'),      'SKILLS token still present');
    assert.ok(!out.includes('{{ROLE_LINE}}'),   'ROLE_LINE token still present');

    assert.match(out, /^name: swarm-worker$/m);
    assert.match(out, /Execute a single swarm task/);
    assert.match(out, /^  - scenario$/m);
    assert.match(out, /^  - implement$/m);
    assert.match(out, /You are a swarm worker\./);
  });

  it('preserves frontmatter shape (no leading/trailing junk added)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'render-sw-'));
    const tplPath = join(dir, 'template.md');
    const outPath = join(dir, 'out.md');
    await writeFile(tplPath, VALID_TEMPLATE);
    run([tplPath, outPath]);

    const out = await readFile(outPath, 'utf8');
    assert.ok(out.startsWith('---\n'), 'output must start with frontmatter delimiter');
    assert.match(out, /^---$/m, 'closing frontmatter delimiter present');
  });

  it('exits non-zero when a required token is missing from the template', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'render-sw-'));
    const tplPath = join(dir, 'template.md');
    const outPath = join(dir, 'out.md');
    // Template missing {{ROLE_LINE}}
    await writeFile(tplPath, '---\nname: {{NAME}}\ndescription: {{DESCRIPTION}}\nskills:\n{{SKILLS}}\n---\nbody\n');

    const result = run([tplPath, outPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ROLE_LINE/);
  });

  it('exits non-zero when args are missing', () => {
    const result = run([]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage/);
  });
});
