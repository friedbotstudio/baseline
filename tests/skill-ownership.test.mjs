import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// ---------- Foundation: clone + build + audit helpers ----------

async function cloneRepo() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-ownership-'));
  const result = spawnSync(
    'rsync',
    [
      '-a',
      '--exclude=node_modules',
      '--exclude=obj',
      '--exclude=.git',
      '--exclude=docs/archive',
      '--exclude=.playwright-mcp',
      `${REPO_ROOT}/`,
      tmp,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`rsync failed: ${result.stderr}`);
  }
  return tmp;
}

function runBuild(tmp) {
  return spawnSync('bash', [path.join(tmp, 'scripts/build-template.sh')], {
    env: { ...process.env, PKG_ROOT: tmp, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  });
}

function runAudit(tmp) {
  return spawnSync('bash', [path.join(tmp, '.claude/skills/audit-baseline/audit.sh')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  });
}

async function readManifest(tmp) {
  const raw = await fs.readFile(path.join(tmp, 'obj/template/manifest.json'), 'utf8');
  return JSON.parse(raw);
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[1] : '';
}

function readOwnerFromFrontmatter(content) {
  const fm = parseFrontmatter(content);
  const m = fm.match(/^owner:\s*(\S+)\s*$/m);
  return m ? m[1] : null;
}

// ---------- Domain: AC tests ----------

describe('skill ownership — frontmatter (AC-001)', () => {
  it('test_when_owner_field_present_then_value_is_baseline_or_user', async () => {
    // Per CLAUDE.md Article XI's absence-default policy: a SKILL.md without
    // an `owner:` field is treated as user/third-party and is out-of-scope
    // of baseline audit checks. Only a present-but-malformed `owner:` value
    // (anything other than `baseline` or `user`) is a violation. This test
    // enforces that exact contract: null owners are accepted; explicit owners
    // must be one of the two sanctioned values.
    const skillsDir = path.join(REPO_ROOT, '.claude/skills');
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const offenders = [];
    for (const slug of slugs) {
      const skillPath = path.join(skillsDir, slug, 'SKILL.md');
      const content = await fs.readFile(skillPath, 'utf8');
      const owner = readOwnerFromFrontmatter(content);
      if (owner !== null && owner !== 'baseline' && owner !== 'user') {
        offenders.push(`${slug}: owner=${owner}`);
      }
    }
    assert.equal(
      offenders.length,
      0,
      `every present \`owner:\` value must be baseline or user; offenders:\n${offenders.join('\n')}`
    );
  });
});

describe('skill ownership — build manifest v2 (AC-002, AC-008)', () => {
  let tmp;
  before(async () => {
    tmp = await cloneRepo();
    const result = runBuild(tmp);
    if (result.status !== 0) {
      throw new Error(`build failed: ${result.stderr || result.stdout}`);
    }
  });
  after(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('test_when_clean_build_then_manifest_v2_with_owners_skills', async () => {
    const m = await readManifest(tmp);
    assert.equal(m.manifest_version, 2, 'manifest_version must be 2');
    assert.ok(m.owners && typeof m.owners === 'object', 'manifest must carry owners block');
    assert.ok(
      m.owners.skills && typeof m.owners.skills === 'object',
      'owners.skills must be an object'
    );
    const slugs = Object.keys(m.owners.skills);
    assert.ok(slugs.length > 0, 'owners.skills must be non-empty');
    for (const slug of slugs) {
      assert.equal(
        m.owners.skills[slug],
        'baseline',
        `every owners.skills value must be 'baseline'; ${slug} was ${m.owners.skills[slug]}`
      );
    }
  });

  it('test_when_two_consecutive_builds_then_manifests_byte_identical', async () => {
    const first = await fs.readFile(path.join(tmp, 'obj/template/manifest.json'), 'utf8');
    const result = runBuild(tmp);
    assert.equal(result.status, 0, `rebuild failed: ${result.stderr || result.stdout}`);
    const second = await fs.readFile(path.join(tmp, 'obj/template/manifest.json'), 'utf8');
    // generated_at WILL differ; strip it before comparing.
    const stripGen = (s) => s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at":"<stripped>"');
    assert.equal(stripGen(first), stripGen(second), 'manifest bytes must be deterministic (modulo generated_at)');
  });
});

describe('skill ownership — audit on clean build (AC-003)', () => {
  let tmp;
  before(async () => {
    tmp = await cloneRepo();
    const buildResult = runBuild(tmp);
    if (buildResult.status !== 0) {
      throw new Error(`build failed: ${buildResult.stderr || buildResult.stdout}`);
    }
  });
  after(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('test_when_audit_runs_after_clean_build_then_exits_zero', () => {
    const result = runAudit(tmp);
    assert.equal(
      result.status,
      0,
      `audit-baseline must exit 0 on clean build; stdout tail:\n${result.stdout.split('\n').slice(-10).join('\n')}`
    );
  });
});

describe('skill ownership — drift detection (AC-004, AC-006, AC-009)', () => {
  it('test_when_baseline_SKILL_md_body_tampered_then_audit_reports_hash_mismatch', async () => {
    const tmp = await cloneRepo();
    try {
      assert.equal(runBuild(tmp).status, 0);
      const target = path.join(tmp, '.claude/skills/spec/SKILL.md');
      await fs.appendFile(target, ' ');
      const audit = runAudit(tmp);
      assert.notEqual(audit.status, 0, 'audit should fail after baseline SKILL.md tampering');
      const out = audit.stdout + audit.stderr;
      assert.match(out, /hash mismatch/i, 'audit output must mention hash mismatch');
      assert.match(out, /\bspec\b/, 'audit output must name the affected slug "spec"');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_owner_field_removed_from_baseline_skill_then_audit_fails', async () => {
    const tmp = await cloneRepo();
    try {
      assert.equal(runBuild(tmp).status, 0);
      const target = path.join(tmp, '.claude/skills/spec/SKILL.md');
      const content = await fs.readFile(target, 'utf8');
      const stripped = content.replace(/^owner:.*\n/m, '');
      await fs.writeFile(target, stripped);
      const audit = runAudit(tmp);
      assert.notEqual(audit.status, 0, 'audit should fail when owner: is removed from a baseline SKILL.md');
      const out = audit.stdout + audit.stderr;
      // Stripping `owner: baseline` from a manifest-listed slug surfaces two
      // signals: (1) the file's sha256 no longer matches the manifest, and
      // (2) the slug drops out of disk_baseline_skills so the names-match
      // check reports it as missing. Either string is sufficient evidence
      // that the audit detected the tampering. Per Article XI's absence-default
      // policy, `missing owner frontmatter` is NOT emitted for absent-owner
      // skills — only for baseline-listed slugs whose absence is detected
      // structurally via hash or names-match.
      assert.match(out, /hash mismatch|missing:/i, 'audit must surface tampering via hash mismatch or names-match');
      assert.match(out, /\bspec\b/, 'audit output must name the affected slug "spec"');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_baseline_skill_directory_removed_then_audit_reports_baseline_skill_missing', async () => {
    const tmp = await cloneRepo();
    try {
      assert.equal(runBuild(tmp).status, 0);
      await fs.rm(path.join(tmp, '.claude/skills/spec'), { recursive: true, force: true });
      const audit = runAudit(tmp);
      assert.notEqual(audit.status, 0, 'audit should fail when a baseline skill directory is removed');
      const out = audit.stdout + audit.stderr;
      assert.match(out, /baseline skill missing/i, 'audit output must mention baseline skill missing');
      assert.match(out, /\bspec\b/, 'audit output must name the missing slug "spec"');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('skill ownership — user skill ignored (AC-005)', () => {
  it('test_when_user_skill_added_then_audit_ignores_it', async () => {
    const tmp = await cloneRepo();
    try {
      assert.equal(runBuild(tmp).status, 0);
      const userSkillDir = path.join(tmp, '.claude/skills/user-example');
      await fs.mkdir(userSkillDir);
      await fs.writeFile(
        path.join(userSkillDir, 'SKILL.md'),
        '---\nname: user-example\nowner: user\ndescription: test user skill for audit ignore\n---\n\n# user-example\n'
      );
      const audit = runAudit(tmp);
      assert.equal(
        audit.status,
        0,
        `audit must exit 0 when a user-owned skill is added; stdout tail:\n${audit.stdout.split('\n').slice(-15).join('\n')}`
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('skill ownership — constitutional citation (AC-007)', () => {
  it('test_when_section_17_missing_from_seed_then_audit_reports_missing_citation', async () => {
    const tmp = await cloneRepo();
    try {
      assert.equal(runBuild(tmp).status, 0);
      const seedPath = path.join(tmp, 'docs/init/seed.md');
      const content = await fs.readFile(seedPath, 'utf8');
      const without17 = content.replace(/## §17[\s\S]*?(?=\n## §|\n---\n|$)/m, '');
      assert.notEqual(without17, content, 'precondition: §17 must exist in seed.md before removal');
      await fs.writeFile(seedPath, without17);
      const audit = runAudit(tmp);
      assert.notEqual(audit.status, 0, 'audit should fail when §17 is removed from seed.md');
      const out = audit.stdout + audit.stderr;
      assert.match(out, /missing.*§17.*citation|seed\.md.*missing.*citation|§17.*missing/i,
        'audit output must mention seed.md missing §17 citation');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
