// Count-claim pattern definitions + match classifier — the regexes and the
// HEADLINE / LOCAL / AMBIGUOUS tier heuristic shared by the cross-doc count-claim
// scan and the quickfix-6 regex probe. Foundation: pure pattern builders.
export const NUM_GROUP = String.raw`(?<![.\d\-])(\d+|twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|twenty-seven|twenty-eight|twenty-nine|thirty-one|thirty-two|thirty-three|thirty-four|thirty-five|thirty-six|thirty-seven|thirty-eight|thirty-nine|forty-one|forty-two|twenty|thirty|forty|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`;

export function headPatterns(ctx) {
  const { diskBaselineHooks, diskBaselineAgents, diskBaselineSkills } = ctx;
  return [
    [new RegExp(NUM_GROUP + String.raw`\s+hooks?\b`, 'gi'), diskBaselineHooks.size, 'hooks'],
    [new RegExp(NUM_GROUP + String.raw`\s+guard\s+(?:hook|script)s?\b`, 'gi'), diskBaselineHooks.size, 'guard hooks/scripts'],
    [new RegExp(NUM_GROUP + String.raw`\s+(?:baseline\s+)?subagents?\b`, 'gi'), diskBaselineAgents.size, 'subagents'],
    [new RegExp(NUM_GROUP + String.raw`\s+skills\b`, 'gi'), diskBaselineSkills.size, 'skills'],
  ];
}
export function parenPatterns(ctx) {
  return [
    [/\b(?:guard\s+hooks?|guards?)\s*\((\d+)\)/gi, ctx.diskBaselineHooks.size, 'guard hooks'],
    [/\bsubagents?\s*\((\d+)\)/gi, ctx.diskBaselineAgents.size, 'subagents'],
    [/\bskills?\s*\((\d+)\)/gi, ctx.diskBaselineSkills.size, 'skills'],
  ];
}
export function nounFirstPatterns(ctx) {
  return [
    [/\bhooks?\s+(\d+)\b/gi, ctx.diskBaselineHooks.size, 'hooks'],
    [/\b(?:sub)?agents?\s+(\d+)\b/gi, ctx.diskBaselineAgents.size, 'agents'],
    [/\bskills?\s+(\d+)\b/gi, ctx.diskBaselineSkills.size, 'skills'],
  ];
}

export const QUALIFIER_PREFIXES = ['phase ', 'shared ', 'local ', 'scoped ', 'swarm ', 'ui ', 'test '];
const LOCAL_POST_HINTS = [
  'review before', 'review of', 'iterate safely', 'iterate over',
  '+ one command', '+ 1 command', 'sit between', 'operate on',
  'ship a', 'ship `template', 'share `code', 'review prose',
  'run between', 'follow ', 'handle ',
];
const HEADLINE_PRE_HINTS = [
  'ships the claude code baseline (', 'drop-in scaffold', '<strong>',
  'ships ', 'baseline (', 'delivers ', 'twenty-', 'fourteen ',
  'ten ', 'eleven ',
];

export function classifyMatch(text, matchIndex, matchEnd) {
  const pre = text.slice(Math.max(0, matchIndex - 80), matchIndex).toLowerCase();
  const post = text.slice(matchEnd, matchEnd + 80).toLowerCase();
  for (const h of LOCAL_POST_HINTS) if (post.includes(h)) return 'LOCAL';
  const trimmed = post.replace(/^\s+/, '');
  if (trimmed.startsWith(':') && post.slice(0, 40).includes('\n')) return 'LOCAL';
  if (matchIndex < 1200) return 'HEADLINE';
  for (const h of HEADLINE_PRE_HINTS) if (pre.includes(h)) return 'HEADLINE';
  return 'AMBIGUOUS';
}
