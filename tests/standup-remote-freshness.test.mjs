// Spec standup-remote-freshness, AC-001..AC-009.
//
// The failure this defends against: on 2026-08-13 `/standup` reported "Shipped
// v0.21.0, 70 unreleased commits" while v0.22.0 was already tagged, published,
// and released. The clone had not fetched, so `git describe` and
// `rev-list @{upstream}...HEAD` both answered from stale local refs and nothing
// in `degraded[]` said so.
//
// Every fixture here is a real git repository with a real bare origin. Article
// VI.3 — no internal module is mocked, and the probe is exercised against refs
// a real `git ls-remote` actually advertises.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import { tryImport, REPO_ROOT, writeShard } from './helpers/memory-fixtures.mjs';

const GATHER = '.claude/skills/standup/gather.mjs';
const RENDER = '.claude/skills/standup/render.mjs';

const IDENTITY = ['-c', 'user.email=t@t', '-c', 'user.name=t'];

const scratch = [];

after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// ---- Foundation: git + repository fixtures ------------------------------

function git(dir, ...args) {
  return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

function commitInto(dir, message) {
  spawnSync('git', ['-C', dir, ...IDENTITY, 'commit', '-q', '--allow-empty', '-m', message], { encoding: 'utf8' });
  return git(dir, 'rev-parse', 'HEAD').stdout.trim();
}

function annotatedTag(dir, name) {
  spawnSync('git', ['-C', dir, ...IDENTITY, 'tag', '-a', name, '-m', name], { encoding: 'utf8' });
}

function scratchDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

// A bare origin plus a clone that tracks it. The clone is the "repo the operator
// is sitting in"; the origin is what a fetch would reveal.
function makeOriginAndClone(prefix = 'standup-remote-') {
  const base = scratchDir(prefix);
  const work = join(base, 'seed');
  const origin = join(base, 'origin.git');
  mkdirSync(work);

  git(work, 'init', '-q', '-b', 'main', '.');
  commitInto(work, 'seed');
  spawnSync('git', ['init', '-q', '--bare', origin], { encoding: 'utf8' });
  git(work, 'remote', 'add', 'origin', origin);
  git(work, 'push', '-q', 'origin', 'main');

  const clone = join(base, 'clone');
  spawnSync('git', ['clone', '-q', origin, clone], { encoding: 'utf8' });

  return { base, origin, work, clone };
}

// A hostile remote advertises whatever refs it likes. `git tag` name validation
// is the LOCAL client's rule and constrains nothing about a server's refs, so
// these are written straight into the bare repo. Verified against real
// `git ls-remote`: both shapes are advertised verbatim.
function advertiseHostileRef(originDir, refName, sha) {
  const refPath = join(originDir, 'refs', 'tags', refName);
  mkdirSync(dirname(refPath), { recursive: true });
  writeFileSync(refPath, `${sha}\n`, 'utf8');
}

function advertisePackedRef(originDir, refName, sha) {
  appendFileSync(join(originDir, 'packed-refs'), `${sha} refs/tags/${refName}\n`, 'utf8');
}

// ---- Foundation: memory fixtures ---------------------------------------

function makeBacklogProject(counts) {
  const root = scratchDir('standup-backlog-');
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  let n = 0;
  for (const [status, howMany] of Object.entries(counts)) {
    for (let i = 0; i < howMany; i++) {
      n += 1;
      writeShard(memDir, 'backlog', `entry-${n}`, { key: `entry-${n}`, fields: { status } });
    }
  }
  return root;
}

// ---- Domain: module loaders --------------------------------------------

async function loadGather(assertRef) {
  const mod = await tryImport(GATHER);
  assertRef.ok(mod, `${GATHER} must be importable`);
  assertRef.equal(typeof mod.gatherSync, 'function', 'expected named export `gatherSync`');
  return mod.gatherSync;
}

async function loadRender(assertRef) {
  const mod = await tryImport(RENDER);
  assertRef.ok(mod, `${RENDER} must be importable`);
  assertRef.equal(typeof mod.renderRecap, 'function', 'expected named export `renderRecap`');
  return mod.renderRecap;
}

function recapWithBacklog(backlog) {
  return {
    release: { lastVersion: '0.1.0', lastTag: 'v0.1.0', commitsSinceTag: [], remote: null },
    releaseModel: null,
    backlog,
    pendingQuestions: [],
    roadmap: null,
    degraded: [],
  };
}

const PROBE_MARKERS = ['stale-remote-refs', 'remote-probe-failed'];

// ---- AC-001 — the default path stays offline ---------------------------

describe('AC-001 — the default path performs no network call', () => {
  it('test_when_gather_sync_without_remote_then_no_probe_and_release_remote_is_null', async () => {
    const gatherSync = await loadGather(assert);
    const { clone, base } = makeOriginAndClone();

    // The proof is negative. Point origin at a path that does not exist: if the
    // probe ran at all it would fail and push `remote-probe-failed`. So the
    // ABSENCE of both probe markers is what proves no probe fired.
    git(clone, 'remote', 'set-url', 'origin', join(base, 'no-such-origin.git'));

    const recap = gatherSync({ rootDir: clone });

    for (const marker of PROBE_MARKERS) {
      assert.ok(
        !recap.degraded.includes(marker),
        `AC-001: gatherSync without \`remote\` must not probe, but degraded[] carries ${marker}: ${JSON.stringify(recap.degraded)}`,
      );
    }
    assert.equal(
      recap.release.remote,
      null,
      'AC-001: release.remote must be null on the un-probed path so a reader can tell "not checked" from "checked and current"',
    );
  });

  it('test_when_gather_sync_called_twice_without_remote_then_recaps_are_identical', async () => {
    const gatherSync = await loadGather(assert);
    const { clone } = makeOriginAndClone();

    assert.deepEqual(
      gatherSync({ rootDir: clone }),
      gatherSync({ rootDir: clone }),
      'AC-001: the offline core is deterministic — two calls on an unchanged tree must produce identical recaps',
    );
  });

  it('test_when_non_git_dir_with_remote_true_then_no_git_marker_and_no_throw', async () => {
    const gatherSync = await loadGather(assert);
    const plain = scratchDir('standup-nongit-');

    const recap = gatherSync({ rootDir: plain, remote: true });

    assert.ok(
      recap.degraded.includes('no-git'),
      `AC-001/AC-004: a non-git tree must still degrade with no-git; got ${JSON.stringify(recap.degraded)}`,
    );
    assert.ok(
      !recap.degraded.includes('remote-probe-failed'),
      'AC-001/AC-004: the probe must never be reached on a non-git tree, so remote-probe-failed must be absent',
    );
  });
});

// ---- AC-002 — a newer remote tag marks the recap stale ------------------

describe('AC-002 — a newer remote tag is detected', () => {
  it('test_when_origin_has_newer_tag_then_stale_remote_refs_and_remote_tag_reported', async () => {
    const gatherSync = await loadGather(assert);
    const { work, clone } = makeOriginAndClone();

    annotatedTag(work, 'v0.21.0');
    git(work, 'push', '-q', 'origin', 'v0.21.0');
    spawnSync('git', ['-C', clone, 'fetch', '-q', '--tags'], { encoding: 'utf8' });

    // The release the clone has not seen.
    commitInto(work, 'the release commit');
    annotatedTag(work, 'v0.22.0');
    git(work, 'push', '-q', 'origin', 'main');
    git(work, 'push', '-q', 'origin', 'v0.22.0');

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.ok(
      recap.degraded.includes('stale-remote-refs'),
      `AC-002: origin is at v0.22.0 and the clone at v0.21.0, so degraded[] must carry stale-remote-refs; got ${JSON.stringify(recap.degraded)}`,
    );
    assert.equal(
      recap.release.remote?.remoteTag,
      'v0.22.0',
      'AC-002: release.remote.remoteTag must name the newer tag the operator has not fetched',
    );
    assert.equal(recap.release.remote?.stale, true, 'AC-002: release.remote.stale must be true when the remote is ahead');
  });

  it('test_when_ls_remote_emits_peeled_tag_then_peel_suffix_stripped_and_counted_once', async () => {
    const gatherSync = await loadGather(assert);
    const { origin, work, clone } = makeOriginAndClone();

    // An ANNOTATED tag is what makes ls-remote emit the peel line
    // `refs/tags/v2.0.0^{}` alongside `refs/tags/v2.0.0`.
    annotatedTag(work, 'v2.0.0');
    git(work, 'push', '-q', 'origin', 'v2.0.0');

    const advertised = spawnSync('git', ['ls-remote', '--tags', origin], { encoding: 'utf8' }).stdout;
    assert.match(advertised, /\^\{\}/, 'fixture precondition: an annotated tag must advertise a ^{} peel line');

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.equal(
      recap.release.remote?.remoteTag,
      'v2.0.0',
      'AC-002: the ^{} peel suffix must be stripped — remoteTag must read v2.0.0, never v2.0.0^{}',
    );
  });

  it('test_when_remote_tags_include_non_semver_then_discarded_and_numeric_order_wins', async () => {
    const gatherSync = await loadGather(assert);
    const { work, clone } = makeOriginAndClone();

    for (const name of ['zzz', 'v1.2', 'v9.0.0', 'v10.0.0']) {
      spawnSync('git', ['-C', work, ...IDENTITY, 'tag', name], { encoding: 'utf8' });
      git(work, 'push', '-q', 'origin', name);
    }

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.equal(
      recap.release.remote?.remoteTag,
      'v10.0.0',
      'AC-002: comparison must be numeric on {major,minor,patch} — v10.0.0 beats v9.0.0, and `zzz`/`v1.2` are discarded as unparseable rather than ordered lexically',
    );
  });
});

// ---- AC-003 — a diverged branch head marks the recap stale --------------

describe('AC-003 — a diverged remote branch head is detected', () => {
  it('test_when_origin_branch_head_diverges_then_stale_remote_refs_and_remote_head_reported', async () => {
    const gatherSync = await loadGather(assert);
    const { work, clone } = makeOriginAndClone();

    const ahead = commitInto(work, 'landed on origin after the clone');
    git(work, 'push', '-q', 'origin', 'main');

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.ok(
      recap.degraded.includes('stale-remote-refs'),
      `AC-003: origin/main moved and the clone has not fetched, so degraded[] must carry stale-remote-refs; got ${JSON.stringify(recap.degraded)}`,
    );
    assert.equal(
      recap.release.remote?.remoteHead,
      ahead,
      'AC-003: release.remote.remoteHead must hold the remote sha the local tracking ref has not caught up to',
    );
  });
});

// ---- AC-004 — probe failure is fail-open --------------------------------

describe('AC-004 — a failed probe degrades rather than throwing', () => {
  it('test_when_no_origin_configured_then_remote_probe_failed_and_local_figures_intact', async () => {
    const gatherSync = await loadGather(assert);
    const solo = scratchDir('standup-noremote-');
    git(solo, 'init', '-q', '-b', 'main', '.');
    commitInto(solo, 'seed');
    spawnSync('git', ['-C', solo, ...IDENTITY, 'tag', 'v0.3.0'], { encoding: 'utf8' });

    const offline = gatherSync({ rootDir: solo });
    const probed = gatherSync({ rootDir: solo, remote: true });

    assert.ok(
      probed.degraded.includes('remote-probe-failed'),
      `AC-004: no origin is configured, so the probe must degrade with remote-probe-failed; got ${JSON.stringify(probed.degraded)}`,
    );
    assert.ok(
      !probed.degraded.includes('stale-remote-refs'),
      'AC-004: "could not check" must stay separable from "checked and stale" — a failed probe must not claim staleness',
    );
    assert.equal(probed.release.lastTag, offline.release.lastTag, 'AC-004: a failed probe must leave lastTag exactly as the offline path produced it');
    assert.deepEqual(
      probed.release.commitsSinceTag,
      offline.release.commitsSinceTag,
      'AC-004: a failed probe must leave commitsSinceTag untouched',
    );
  });

  it('test_when_probe_target_unroutable_then_remote_probe_failed_within_timeout_bound', async () => {
    const gatherSync = await loadGather(assert);
    const { clone, base } = makeOriginAndClone();
    git(clone, 'remote', 'set-url', 'origin', join(base, 'vanished.git'));

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.ok(
      recap.degraded.includes('remote-probe-failed'),
      `AC-004: an unroutable origin must be caught and reported, never thrown; got ${JSON.stringify(recap.degraded)}`,
    );
    assert.equal(recap.release.remote?.stale, false, 'AC-004: a probe that could not run must not report staleness');
  });
});

// ---- AC-005 — the un-probed render names its own limitation -------------

describe('AC-005 — the default render carries a caveat', () => {
  it('test_when_release_remote_is_null_then_render_carries_local_refs_caveat', async () => {
    const renderRecap = await loadRender(assert);
    const text = renderRecap(recapWithBacklog({ open: [], pickedUp: [], dropped: [] })).join('\n');

    assert.match(
      text,
      /local refs/i,
      'AC-005: an un-probed recap must say its release figures came from local refs — otherwise a stale number reads as authoritative',
    );
    assert.match(
      text,
      /git fetch --tags/,
      'AC-005: the caveat must name the remedy, not just the limitation',
    );
  });
});

// ---- AC-006 — remote-controlled ref text never reaches a shell ----------

describe('AC-006 — hostile ref names cannot execute', () => {
  it('test_when_ref_name_carries_shell_metacharacters_then_no_command_executed', async () => {
    const gatherSync = await loadGather(assert);
    const { origin, work, clone, base } = makeOriginAndClone();

    const sha = git(work, 'rev-parse', 'HEAD').stdout.trim();
    const sentinel = join(base, 'PWNED');
    rmSync(sentinel, { force: true });

    // `git tag` rejects a name containing a space, so a `;touch <path>` payload
    // cannot be created through the porcelain. A hostile SERVER is under no such
    // constraint, so both shapes are written straight into the bare repo — a
    // redirect payload (no space needed) and a semicolon-command pair.
    advertiseHostileRef(origin, `v0.0.9;>${sentinel}`, sha);
    advertisePackedRef(origin, 'v0.0.8;id', sha);

    const advertised = spawnSync('git', ['ls-remote', '--tags', origin], { encoding: 'utf8' }).stdout;
    assert.match(advertised, /v0\.0\.9;>/, 'fixture precondition: the hostile ref must actually be advertised');

    const recap = gatherSync({ rootDir: clone, remote: true });

    // Asserted FIRST and deliberately: without it the sentinel check below is
    // vacuous, because a probe that never runs also never creates the file.
    // This pins that the hostile refs were actually fetched and parsed.
    assert.equal(
      recap.release.remote?.probed,
      true,
      'AC-006: the probe must have actually run against the hostile refs — otherwise the sentinel assertion below proves nothing',
    );
    assert.equal(
      existsSync(sentinel),
      false,
      'AC-006: a ref name carrying a shell redirect must never be evaluated — the sentinel proves the probe ran without a shell',
    );
    assert.notEqual(
      recap.release.remote?.remoteTag,
      `v0.0.9;>${sentinel}`,
      'AC-006: a non-semver ref must be discarded before comparison, never selected as the newest release',
    );
  });
});

// ---- AC-007 — the six-key recap contract survives -----------------------

describe('AC-007 — the recap shape is unchanged', () => {
  const KEYS = ['backlog', 'degraded', 'pendingQuestions', 'release', 'releaseModel', 'roadmap'];

  it('test_when_gather_sync_returns_then_exactly_six_top_level_keys', async () => {
    const gatherSync = await loadGather(assert);
    const { clone } = makeOriginAndClone();

    for (const remote of [false, true]) {
      assert.deepEqual(
        Object.keys(gatherSync({ rootDir: clone, remote })).sort(),
        KEYS,
        `AC-007: freshness nests at release.remote — with remote=${remote} gatherSync must still return exactly the six documented keys`,
      );
    }
  });
});

// ---- AC-008 — the core stays clock-free ---------------------------------

describe('AC-008 — the deterministic core admits no clock', () => {
  it('test_when_gather_source_read_then_no_clock_calls', () => {
    const src = readFileSync(join(REPO_ROOT, GATHER), 'utf8');

    assert.ok(!src.includes('Date.now('), 'AC-008: gather.mjs must not call Date.now() — the probe must not smuggle a clock into the deterministic core');
    assert.ok(!src.includes('new Date('), 'AC-008: gather.mjs must not call new Date() — the probe must not smuggle a clock into the deterministic core');
  });
});

// ---- AC-009 — the picked-up bucket counts what the gatherer produced ----

describe('AC-009 — the picked-up bucket reports the real count', () => {
  it('test_when_backlog_has_picked_up_entries_then_render_prints_the_real_count', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const root = makeBacklogProject({ open: 1, 'picked-up': 2, dropped: 1 });

    const text = renderRecap(gatherSync({ rootDir: root })).join('\n');

    assert.match(
      text,
      /picked-up: 2/,
      'AC-009: two picked-up shards must render as `picked-up: 2` — the renderer indexed the label while the gatherer emitted pickedUp, so this printed 0 unconditionally',
    );
  });

  it('test_when_backlog_carries_only_producer_keys_then_picked_up_still_counts', async () => {
    const renderRecap = await loadRender(assert);
    const text = renderRecap(recapWithBacklog({ open: [{ key: 'a' }], pickedUp: [{ key: 'b' }, { key: 'c' }], dropped: [] })).join('\n');

    assert.match(
      text,
      /picked-up: 2/,
      "AC-009: the renderer must read the producer's `pickedUp` key — a backlog carrying no 'picked-up' key at all is exactly what gatherSync emits",
    );
    assert.match(text, /open: 1/, 'AC-009: the open bucket must keep counting correctly');
    assert.match(text, /dropped: 0/, 'AC-009: the dropped bucket must keep counting correctly');
  });

  it('test_when_picked_up_is_empty_then_prints_zero', async () => {
    const renderRecap = await loadRender(assert);
    const text = renderRecap(recapWithBacklog({ open: [], pickedUp: [], dropped: [] })).join('\n');

    assert.match(
      text,
      /picked-up: 0/,
      'AC-009: a genuinely empty bucket must still print 0 — a true zero has to stay distinguishable from the old unconditional zero',
    );
  });

  it('test_when_existing_consumers_read_pickedUp_then_key_not_renamed', async () => {
    const gatherSync = await loadGather(assert);
    const root = makeBacklogProject({ open: 1, 'picked-up': 2, dropped: 0 });

    const recap = gatherSync({ rootDir: root });

    assert.ok(
      Array.isArray(recap.backlog.pickedUp),
      'AC-009: the data key stays `pickedUp` — memory-readers-sharded and standup-gather both read it, so the fix maps the label and never renames the key',
    );
    assert.equal(recap.backlog.pickedUp.length, 2, 'AC-009: the producer key must still hold the picked-up entries');
  });
});

// ---- AC-010 — nothing to compare is not the same as compared and equal ----

describe('AC-010 — a head with nothing to compare never reads as verified', () => {
  it('test_when_branch_has_no_upstream_then_head_state_is_not_comparable', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const { clone } = makeOriginAndClone();

    // A branch created with `checkout -b` tracks nothing, so `rev-parse
    // @{upstream}` fails. No tags anywhere: the tag axis has nothing to say
    // either, which is exactly the trunk-based shape that exposed the defect.
    git(clone, 'checkout', '-q', '-b', 'feature-no-upstream');

    const recap = gatherSync({ rootDir: clone, remote: true });
    const text = renderRecap(recap).join('\n');

    assert.equal(
      recap.release.remote?.headState,
      'not-comparable',
      'AC-010: a branch that tracks no remote has no head to compare, and that must be its own outcome rather than collapsing into `matched`',
    );
    assert.equal(recap.release.remote?.stale, false, 'AC-010: nothing to compare is not evidence of staleness');
    for (const marker of PROBE_MARKERS) {
      assert.ok(
        !recap.degraded.includes(marker),
        `AC-010: nothing broke and nothing was found, so degraded[] must carry neither marker; got ${JSON.stringify(recap.degraded)}`,
      );
    }
    assert.doesNotMatch(
      text,
      /match(es)? origin/i,
      'AC-010: this is the reported defect verbatim — the recap claimed local refs matched origin for a branch whose head was never compared',
    );
  });

  it('test_when_head_is_detached_then_head_state_is_not_comparable', async () => {
    const gatherSync = await loadGather(assert);
    const { clone } = makeOriginAndClone();

    const sha = git(clone, 'rev-parse', 'HEAD').stdout.trim();
    git(clone, 'checkout', '-q', sha);

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.equal(
      recap.release.remote?.headState,
      'not-comparable',
      'AC-010: a detached HEAD has no branch to resolve, so there is nothing to compare',
    );
    assert.notEqual(
      recap.release.remote?.headState,
      'unreachable',
      'AC-010: a detached HEAD is a repo state, not a failed probe — reporting it as unreachable would blame the network for a local checkout',
    );
  });

  it('test_when_tracked_branch_diverges_on_tagless_repo_then_diverged_and_stale', async () => {
    const gatherSync = await loadGather(assert);
    const { work, clone } = makeOriginAndClone();

    const ahead = commitInto(work, 'landed on origin');
    git(work, 'push', '-q', 'origin', 'main');

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.equal(recap.release.remote?.headState, 'diverged', 'AC-010: origin moved, so the head comparison ran and disagreed');
    assert.equal(recap.release.remote?.stale, true, 'AC-010: with no tags in the repo the head axis carries the whole staleness verdict');
    assert.equal(recap.release.remote?.remoteHead, ahead, 'AC-010: remoteHead must hold the sha the local tracking ref has not caught up to');
  });

  it('test_when_tracked_branch_matches_then_head_state_is_matched', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const { clone } = makeOriginAndClone();

    const recap = gatherSync({ rootDir: clone, remote: true });
    const text = renderRecap(recap).join('\n');

    assert.equal(recap.release.remote?.headState, 'matched', 'AC-010: the comparison ran and agreed, which is a distinct outcome from having nothing to compare');
    assert.match(
      text,
      /match(es)? origin/i,
      'AC-010: a genuine match must still be reported as one — this guards the obvious over-correction, a renderer that stops claiming matches at all',
    );
  });

  it('test_when_heads_probe_fails_on_tracked_branch_then_unreachable_and_probe_failed', async () => {
    const gatherSync = await loadGather(assert);
    const { clone, base } = makeOriginAndClone();

    // The tracking ref origin/main still exists locally, so this branch IS
    // comparable. Only the probe is broken. That separation is the whole point
    // of the AC: `unreachable` blames the network, `not-comparable` blames
    // nothing at all, and they must never be the same verdict.
    git(clone, 'remote', 'set-url', 'origin', join(base, 'vanished.git'));

    const recap = gatherSync({ rootDir: clone, remote: true });

    assert.equal(
      recap.release.remote?.headState,
      'unreachable',
      'AC-010: the branch tracks a remote and the probe failed, so the outcome is unreachable',
    );
    assert.notEqual(
      recap.release.remote?.headState,
      'not-comparable',
      'AC-010: a reachable-in-principle branch whose probe failed is a different finding from a branch with no upstream',
    );
    assert.ok(
      recap.degraded.includes('remote-probe-failed'),
      `AC-010: an unreachable head is a probe failure and must be named as one; got ${JSON.stringify(recap.degraded)}`,
    );
  });
});

// ---- AC-011 — the remedy names only objects the reader has ---------------

// recapWithBacklog takes only a backlog, so the release override is applied
// after the fact rather than passed in. Passing it as a second argument would be
// silently dropped, and these two tests would then fail on a null release.remote
// instead of on the remedy text they exist to pin.
function staleRecap(remoteTag) {
  const recap = recapWithBacklog({ open: [], pickedUp: [], dropped: [] });
  recap.release.remote = { probed: true, stale: true, remoteTag, remoteHead: 'abc', headState: 'diverged', reason: null };
  return recap;
}

function freshnessLineOf(renderRecap, recap) {
  const line = renderRecap(recap).find((l) => /Remote check/.test(l));
  assert.ok(line, 'AC-011: a probed recap must render a Remote check line');
  return line;
}

describe('AC-011 — the remedy names only objects the reader has', () => {
  it('test_when_stale_without_remote_tag_then_remedy_names_plain_fetch', async () => {
    const renderRecap = await loadRender(assert);
    const line = freshnessLineOf(renderRecap, staleRecap(null));

    assert.match(line, /git fetch/, 'AC-011: a stale verdict must still name a remedy');
    assert.ok(
      !line.includes('--tags'),
      `AC-011: staleness came from the branch head and this repo has no tags, so the remedy must not name one; got ${JSON.stringify(line)}`,
    );
  });

  it('test_when_stale_with_remote_tag_then_remedy_names_fetch_tags', async () => {
    const renderRecap = await loadRender(assert);
    const line = freshnessLineOf(renderRecap, staleRecap('v0.22.0'));

    assert.match(
      line,
      /git fetch --tags/,
      'AC-011: a tag drove this verdict, so the remedy must fetch tags — the conditional must not flatten both branches to plain fetch',
    );
  });
});
