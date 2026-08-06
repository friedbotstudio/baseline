import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runRepoAudit } from './helpers/audit-repo.mjs';

// erp-portables slice A (AC-001) — Article II §4.2-A: read-only advisory
// subagents. The amendment re-scopes Article II's delegation ban from
// "conversational judgment" to BINDING judgment (a written decision or
// production change): advisory subagents may gather and advise; every binding
// decision and write stays in main context. seed.md §4.2 is amended FIRST
// (Art. I.4 precedence), mirrors stay in lockstep, and swarm-worker remains
// the sole WRITING subagent. No mocks — the real files + the real audit are
// the system under test.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function articleSection(text, roman) {
  const re = new RegExp(`^## Article ${roman}\\b[\\s\\S]*?(?=^## Article |^## Appendix |\\Z)`, 'm');
  const m = re.exec(text);
  return m ? m[0] : null;
}

function seedSection(text, marker, nextMarker) {
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `expected to find ${JSON.stringify(marker)} in seed.md`);
  const end = text.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `expected to find ${JSON.stringify(nextMarker)} after ${JSON.stringify(marker)}`);
  return text.slice(start, end);
}

test('test_when_amended_then_seed_4_2_permits_read_only_advisory_subagents', () => {
  // AC-001, amended genesis first: §4.2 carries the §4.2-A advisory clause.
  const sec = seedSection(read('docs/init/seed.md'), '### §4.2 Subagents', '### §4.3');
  assert.match(sec, /§4\.2-A/, 'seed §4.2 declares the §4.2-A advisory-subagents clause');
  assert.match(sec, /read-only advisory subagents/i, 'seed §4.2 permits read-only advisory subagents');
  assert.match(sec, /binding judgment/i, 'seed §4.2 scopes the delegation ban to binding judgment');
});

test('test_when_amended_then_article_II_scopes_ban_to_binding_judgment', () => {
  // AC-001: Article II's ban targets binding judgment, and advisory subagents
  // (gather/review, no writes, no decisions) are explicitly permitted.
  const ii = articleSection(read('CLAUDE.md'), 'II');
  assert.ok(ii, 'Article II is locatable in CLAUDE.md');
  assert.match(ii, /binding judgment/i, 'Article II names binding judgment as the object of the ban');
  assert.match(ii, /read-only advisory subagents/i, 'Article II permits read-only advisory subagents');
  assert.equal(
    /SHALL NOT route conversational judgment/.test(ii),
    false,
    'the old blanket conversational-judgment routing ban is re-scoped (phrase no longer stands as the ban)'
  );
});

test('test_when_amended_then_swarm_worker_remains_sole_writing_subagent', () => {
  // Regression trap (spec §Test plan): the amendment widens ADVISORY use only —
  // the baseline still ships exactly one subagent, and it remains the only one
  // that writes. Holds before AND after the amendment.
  const ii = articleSection(read('CLAUDE.md'), 'II');
  assert.ok(ii, 'Article II is locatable in CLAUDE.md');
  assert.match(ii, /exactly \*\*one\*\* subagent: `swarm-worker`/, 'Article II keeps the one-subagent declaration');
  assert.match(ii, /swarm-worker/, 'swarm-worker remains the named subagent');
});

test('test_when_amended_then_scout_and_research_carry_gathering_delegation_clause', () => {
  // AC-001: gathering MAY be delegated to read-only advisory subagents; what
  // enters the report is decided in main context. Scout's project-source
  // read-only constraint survives verbatim.
  const scout = read('.claude/skills/scout/SKILL.md');
  const research = read('.claude/skills/research/SKILL.md');
  assert.match(scout, /read-only advisory subagents?/i, 'scout SKILL.md carries the gathering-delegation clause');
  assert.match(research, /read-only advisory subagents?/i, 'research SKILL.md carries the gathering-delegation clause');
  assert.match(scout, /main context/i, 'scout keeps report decisions in main context');
  assert.match(research, /main context/i, 'research keeps report decisions in main context');
  assert.ok(
    scout.includes('Project source is read-only during scout'),
    'scout retains the project-source read-only constraint verbatim'
  );
});

test('test_when_amended_then_constitution_mirrors_stay_in_lockstep', () => {
  // Mirror discipline: CLAUDE.md <-> src/CLAUDE.template.md byte-equal; the
  // seed template matches pre-§16 (the §16 carve-out is project-specific —
  // see tests/seed-template-parity.test.mjs for the full contract).
  assert.equal(
    read('src/CLAUDE.template.md'),
    read('CLAUDE.md'),
    'src/CLAUDE.template.md is a byte-equal mirror of CLAUDE.md'
  );
  const SEC16 = '\n## §16 — Project-specific configuration';
  const live = read('docs/init/seed.md');
  const tpl = read('src/seed.template.md');
  const before = (text) => {
    const i = text.indexOf(SEC16);
    assert.notEqual(i, -1, 'seed carries the §16 heading');
    return text.slice(0, i);
  };
  assert.equal(before(tpl), before(live), 'seed template pre-§16 body mirrors the live genesis');
});

test('test_when_full_change_then_audit_baseline_passes', () => {
  // Exit 0 = PASS. A non-zero exit throws with the FAIL rows AND writes the full
  // payload to .claude/state/logs/ — the bare execFileSync this replaced lost it
  // to reporter truncation (backlog: full-suite-intermittently-fails-three-
  // audit-spawning-tests).
  const out = runRepoAudit({ label: 'article-ii-advisory-subagents' });
  assert.match(out, /PASS|OK/i, 'audit-baseline reports PASS after the amendment + template rebuild');
});
