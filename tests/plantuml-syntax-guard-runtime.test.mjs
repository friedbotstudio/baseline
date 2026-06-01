// plantuml_syntax_guard runtime contract after the java -jar rewire (B4).
//
// Three guide-mode branches the hook must support:
//   1. Both Java + jar present → real syntax check via `java -jar $JAR`.
//   2. Jar absent → guide-mode info naming the jar path + remedy; allow.
//   3. Java absent → guide-mode info naming JDK + install hint; allow.
//
// We test by copying the hook + lib/common.mjs into a tmp sandbox, optionally
// staging a real plantuml.jar from the dev repo's .claude/bin/, and optionally
// stripping java from PATH. Hook is invoked with a synthetic PreToolUse
// payload on stdin (pattern mirrors tests/branch-aware-git-policy.test.mjs).
//
// Tests are RED until /implement rewires the hook + adds the jar/java
// preflight branches.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const HOOK_SRC = join(REPO_ROOT, '.claude/hooks/plantuml_syntax_guard.mjs');
const LIB_DIR_SRC = join(REPO_ROOT, '.claude/hooks/lib');
const REAL_JAR = join(REPO_ROOT, '.claude/bin/plantuml.jar');

function buildSandbox({ withJar, strict = false }) {
  const root = mkdtempSync(join(tmpdir(), 'pu-guard-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/logs'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  cpSync(HOOK_SRC, join(root, '.claude/hooks/plantuml_syntax_guard.mjs'));
  cpSync(LIB_DIR_SRC, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    JSON.stringify({ configured: true, plantuml: { strict_syntax_check: strict } }, null, 2),
  );
  if (withJar && existsSync(REAL_JAR)) {
    mkdirSync(join(root, '.claude/bin'), { recursive: true });
    cpSync(REAL_JAR, join(root, '.claude/bin/plantuml.jar'));
  }
  return root;
}

// macOS's /usr/bin holds both java AND core utilities (awk, sed, sh, etc.)
// that the hook needs. We can't just filter /usr/bin out. Instead build a
// symlink farm in a tmp dir, link only the utilities the hook depends on,
// and explicitly omit java.
//
// realpathSync resolves symlink shims so the farm-only PATH doesn't trap the
// shim's version-resolution machinery (which may need its own bin dirs).
function pathWithoutJava() {
  const farm = mkdtempSync(join(tmpdir(), 'pu-no-java-'));
  const NEEDED = ['node', 'awk', 'sed', 'bash', 'sh', 'grep', 'find', 'date', 'cat', 'mkdir', 'rm', 'tr', 'tail', 'head'];
  for (const name of NEEDED) {
    const src = which(name);
    if (src) symlinkSync(realpathSync(src), join(farm, name));
  }
  return farm;
}

function which(name) {
  // Prefer system / homebrew paths over pyenv shims. The shim wrappers need
  // pyenv's own bin dirs on PATH to resolve the actual interpreter, which
  // breaks the farm-only PATH the test relies on.
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

function runGuard(root, payload, env = {}) {
  const res = spawnSync('node', [join(root, '.claude/hooks/plantuml_syntax_guard.mjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
  });
  let decision;
  try {
    const parsed = JSON.parse(res.stdout || '{}');
    decision = parsed?.hookSpecificOutput?.permissionDecision || 'allow';
  } catch { decision = 'allow'; }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, decision };
}

function specPayload(root, slug, body) {
  const filePath = join(root, 'docs/specs', `${slug}.md`);
  return {
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: body },
  };
}

const VALID_FENCE = '```plantuml\n@startuml\nA -> B\n@enduml\n```\n';
const INVALID_FENCE = '```plantuml\n@startuml\nthis is not valid syntax!@#$\n@enduml\n```\n';

describe('plantuml_syntax_guard — opt-in strict syntax check', () => {
  // DEFAULT (strict_syntax_check off): no JVM at the write boundary. An invalid
  // fence is allowed; an advisory points the author at /spec-lint. This is the
  // path that runs during normal spec authoring.
  it('test_when_strict_off_default_then_invalid_fence_allowed_without_java', () => {
    const root = buildSandbox({ withJar: true }); // jar present, but strict off => java never invoked
    const result = runGuard(root, specPayload(root, 'sample', `# spec\n\n${INVALID_FENCE}`));
    assert.equal(
      result.decision, 'allow',
      `strict off (default) must allow even an invalid fence — no write-time java.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    const surfaced = result.stdout + result.stderr;
    assert.match(
      surfaced, /strict_syntax_check|spec-lint/i,
      `strict-off advisory must point at strict_syntax_check / spec-lint.\nsurfaced: ${surfaced}`,
    );
  });

  it('test_when_strict_off_and_no_fences_then_allow', () => {
    const root = buildSandbox({ withJar: true });
    const result = runGuard(root, specPayload(root, 'sample', `# spec\n\nno diagrams here\n`));
    assert.equal(result.decision, 'allow', 'a spec with no plantuml fences must allow');
  });

  // STRICT on: opt-in java -checkonly validation (the prior default behavior).
  it('test_when_strict_on_then_invalid_fence_blocked', { skip: process.env.PLANTUML_TESTS ? false : 'set PLANTUML_TESTS=1 to run JVM-spawning PlantUML tests' }, () => {
    const root = buildSandbox({ withJar: true, strict: true });
    const result = runGuard(root, specPayload(root, 'sample', `# spec\n\n${INVALID_FENCE}`));
    assert.equal(
      result.decision, 'deny',
      `strict on + java + jar: an invalid fence must deny.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  });

  it('test_when_strict_on_then_valid_fence_allowed', { skip: process.env.PLANTUML_TESTS ? false : 'set PLANTUML_TESTS=1 to run JVM-spawning PlantUML tests' }, () => {
    const root = buildSandbox({ withJar: true, strict: true });
    const result = runGuard(root, specPayload(root, 'sample', `# spec\n\n${VALID_FENCE}`));
    assert.equal(
      result.decision, 'allow',
      `strict on + valid fence must allow.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  });

  // STRICT on but tooling absent → guide-mode allow (no JVM spawn).
  it('test_when_strict_on_and_jar_absent_then_guide_mode_allows', () => {
    const root = buildSandbox({ withJar: false, strict: true });
    const result = runGuard(root, specPayload(root, 'sample', `# spec\n\n${VALID_FENCE}`));
    assert.equal(result.decision, 'allow', 'strict on + jar absent must allow (guide mode)');
    const surfaced = result.stdout + result.stderr;
    assert.match(surfaced, /plantuml\.jar/, 'guide-mode message must name plantuml.jar');
    assert.match(surfaced, /guide mode/i, 'guide-mode message must include "guide mode"');
  });

  it('test_when_strict_on_and_java_absent_then_guide_mode_allows', () => {
    const root = buildSandbox({ withJar: true, strict: true });
    const result = runGuard(root, specPayload(root, 'sample', `# spec\n\n${VALID_FENCE}`), {
      PATH: pathWithoutJava(),
    });
    assert.equal(result.decision, 'allow', 'strict on + java absent must allow (guide mode)');
    const surfaced = result.stdout + result.stderr;
    assert.match(surfaced, /\bjava\b/i, 'guide-mode message must name Java');
    assert.match(surfaced, /\bJDK\b/, 'guide-mode message must include the JDK install hint');
  });
});
