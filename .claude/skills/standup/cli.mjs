// Orchestration — the front door to the standup recap.
//
// One subcommand, because one invocation is the whole point: `recap` gathers
// every source once and either hands back the raw StandupRecap (--json, for a
// caller that wants the data) or the bounded rendering (for a reader). Splitting
// gather and render across two invocations would restore the multi-pass cost.

import { dispatch, lines } from '../lib/argv.mjs';
import { gatherSync } from './gather.mjs';
import { renderRecap } from './render.mjs';

// `--remote` takes no value, so it needs no entry in argv.mjs VALUE_FLAGS: under
// `strict: false` a valueless flag parses as boolean true. The `=== true` test is
// what keeps a stray `--remote foo` (which parses as the string "foo") from
// silently enabling a network probe the operator did not ask for.
function recap({ flags, root }) {
  const collected = gatherSync({ rootDir: flags.root ?? root, remote: flags.remote === true });
  return { data: collected, text: lines(renderRecap(collected)) };
}

await dispatch({
  name: 'standup',
  subcommands: {
    recap: {
      summary: 'Gather and render the release, roadmap, backlog and open-question recap in one pass',
      run: recap,
    },
  },
});
