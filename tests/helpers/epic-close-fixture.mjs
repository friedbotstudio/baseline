// Foundation fixture builder for the epic-close tests.
//
// Not a *.test.mjs file, so `node --test tests/*.test.mjs` never collects it as
// a suite — it is imported by the epic-close-*.test.mjs files. Builds a real
// temp git repo carrying a live epic discovery bundle + an epic state file, so
// the SUT (.claude/skills/commit/epic_close.mjs) can git-mv the bundle exactly
// as it will in a consumer repo.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const HELPER = path.join(REPO_ROOT, '.claude/skills/commit/epic_close.mjs');

const BUNDLE_DIRS = ['docs/intake', 'docs/scout', 'docs/research', 'docs/specs'];

export async function makeEpicRepo({
  epic = 'demo-epic',
  children = [{ slice: 'A', slug: 'child-a', status: 'committed' }],
  approved = true,
  closed = false,
  withBundle = true,
} = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epic-close-'));
  const git = (...args) => execFileSync('git', args, { cwd: tmp });
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 'test');

  if (withBundle) {
    for (const dir of BUNDLE_DIRS) {
      await fs.mkdir(path.join(tmp, dir), { recursive: true });
      await fs.writeFile(path.join(tmp, dir, `${epic}.md`), `# ${dir}/${epic}\n`);
    }
    const rendered = path.join(tmp, 'docs/specs/_rendered', epic);
    await fs.mkdir(rendered, { recursive: true });
    await fs.writeFile(path.join(rendered, 'c4.svg'), '<svg/>\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'epic discovery bundle');
  }

  const statePath = path.join(tmp, '.claude/state/epic', `${epic}.json`);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const state = {
    epic,
    spec: `docs/specs/${epic}.md`,
    scout: `docs/scout/${epic}.md`,
    research: `docs/research/${epic}.md`,
    slices: children.map((c) => ({ id: c.slice, title: `slice ${c.slice}`, acs: [], risk: [] })),
    approved,
    children,
    created_at: 1700000000,
    updated_at: 1700000000,
  };
  if (closed) {
    state.closed = true;
    state.closed_at = 1700000100;
  }
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n');

  return { tmp, epic, git, statePath };
}

export function runEpicClose(tmp, ...args) {
  try {
    const stdout = execFileSync('node', [HELPER, ...args], {
      cwd: tmp,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      encoding: 'utf8',
    });
    return { status: 0, stdout };
  } catch (e) {
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: (e.stdout || '').toString(),
      stderr: (e.stderr || '').toString(),
    };
  }
}

export async function readState(statePath) {
  return JSON.parse(await fs.readFile(statePath, 'utf8'));
}

export async function pathExists(p) {
  return fs.access(p).then(() => true).catch(() => false);
}

export async function archivedBundleDir(tmp, epic) {
  const archiveRoot = path.join(tmp, 'docs/archive');
  const dates = await fs.readdir(archiveRoot);
  return path.join(archiveRoot, dates[0], epic);
}

export function headCommitCount(tmp) {
  try {
    return parseInt(
      execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim(),
      10,
    );
  } catch {
    return 0;
  }
}

export function porcelain(tmp) {
  return execFileSync('git', ['status', '--porcelain'], { cwd: tmp, encoding: 'utf8' });
}

export async function cleanup(tmp) {
  await fs.rm(tmp, { recursive: true, force: true });
}
