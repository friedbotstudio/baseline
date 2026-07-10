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

// --- attention-mode + presence (pure) ---
//
// Attention mode pings when the session is BLOCKED on the human: an AskUserQuestion
// prompt (PreToolUse), a permission dialog or idle-input (the Notification event).
// Presence-aware suppression keeps all idle/attention pings silent while the user is
// actually watching the terminal — fail-open, so any unknown signal notifies.
export function resolveAttention(config) {
  return config?.velocity?.notifier?.attention !== false;
}

export function resolvePresence(config) {
  const v = config?.velocity?.notifier?.presence;
  return typeof v === 'string' ? v : 'always';
}

export function resolvePresentIdleSeconds(config) {
  const v = Number(config?.velocity?.notifier?.present_idle_seconds);
  return Number.isFinite(v) ? v : 60;
}

export function presenceSuppresses({ presence, idleSeconds, frontmostBundleId, terminalBundleId, thresholdSeconds }) {
  if (presence !== 'aware') return false;
  if (typeof frontmostBundleId !== 'string' || typeof terminalBundleId !== 'string') return false;
  if (frontmostBundleId !== terminalBundleId) return false;
  if (typeof idleSeconds !== 'number') return false;
  return idleSeconds <= thresholdSeconds;
}

export function composeAttentionNotification(payload) {
  const message = payload?.message;
  const question = payload?.tool_input?.questions?.[0];
  let body;
  if (typeof message === 'string' && message.length > 0) body = message;
  else if (question) body = `Claude is asking: ${question.header || question.question}`;
  else body = 'Claude is waiting for your input';
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

// --- presence probe (Foundation, macOS-first; nulls elsewhere) ---

function macIdleSeconds() {
  const r = spawnSync('ioreg', ['-c', 'IOHIDSystem'], { encoding: 'utf8', timeout: 5000 });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  let ns = null;
  const re = /"HIDIdleTime"\s*=\s*(\d+)/g;
  let m;
  while ((m = re.exec(r.stdout)) !== null) ns = Number(m[1]);
  return ns !== null && Number.isFinite(ns) ? ns / 1e9 : null;
}

function macFrontmostBundleId() {
  const front = spawnSync('lsappinfo', ['front'], { encoding: 'utf8', timeout: 5000 });
  if (front.error || front.status !== 0) return null;
  const asn = String(front.stdout || '').trim();
  if (!asn) return null;
  const info = spawnSync('lsappinfo', ['info', '-only', 'bundleID', asn], { encoding: 'utf8', timeout: 5000 });
  if (info.error || info.status !== 0) return null;
  const m = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(String(info.stdout || ''));
  return m ? m[1] : null;
}

export function probePresence(platform) {
  try {
    if (platform !== 'darwin') return { idleSeconds: null, frontmostBundleId: null };
    return { idleSeconds: macIdleSeconds(), frontmostBundleId: macFrontmostBundleId() };
  } catch {
    return { idleSeconds: null, frontmostBundleId: null };
  }
}

// Presence gate shared by the idle-stop and attention paths: suppress only when the
// config opts into 'aware' AND the probe proves the user is watching the terminal.
function isSuppressedByPresence(config, opts) {
  if (resolvePresence(config) !== 'aware') return false;
  const probe = opts.probe || probePresence;
  const p = probe(osPlatform());
  return presenceSuppresses({
    presence: 'aware',
    idleSeconds: p.idleSeconds,
    frontmostBundleId: p.frontmostBundleId,
    terminalBundleId: bundleIdFor(process.env.TERM_PROGRAM),
    thresholdSeconds: resolvePresentIdleSeconds(config),
  });
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
    if (isSuppressedByPresence(config, opts)) {
      logLine(rootDir, slug, 'stop suppressed present');
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

export function emitAttention(argv, opts = {}) {
  try {
    const rootDir = opts.rootDir || process.cwd();
    let config;
    try {
      config = readJson(join(rootDir, '.claude/project.json'));
    } catch {
      return 0;
    }
    const slug = opts.payload?.session_id || 'attention';
    if (config?.velocity?.notifier?.enabled === false) {
      logLine(rootDir, slug, 'attention skipped disabled');
      return 0;
    }
    if (!resolveAttention(config)) {
      logLine(rootDir, slug, 'attention skipped off');
      return 0;
    }
    if (isSuppressedByPresence(config, opts)) {
      logLine(rootDir, slug, 'attention suppressed present');
      return 0;
    }
    const dispatch = chooseDispatch(osPlatform(), probeAvail(), { termProgram: process.env.TERM_PROGRAM });
    const result = deliver(composeAttentionNotification(opts.payload), dispatch);
    logLine(rootDir, slug, `attention notified ${result.channel}`);
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
  if (argv[0] === 'attention') {
    process.exit(emitAttention(argv, { payload: readStdinPayload() }));
  }
  process.exit(emit(argv));
}
