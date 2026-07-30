// T3 — the consumer-side half. org-dispatch and the sprint servers already ship;
// the org TRACK and the companion peer-launch path do not. Without both, a
// consumer can select nothing (no track) or select a track that dies on its
// first ask_lead (no launch path).
//
// The smoke test is the only scenario in this batch that exercises the real
// consumer path end to end.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => path.join(REPO_ROOT, rel);

const { TOOL_NAMES } = await import(pathToFileURL(p('.claude/mcp/sprint-channel/server.mjs')).href);

const selectableTracks = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((t) => t.selectable === true);

const frontmatterOwner = (skillMd) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(skillMd, 'utf8'));
  if (!m) return null;
  const owner = /^owner:\s*(\S+)/m.exec(m[1]);
  return owner ? owner[1] : null;
};

describe('T3 — org mode reaches the consumer', () => {
  it('test_when_manifest_built_then_companion_owner_baseline_and_hashed', () => { // AC-009
    // Shipped skills are canonical at .claude/skills/<slug>/ and reach
    // obj/template via build Stage 1.5, which prunes anything lacking
    // `owner: baseline`. There is no src/.claude/skills/ tree.
    const shipped = p('.claude/skills/companion/SKILL.md');
    assert.ok(existsSync(shipped), 'companion must exist at the canonical skills path');
    assert.equal(
      frontmatterOwner(shipped),
      'baseline',
      'a shipped skill must declare owner: baseline (Art. XII.1)',
    );
    const manifestPath = p('obj/template/.claude/manifest.json');
    assert.ok(existsSync(manifestPath), 'template manifest must exist');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const files = Object.keys(manifest.files || {});
    const companionEntries = files.filter((f) => f.includes('skills/companion/'));
    assert.ok(
      companionEntries.length > 0,
      'companion files must be hashed into the shipped manifest (Art. XII.3)',
    );
  });

  it('test_when_template_built_then_org_track_selectable_present', () => { // AC-009
    for (const rel of ['src/.claude/workflows.template.jsonl', 'obj/template/.claude/workflows.jsonl']) {
      const file = p(rel);
      assert.ok(existsSync(file), `${rel} must exist`);
      const org = selectableTracks(file).find((t) => t.track_id === 'org');
      assert.ok(org, `${rel} must ship a selectable org track`);
      const flagFence = (org.preconditions || []).find(
        (pc) => pc.name === 'requires_config_flag' && pc.path === 'velocity.org_mode.enabled',
      );
      assert.ok(
        flagFence,
        'the org track must keep its requires_config_flag fence — shipping it must not enable it',
      );
      assert.equal(flagFence.equals, true, 'the fence must require the flag to be strictly true');
      assert.ok(
        (org.preconditions || []).some((pc) => pc.name === 'requires_git'),
        'the org track must keep requires_git',
      );
    }
  });

  it('test_when_consumer_layout_then_no_dev_tree_paths_referenced', () => { // AC-010
    // A consumer install receives no src/, tests/, scripts/ or obj/. A shipped
    // skill that invokes one of those paths is broken on arrival.
    const shipped = p('.claude/skills/companion/SKILL.md');
    const text = readFileSync(shipped, 'utf8');
    for (const devPath of ['src/', 'tests/', 'scripts/', 'obj/']) {
      assert.ok(
        !text.includes(devPath),
        `companion SKILL.md must not reference the dev-tree path "${devPath}" — a consumer has no such directory`,
      );
    }
  });

  it('test_when_fresh_install_then_org_runs_without_dev_channel_flag', () => { // AC-010
    // The consumer path must not depend on the experimental channel launcher.
    const registered = JSON.parse(readFileSync(p('.mcp.json'), 'utf8')).mcpServers;
    assert.ok(registered['sprint-channel'], 'sprint-channel must stay registered — it is the consumer path');

    const orgSkill = readFileSync(p('.claude/skills/org-dispatch/SKILL.md'), 'utf8');
    const required = [...orgSkill.matchAll(/\b(ask_lead|answer_peer|sprint_status|enqueue_task|claim_task|signal_done|yield_fork|release_task)\b/g)]
      .map((m) => m[1]);
    const needed = [...new Set(required)];
    assert.ok(needed.length >= 4, 'org-dispatch must declare the tools it depends on');

    const channelSrc = readFileSync(p('.claude/mcp/sprint-channel/server.mjs'), 'utf8');
    for (const tool of needed) {
      assert.ok(
        channelSrc.includes(`'${tool}'`),
        `org-dispatch needs "${tool}"; sprint-channel must expose it so no --dangerously-load-development-channels is required`,
      );
    }
  });

  it('test_when_org_shipped_then_seed_records_accurate_pool_rationale', () => { // AC-010
    // D-2: seed.md:335 says sprint-pool is "not a stdio server", but
    // sprint-pool/server.mjs:237 connects StdioServerTransport. The real reason
    // it stays unregistered is the experimental-channel launch flag.
    const seed = readFileSync(p('docs/init/seed.md'), 'utf8');
    assert.ok(
      !/not a stdio server/.test(seed),
      'seed.md must drop the inaccurate "not a stdio server" rationale for sprint-pool (D-2)',
    );
    assert.ok(
      /--dangerously-load-development-channels/.test(seed),
      'seed.md must name the real reason: the experimental-channel launch flag',
    );
  });

  it('test_when_channel_gains_tools_then_seed_tool_count_follows', () => { // AC-010
    // seed.md:335 enumerates sprint-channel's tools and states the count in
    // prose. Adding four tools without updating it recreates the T2 defect
    // class: a document asserting a count the code does not have.
    const seed = readFileSync(p('docs/init/seed.md'), 'utf8');
    // Use the module's own export, not a regex over its source: the tuple
    // pattern also matches z.enum members (`worker`) and inline string
    // fragments, which over-counted 13 as 14.
    const actual = TOOL_NAMES.length;
    const WORDS = {
      9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
    };
    const word = WORDS[actual];
    assert.ok(word, `unexpected tool count ${actual}; extend the word map`);
    assert.ok(
      new RegExp(`${word} tools`, 'i').test(seed),
      `seed.md must state "${word} tools" to match the ${actual} the channel exposes`,
    );
  });
});
