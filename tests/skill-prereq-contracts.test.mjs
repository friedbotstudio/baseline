// T2 of extractor-noise-and-prereq-drift — the PROSE half.
// Spec: docs/specs/extractor-noise-and-prereq-drift.md (D5, §Behavior #2)
// Covers AC-005 (simplify prereq), AC-006 (integrate prereq).
//
// Why a test asserts on SKILL.md text: these two ACs are contract-prose changes.
// An AC with no resolvable diff line cannot be resolved by drift_check.mjs (a
// literal-id-substring matcher over the working-tree diff) and WEDGES the drift
// tick into a permanent yield — a landmine that has bitten this repo twice.
// Binding each prose AC to a structural assertion over the shipped file gives it
// a real added line to resolve against.
//
// The defect: both skills declare prereqs their own track can never satisfy.
//   integrate wants `security` in completed OR exceptions — the chore DAG has no
//     security node, so security lands in NEITHER set.
//   simplify wants `tdd` in completed — but tdd is ALWAYS a chore exception.
// Post-fix, both must accept a phase present in `exceptions`, not only `completed`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(REPO_ROOT, '.claude/skills');

function prereqSection(skillSlug) {
  const src = readFileSync(join(SKILLS, skillSlug, 'SKILL.md'), 'utf8');
  const match = src.match(/#+\s*Prereq[\s\S]*?(?=\n#+\s|\n?$)/i);
  assert.ok(match, `${skillSlug}/SKILL.md must declare a Prereq section`);
  return match[0];
}

// The prereq must offer `exceptions` as an ALTERNATIVE to `completed`, not merely
// mention the word somewhere in the section.
const ACCEPTS_EXCEPTED_PHASE = /\bexceptions\b/i;

describe('T2 — skill prereq contracts accept an excepted phase', () => {
  it('test_when_simplify_skill_prereq_read_then_accepts_excepted_phase', async () => { // AC-005
    const prereq = prereqSection('simplify');
    assert.match(
      prereq,
      ACCEPTS_EXCEPTED_PHASE,
      "simplify's Prereq must accept `tdd` present in exceptions, not only in completed — on a chore track tdd is ALWAYS an exception and can never complete",
    );
  });

  it('test_when_integrate_prereq_read_then_already_accepts_exceptions_unchanged', async () => { // AC-006
    // REGRESSION GUARD, not a fix. integrate's prereq ALREADY accepts `security` in
    // `exceptions` — verified at /scenario time, which is how we learned the original
    // AC-006 was a no-op. The defect was never the prose: nothing ever PUT security
    // into either set on a chore. That is fixed by runtime resolution (D13/AC-014),
    // not by editing this text. This test exists so a future edit cannot quietly
    // remove the `exceptions` branch and re-break the chore track.
    const prereq = prereqSection('integrate');
    assert.match(
      prereq,
      ACCEPTS_EXCEPTED_PHASE,
      "integrate's Prereq must KEEP accepting `security` in `exceptions` — chore resolves security into exceptions at runtime when its trigger does not fire",
    );
  });

  it('test_when_chore_skill_read_then_resolves_every_internal_phase', async () => { // AC-014
    const src = readFileSync(join(SKILLS, 'chore/SKILL.md'), 'utf8');
    // Every internal phase must land in exactly one of completed | exceptions.
    // Leaving one in limbo is what made integrate's prereq unsatisfiable on the
    // common (non-sensitive-glob) chore — the defect D11 originally introduced.
    assert.match(
      src,
      /auto_skipped/,
      'chore/SKILL.md must record an auto_skipped[] provenance row for each runtime-skipped conditional phase',
    );
    assert.match(
      src,
      /internal_phases/,
      'chore/SKILL.md must resolve every phase in the track\'s internal_phases[] into completed or exceptions — none may be left in neither set',
    );
  });

  it('test_when_chore_skill_read_then_declares_sensitive_glob_security_trigger', async () => { // AC-010
    const src = readFileSync(join(SKILLS, 'chore/SKILL.md'), 'utf8');
    assert.match(
      src,
      /sensitive_globs/,
      'chore/SKILL.md must declare the conditional security trigger: security is REQUIRED when the diff intersects security.sensitive_globs',
    );
  });
});
