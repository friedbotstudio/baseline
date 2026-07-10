// notify.mjs — CO-D notifier (Foundation).
//
// Pings the human when the harness yields for attention (consent gate / failure).
// OS-agnostic: native notifier where one exists (osascript / notify-send /
// PowerShell balloon), universal terminal fallback (BEL + stderr) elsewhere.
// Stdlib only (U6). Never throws, always exits 0 — a notifier must never stall
// the harness loop. Fires only on harness_state.state === "yielded".

import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { platform as osPlatform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// --- decision (pure) ---

export function shouldNotify(state, config) {
  return config?.velocity?.notifier?.enabled !== false && state === 'yielded';
}

export function composeNotification(harnessState) {
  const slug = harnessState?.slug ?? 'workflow';
  const core = String(harnessState?.reason ?? 'needs your attention').replace(/^yielded at\s+/, '');
  return { title: 'Claude Code', body: `${slug} needs your attention: ${core}` };
}

// --- stop-mode decision (pure) ---
//
// on_stop policy: pings on a genuine session-idle Stop, not only at a yield.
//   'yielded' (default) — no stop-mode notifications; the yield path is unchanged.
//   'idle'             — notify when the session truly hands control back.
//   'always'           — notify on every real stop.
// The idle case is the inverse of harness_continuation's "will I re-fire?": a loop
// that is alive (state=continue + marker) or a mid-continuation stop is NOT idle,
// and a yielded stop was already announced by the emit path.
export function resolveOnStop(config) {
  const v = config?.velocity?.notifier?.on_stop;
  return typeof v === 'string' ? v : 'yielded';
}

export function stopModeShouldNotify({ onStop, stopHookActive, state, markerExists }) {
  if (onStop === 'always') return true;
  if (onStop !== 'idle') return false;
  if (stopHookActive) return false;
  if (state === 'continue' && markerExists) return false;
  if (state === 'yielded') return false;
  return true;
}

export function composeStopNotification(harnessState) {
  const slug = harnessState?.slug;
  const body = slug ? `${slug}: Claude is idle - your turn` : 'Claude is idle - your turn';
  return { title: 'Claude Code', body };
}

// --- dispatch selection (pure) ---

const TERMINAL_BUNDLE_IDS = {
  Apple_Terminal: 'com.apple.Terminal',
  'iTerm.app': 'com.googlecode.iterm2',
  vscode: 'com.microsoft.VSCode',
  Hyper: 'co.zeit.hyper',
  WezTerm: 'com.github.wez.wezterm',
};

export function bundleIdFor(termProgram) {
  return TERMINAL_BUNDLE_IDS[termProgram] ?? null;
}

export function chooseDispatch(platform, avail, env = {}) {
  if (platform === 'darwin' && avail?.terminalNotifier) {
    const bundleId = bundleIdFor(env.termProgram);
    return bundleId ? ['terminal-notifier', '-activate', bundleId] : ['terminal-notifier'];
  }
  if (platform === 'darwin' && avail?.osascript) return ['osascript', '-e'];
  if (platform === 'linux' && avail?.notifySend) return ['notify-send'];
  if (platform === 'win32' && avail?.powershell) return ['powershell', '-NoProfile', '-NonInteractive', '-Command'];
  return null;
}

// --- shell escaping (Foundation) ---

function asAppleScriptString(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function balloonScript({ title, body }) {
  const t = String(title).replace(/'/g, "''");
  const b = String(body).replace(/'/g, "''");
  return (
    "Add-Type -AssemblyName System.Windows.Forms;" +
    "$n=New-Object System.Windows.Forms.NotifyIcon;" +
    "$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;" +
    `$n.ShowBalloonTip(3000,'${t}','${b}',[System.Windows.Forms.ToolTipIcon]::Info);` +
    'Start-Sleep -Milliseconds 2500;$n.Dispose()'
  );
}

function completeArgv(msg, argv) {
  if (argv[0] === 'terminal-notifier') return argv.concat(['-title', msg.title, '-message', msg.body]);
  if (argv[0] === 'osascript') {
    return argv.concat([`display notification ${asAppleScriptString(msg.body)} with title ${asAppleScriptString(msg.title)}`]);
  }
  if (argv[0] === 'notify-send') return argv.concat([msg.title, msg.body]);
  return argv.concat([balloonScript(msg)]);
}

// --- delivery edge ---

function fallbackToTerminal(msg) {
  process.stderr.write(`\x07\n🔔 ${msg.title}: ${msg.body}\n`);
  return { dispatched: true, channel: 'terminal' };
}

export function deliver(msg, argv) {
  if (argv === null) return fallbackToTerminal(msg);
  try {
    const [cmd, ...rest] = completeArgv(msg, argv);
    const result = spawnSync(cmd, rest, { timeout: 5000, stdio: 'ignore' });
    if (result.error || result.status !== 0) return fallbackToTerminal(msg);
    return { dispatched: true, channel: argv[0] };
  } catch {
    return fallbackToTerminal(msg);
  }
}

// --- availability probe (Foundation) ---

function onPath(bin) {
  const names = process.platform === 'win32' ? [`${bin}.exe`, `${bin}.cmd`, bin] : [bin];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      if (existsSync(join(dir, name))) return true;
    }
  }
  return false;
}

function probeAvail() {
  return {
    terminalNotifier: onPath('terminal-notifier'),
    osascript: onPath('osascript'),
    notifySend: onPath('notify-send'),
    powershell: onPath('powershell') || onPath('pwsh'),
  };
}

// --- orchestration entry ---

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function logLine(rootDir, slug, message) {
  try {
    const dir = join(rootDir, '.claude/state/harness');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${slug}.log`), `${new Date().toISOString()} notify: ${message}\n`);
  } catch {}
}

export function emit(argv, opts = {}) {
  try {
    const rootDir = opts.rootDir || process.cwd();
    const flagIdx = argv.indexOf('--slug');
    let state, config;
    try {
      state = readJson(join(rootDir, '.claude/state/harness_state'));
      config = readJson(join(rootDir, '.claude/project.json'));
    } catch {
      return 0;
    }
    const slug = flagIdx >= 0 ? argv[flagIdx + 1] : state.slug;
    if (!shouldNotify(state.state, config)) {
      logLine(rootDir, slug, `skipped ${state.state}`);
      return 0;
    }
    const dispatch = chooseDispatch(osPlatform(), probeAvail(), { termProgram: process.env.TERM_PROGRAM });
    const result = deliver(composeNotification(state), dispatch);
    logLine(rootDir, slug, `notified ${result.channel}`);
    return 0;
  } catch {
    return 0;
  }
}

export function emitStop(argv, opts = {}) {
  try {
    const rootDir = opts.rootDir || process.cwd();
    let config;
    try {
      config = readJson(join(rootDir, '.claude/project.json'));
    } catch {
      return 0;
    }
    let state;
    try {
      state = readJson(join(rootDir, '.claude/state/harness_state'));
    } catch {
      state = undefined;
    }
    const slug = state?.slug || 'session';
    if (config?.velocity?.notifier?.enabled === false) {
      logLine(rootDir, slug, 'stop skipped disabled');
      return 0;
    }
    const decision = stopModeShouldNotify({
      onStop: resolveOnStop(config),
      stopHookActive: opts.payload?.stop_hook_active === true,
      state: state?.state,
      markerExists: existsSync(join(rootDir, '.claude/state/.harness_active')),
    });
    if (!decision) {
      logLine(rootDir, slug, `stop silent ${state?.state ?? 'no-state'}`);
      return 0;
    }
    const dispatch = chooseDispatch(osPlatform(), probeAvail(), { termProgram: process.env.TERM_PROGRAM });
    const result = deliver(composeStopNotification(state), dispatch);
    logLine(rootDir, slug, `stop notified ${result.channel}`);
    return 0;
  } catch {
    return 0;
  }
}

function readStdinPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'stop') {
    process.exit(emitStop(argv, { payload: readStdinPayload() }));
  }
  process.exit(emit(argv));
}
