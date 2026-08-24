// AC-025 — a quoted-delimiter heredoc body is data, not commands.
//
// Found by the fixed guard refusing a real edit. Recursing into executors (the
// AC-023 fix) also made backticks inside a heredoc read as command substitution,
// because executedFragments has no notion of a heredoc. A quoted delimiter —
// <<'EOF' or <<"EOF" — means the shell performs NO expansion and NO substitution
// in the body: it is a literal blob on its way to a program's stdin.
//
// Markdown prose uses backticks constantly, so a spec edit written through a
// heredoc reads as executing whatever its prose quotes. That is the T4
// false-positive class arriving through the door AC-023 opened.
//
// An UNQUOTED delimiter (<<EOF) is deliberately left alone: the shell DOES expand
// and substitute there, so its contents really can execute.
//
// RED until: executedFragments blanks quoted-delimiter heredoc bodies before
// walking the command.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');

function hardBlockPatterns() {
  return JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'))
    .destructive.hard_block_patterns;
}

// Built at runtime so this file never contains the literal command it is about.
const BACKTICK = String.fromCharCode(96);
const VERB = ['shut', 'down'].join('');

const proseHeredoc = (delim) => [
  `node - <<${delim}`,
  'const note = "the guard reads a wrapped verb such as',
  `${BACKTICK}sh -c "${VERB} -h now"${BACKTICK} as one command";`,
  delim.replace(/['"]/g, ''),
].join('\n');

describe('AC-025 — a quoted-delimiter heredoc body is not executed', () => {
  it('test_when_prose_in_a_quoted_heredoc_quotes_a_destructive_verb_then_it_is_not_blocked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    for (const delim of ["'EOF'", '"EOF"']) {
      assert.equal(
        cmdMatchesAny(proseHeredoc(delim), patterns),
        false,
        `a quoted-delimiter heredoc body is data: ${delim}`
      );
    }
  });

  it('test_when_the_heredoc_body_is_walked_then_it_yields_no_executed_fragment', async () => {
    const { executedFragments } = await import(COMMON);

    assert.equal(typeof executedFragments, 'function', 'the walker is exported for this check');
    const frags = executedFragments(proseHeredoc("'EOF'")).join('\n');
    assert.doesNotMatch(
      frags,
      new RegExp(`^\\s*${VERB}`, 'm'),
      'no fragment from inside the body may lead with the quoted verb'
    );
  });

  it('test_when_the_delimiter_is_unquoted_then_the_body_is_still_walked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // The safety direction. An unquoted delimiter expands and substitutes, so a
    // substitution in the body really does run and must stay blocked.
    const live = [`cat <<EOF`, `${BACKTICK}${VERB} -h now${BACKTICK}`, 'EOF'].join('\n');
    assert.equal(cmdMatchesAny(live, patterns), true, 'an unquoted heredoc still executes its substitutions');
  });

  it('test_when_a_real_command_follows_the_heredoc_then_it_is_still_walked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // Blanking the body must not swallow the rest of the command line.
    const after = [`node - <<'EOF'`, 'const x = 1;', 'EOF', `${VERB} -h now`].join('\n');
    assert.equal(cmdMatchesAny(after, patterns), true, 'a command after the heredoc still blocks');
  });

  it('test_when_the_opener_is_an_executor_then_the_body_is_still_executed', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // THE security boundary, and the reason this reuses stripQuotedHeredocBodies
    // instead of a local strip. A quoted heredoc is data for a SINK (cat, tee)
    // and a script for an EXECUTOR: `bash <<'EOF'` really runs its body. A
    // blanket strip written here hid exactly this, measured, before it was
    // replaced by the shipped helper.
    const executed = [`bash <<'EOF'`, `${VERB} -h now`, 'EOF'].join('\n');
    assert.equal(cmdMatchesAny(executed, patterns), true, 'an executor heredoc runs its body');

    const sink = [`cat >> notes.md <<'EOF'`, `prose mentioning ${VERB}`, 'EOF'].join('\n');
    assert.equal(cmdMatchesAny(sink, patterns), false, 'a sink heredoc body is data');
  });

  it('test_when_the_heredoc_is_unterminated_then_it_answers_without_throwing', async () => {
    const { executedFragments, cmdMatchesAny } = await import(COMMON);

    const truncated = [`node - <<'EOF'`, 'const x = 1;'].join('\n');
    assert.doesNotThrow(() => executedFragments(truncated));
    assert.doesNotThrow(() => cmdMatchesAny(truncated, hardBlockPatterns()));
  });
});
