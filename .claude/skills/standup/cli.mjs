// Orchestration — the front door to the standup recap.
//
// One subcommand, because one invocation is the whole point: `recap` gathers
// every source once and either hands back the raw StandupRecap (--json, for a
// caller that wants the data) or the bounded rendering (for a reader). Splitting
// gather and render across two invocations would restore the multi-pass cost.

import { dispatch, lines } from '../lib/argv.mjs';
import { gatherSync } from './gather.mjs';
import { renderRecap } from './render.mjs';

function recap({ flags, root }) {
  const collected = gatherSync({ rootDir: flags.root ?? root });
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
