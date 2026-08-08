// Orchestration — the front door to the predicates commit/SKILL.md branches on.
//
// D3 of the dispatcher sweep sites this here rather than beside the library it
// calls. The target lives at `.claude/hooks/lib/common.mjs`, whose element
// `hooks-common-lib` carries a FILE anchor, so a `cli.mjs` added next to it would
// be a governed path no element claims — coverage is total by rule, and buying a
// front door with a coverage hole is a bad trade. `commit-helpers` is glob-anchored
// at `.claude/skills/commit/*.mjs`, so the file is covered the moment it exists.
//
// The skills -> hooks import that requires is established, not novel:
// workspace/delta.mjs already imports ../../hooks/lib/slug.mjs.
//
// Why a front door at all for one boolean: commit/SKILL.md branches on it to decide
// whether to push and open a PR. A procedure that re-derives that predicate by hand
// can disagree with git_commit_guard, which reads the same function — and the two
// disagreeing is a commit that lands somewhere nobody authorized.

import { dispatch } from '../lib/argv.mjs';
import { isAutonomousFeatureLanding } from '../../hooks/lib/common.mjs';

function isAutonomousLanding({ root }) {
  const value = isAutonomousFeatureLanding(root);
  // A bare `true`/`false` on stdout, so a shell can branch on it without parsing.
  // The JSON form carries the same value under a name for a machine reader.
  return { data: { autonomous_feature_landing: value }, text: `${value}\n` };
}

dispatch({
  name: 'commit',
  subcommands: {
    'is-autonomous-landing': {
      summary: 'whether this is a github-flow autonomous feature landing',
      run: isAutonomousLanding,
    },
  },
});
