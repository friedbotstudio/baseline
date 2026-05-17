// Projected-version preview via semantic-release JS API.
//
// Returns { version, type, commits } where commits is the analyzer's list
// of conventional-parsed commits between the last release tag and HEAD.

import { execFileSync } from 'node:child_process';

// Parse conventional-commit subject lines: type(scope)?: subject  +  breaking-suffix.
function parseConventional(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);
  if (!match) return { type: 'unknown', scope: null, breaking: false, subject };
  return {
    type: match[1].toLowerCase(),
    scope: match[2] || null,
    breaking: Boolean(match[3]),
    subject: match[4],
  };
}

// List commits between the latest tag and HEAD via plain git (no semantic-release
// dep needed for the commit list itself; semantic-release is only used for the
// projected version computation).
function listCommitsSinceLastTag(cwd) {
  let lastTag;
  try {
    lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd, encoding: 'utf8',
    }).trim();
  } catch {
    lastTag = null;
  }
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  let raw;
  try {
    raw = execFileSync('git', ['log', range, '--format=%H%x09%s%x09%b%x00'], {
      cwd, encoding: 'utf8',
    });
  } catch {
    return [];
  }
  return raw.split('\0').filter(Boolean).map((entry) => {
    const [sha, subject, body] = entry.split('\t');
    const parsed = parseConventional(subject || '');
    const breakingBody = /^BREAKING CHANGE:/m.test(body || '');
    return {
      sha,
      subject: parsed.subject,
      body: (body || '').trim(),
      type: parsed.type,
      scope: parsed.scope,
      breaking: parsed.breaking || breakingBody,
    };
  });
}

// Use semantic-release's JS API to compute the next version.
async function semanticReleaseDryRun(cwd) {
  const mod = await import('semantic-release');
  const semanticRelease = mod.default || mod;
  const noopWritable = { write: () => true, end: () => {} };
  const result = await semanticRelease(
    {
      dryRun: true,
      ci: false,
      branches: ['main', 'master'],
    },
    {
      cwd,
      env: { ...process.env },
      stdout: noopWritable,
      stderr: noopWritable,
    },
  );
  if (result && result.nextRelease) {
    return { version: result.nextRelease.version, type: result.nextRelease.type };
  }
  return { version: null, type: null };
}

// Fallback: derive a projection locally if semantic-release rejects the run
// (e.g., no .releaserc.json, no remote, no commits since last tag).
function localProjection(cwd, commits) {
  let lastTag;
  try {
    lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd, encoding: 'utf8',
    }).trim();
  } catch {
    lastTag = 'v0.0.0';
  }
  const baseSemver = lastTag.replace(/^v/, '');
  const baseParts = baseSemver.split('.').map((s) => parseInt(s, 10) || 0);
  let bumpType = null;
  for (const commit of commits) {
    if (commit.breaking) { bumpType = bumpType === 'major' ? 'major' : 'minor'; continue; }
    if (commit.type === 'feat') { bumpType = bumpType === 'major' ? 'major' : (bumpType === 'minor' ? 'minor' : 'minor'); continue; }
    if (commit.type === 'fix' || commit.type === 'perf' || commit.type === 'refactor') {
      if (!bumpType) bumpType = 'patch';
    }
  }
  if (!bumpType) return { version: baseSemver, type: null };
  const [maj, min, pat] = baseParts;
  if (bumpType === 'major') return { version: `${maj + 1}.0.0`, type: 'major' };
  if (bumpType === 'minor') return { version: `${maj}.${min + 1}.0`, type: 'minor' };
  return { version: `${maj}.${min}.${pat + 1}`, type: 'patch' };
}

export async function previewProjectedVersion(cwd) {
  const commits = listCommitsSinceLastTag(cwd);
  let projection;
  try {
    projection = await semanticReleaseDryRun(cwd);
    if (!projection.version) {
      projection = localProjection(cwd, commits);
    }
  } catch {
    projection = localProjection(cwd, commits);
  }
  return {
    version: projection.version || '0.0.0',
    type: projection.type,
    commits,
  };
}
