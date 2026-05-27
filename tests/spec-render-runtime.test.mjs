// spec-render/render.sh runtime contract after the java -jar rewire (B4).
//
// Three behaviors:
//   1. Both Java + jar present → renders fixture spec to one SVG under
//      docs/specs/_rendered/<slug>/.
//   2. Java absent → exits 2 with stderr naming Java + JDK install hint.
//   3. Jar absent → exits 2 with stderr naming the jar path + "install" remedy.
//
// Tests are RED until /implement rewires render.sh.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const RENDER_SRC = join(REPO_ROOT, '.claude/skills/spec-render/render.sh');
const REAL_JAR = join(REPO_ROOT, '.claude/bin/plantuml.jar');

const FIXTURE_SPEC = `# Sample spec

\`\`\`plantuml
@startuml
A -> B : hi
@enduml
\`\`\`
`;

function buildSandbox({ withJar }) {
  const root = mkdtempSync(join(tmpdir(), 'spec-render-'));
  mkdirSync(join(root, '.claude/skills/spec-render'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  cpSync(RENDER_SRC, join(root, '.claude/skills/spec-render/render.sh'));
  writeFileSync(join(root, 'docs/specs/sample.md'), FIXTURE_SPEC);
  if (withJar && existsSync(REAL_JAR)) {
    mkdirSync(join(root, '.claude/bin'), { recursive: true });
    cpSync(REAL_JAR, join(root, '.claude/bin/plantuml.jar'));
  }
  return root;
}

// macOS's /usr/bin holds both java AND core utilities (awk, sed, sh, etc.)
// that the script needs. Build a symlink farm in a tmp dir, link only the
// utilities the script depends on, and explicitly omit java.
function pathWithoutJava() {
  const farm = mkdtempSync(join(tmpdir(), 'render-no-java-'));
  const NEEDED = ['awk', 'sed', 'bash', 'sh', 'grep', 'find', 'date', 'cat', 'mkdir', 'rm', 'tr', 'ls'];
  for (const name of NEEDED) {
    const src = which(name);
    if (src) symlinkSync(realpathSync(src), join(farm, name));
  }
  return farm;
}

function which(name) {
  const SYSTEM_DIRS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
  for (const dir of SYSTEM_DIRS) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  for (const dir of (process.env.PATH || '').split(':')) {
    if (!dir || /pyenv|shim/.test(dir)) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function runRender(root, env = {}) {
  return spawnSync(
    'bash',
    [join(root, '.claude/skills/spec-render/render.sh'), 'sample'],
    {
      encoding: 'utf8',
      env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: root },
    },
  );
}

describe('spec-render/render.sh — java -jar rewire (B4)', () => {
  it('test_when_spec_render_runs_with_jar_and_java_then_writes_svg_outputs', () => {
    const root = buildSandbox({ withJar: true });
    const r = runRender(root);
    assert.equal(
      r.status,
      0,
      `render must exit 0 with java + jar present.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    const renderedDir = join(root, 'docs/specs/_rendered/sample');
    assert.ok(
      existsSync(join(renderedDir, 'index.md')),
      `index.md must exist at ${renderedDir}/index.md`,
    );
    const svgs = spawnSync('find', [renderedDir, '-name', '*.svg'], { encoding: 'utf8' }).stdout.trim();
    assert.ok(svgs.length > 0, `at least one .svg must exist under ${renderedDir}; got: "${svgs}"`);
  });

  it('test_when_spec_render_runs_with_java_absent_then_exits_2_with_named_remedy', () => {
    const root = buildSandbox({ withJar: true });
    const r = runRender(root, { PATH: pathWithoutJava() });
    assert.equal(r.status, 2, `render must exit 2 when java is absent.\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /\bjava\b/i, `stderr must name Java.\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /\bJDK\b/, `stderr must include the JDK install hint.\nstderr: ${r.stderr}`);
  });

  it('test_when_spec_render_runs_with_jar_absent_then_exits_2_with_named_remedy', () => {
    const root = buildSandbox({ withJar: false });
    const r = runRender(root);
    assert.equal(r.status, 2, `render must exit 2 when the jar is absent.\nstderr: ${r.stderr}`);
    assert.match(
      r.stderr,
      /plantuml\.jar/,
      `stderr must name the jar path.\nstderr: ${r.stderr}`,
    );
    assert.match(
      r.stderr,
      /install/i,
      `stderr must include an install remedy (e.g. "re-run npx ... install").\nstderr: ${r.stderr}`,
    );
  });
});
