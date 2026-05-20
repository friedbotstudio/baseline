// Foundation — line-level unified-diff renderer used by the upgrade TUI's
// "Show diff" prompt. Pure function; no IO, no side effects.

const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_RESET = '\x1b[0m';

export function renderUnifiedDiff(localText, incomingText, opts = {}) {
  const colorize = opts.colorize === true;
  const ops = diffLines(splitLines(localText), splitLines(incomingText));
  return ops.map((op) => renderOp(op, colorize)).join('\n');
}

function splitLines(text) {
  return String(text).split('\n');
}

function renderOp(op, colorize) {
  if (op.kind === 'context') return ' ' + op.line;
  const marker = op.kind === 'remove' ? '-' : '+';
  if (!colorize) return marker + op.line;
  const color = op.kind === 'remove' ? ANSI_RED : ANSI_GREEN;
  return color + marker + op.line + ANSI_RESET;
}

function diffLines(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: 'context', line: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: 'remove', line: a[i - 1] });
      i--;
    } else {
      ops.push({ kind: 'add', line: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { ops.push({ kind: 'remove', line: a[i - 1] }); i--; }
  while (j > 0) { ops.push({ kind: 'add', line: b[j - 1] }); j--; }
  return ops.reverse();
}
