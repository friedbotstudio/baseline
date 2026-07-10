// harness-notify — Foundation layer (pure decision/compose + OS-native delivery edge).
//
// CO-D notifier: the harness pings the human at a yield (consent gate / failure),
// batched, OS-agnostic, dependency-light. Exercises .claude/skills/harness/notify.mjs.
//
// RED until /implement creates shouldNotify / composeNotification / chooseDispatch /
// deliver / emit.
//
// on_stop extension (notifier-on-stop): a Stop-event mode that pings on genuine
// session-idle, not only at yields. RED until /implement adds stopModeShouldNotify /
// resolveOnStop / composeStopNotification / emitStop. Emit-mode stays byte-identical.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const NOTIFY_PATH = path.join(REPO_ROOT, '.claude/skills/harness/notify.mjs');

let mod;
try {
  mod = await import(NOTIFY_PATH);
} catch (err) {
  throw new Error(
    `Cannot import .claude/skills/harness/notify.mjs (RED expected pre-/implement). Original: ${err.message}`
  );
}

function fn(name) {
  assert.equal(typeof mod[name], 'function', `expected named export \`${name}\` to be a function`);
  return mod[name];
}

// Real fixture: a throwaway repo root carrying .claude/state + .claude/project.json.
function makeRoot({ state, config } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-'));
  fs.mkdirSync(path.join(root, '.claude/state/harness'), { recursive: true });
  if (state !== undefined) {
    fs.writeFileSync(path.join(root, '.claude/state/harness_state'), JSON.stringify(state));
  }
  fs.writeFileSync(
    path.join(root, '.claude/project.json'),
    JSON.stringify(config ?? { velocity: { notifier: { enabled: true } } })
  );
  return root;
}

// Capture what deliver writes to stderr without mocking internal code — process.stderr
// is the OS boundary, restored immediately after.
function captureStderr(thunk) {
  const original = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  try {
    const result = thunk();
    return { result, captured };
  } finally {
    process.stderr.write = original;
  }
}

describe('shouldNotify', () => {
  // AC-001
  it('test_when_state_yielded_and_flag_on_then_shouldNotify_true', () => {
    assert.equal(fn('shouldNotify')('yielded', {}), true);
  });
  // AC-002
  it('test_when_state_continue_then_shouldNotify_false', () => {
    assert.equal(fn('shouldNotify')('continue', {}), false);
  });
  // AC-002
  it('test_when_state_done_then_shouldNotify_false', () => {
    assert.equal(fn('shouldNotify')('done', {}), false);
  });
  // AC-005
  it('test_when_flag_disabled_then_shouldNotify_false', () => {
    assert.equal(fn('shouldNotify')('yielded', { velocity: { notifier: { enabled: false } } }), false);
  });
});

describe('composeNotification', () => {
  // AC-001
  it('test_when_compose_single_need_then_body_names_slug_and_action', () => {
    const msg = fn('composeNotification')({
      state: 'yielded',
      slug: 'co-d-notifier',
      reason: 'yielded at /approve-spec',
    });
    assert.equal(typeof msg.title, 'string');
    assert.equal(typeof msg.body, 'string');
    assert.ok(msg.body.includes('co-d-notifier'), 'body names the slug');
    assert.ok(msg.body.includes('/approve-spec'), 'body names the action');
  });
  // AC-004
  it('test_when_compose_multiple_needs_then_one_batched_message', () => {
    const msg = fn('composeNotification')({
      state: 'yielded',
      slug: 'co-d-notifier',
      reason: 'yielded at /approve-spec; 3 open questions',
    });
    assert.equal(typeof msg.body, 'string', 'a single string, not an array of messages');
    assert.ok(msg.body.includes('/approve-spec'), 'lists the gate need');
    assert.ok(msg.body.includes('open questions'), 'lists the open-questions need in the SAME message');
  });
  // AC-008
  it('test_when_compose_then_title_is_clean_and_body_action_first', () => {
    const msg = fn('composeNotification')({
      state: 'yielded',
      slug: 'co-d-notifier',
      reason: 'yielded at /grant-commit',
    });
    assert.equal(msg.title, 'Claude Code', 'clean product title, no slug in title');
    assert.ok(msg.body.includes('co-d-notifier'), 'body names the slug');
    assert.ok(msg.body.includes('/grant-commit'), 'body names the literal action token');
    assert.ok(!msg.body.startsWith('yielded at'), 'the raw yielded-at prefix is stripped');
  });
});

describe('click-to-focus (AC-007)', () => {
  // AC-007
  it('test_when_darwin_terminalnotifier_then_activate_argv_from_termprogram', () => {
    const argv = fn('chooseDispatch')('darwin', { terminalNotifier: true, osascript: true }, { termProgram: 'iTerm.app' });
    assert.ok(Array.isArray(argv));
    assert.equal(argv[0], 'terminal-notifier');
    assert.ok(argv.includes('-activate'), 'carries an -activate flag for click-to-focus');
    assert.ok(argv.includes('com.googlecode.iterm2'), 'activates the iTerm bundle id from $TERM_PROGRAM');
  });
  // AC-007
  it('test_when_terminalnotifier_absent_then_falls_through_to_osascript', () => {
    const argv = fn('chooseDispatch')('darwin', { terminalNotifier: false, osascript: true }, {});
    assert.equal(argv[0], 'osascript', 'no terminal-notifier → non-clickable osascript, no dependency');
  });
  // AC-007
  it('test_when_bundleIdFor_maps_known_terminals_else_null', () => {
    const b = fn('bundleIdFor');
    assert.equal(b('Apple_Terminal'), 'com.apple.Terminal');
    assert.equal(b('vscode'), 'com.microsoft.VSCode');
    assert.equal(b('iTerm.app'), 'com.googlecode.iterm2');
    assert.equal(b('some-unknown-term'), null, 'unknown → null (omit -activate)');
  });
});

describe('chooseDispatch', () => {
  // AC-006
  it('test_when_darwin_osascript_then_chooseDispatch_osascript_argv', () => {
    const argv = fn('chooseDispatch')('darwin', { osascript: true });
    assert.ok(Array.isArray(argv));
    assert.equal(argv[0], 'osascript');
  });
  // AC-006
  it('test_when_linux_notifysend_then_chooseDispatch_notifysend_argv', () => {
    const argv = fn('chooseDispatch')('linux', { notifySend: true });
    assert.ok(Array.isArray(argv));
    assert.equal(argv[0], 'notify-send');
  });
  // AC-006
  it('test_when_win32_powershell_then_chooseDispatch_powershell_argv', () => {
    const argv = fn('chooseDispatch')('win32', { powershell: true });
    assert.ok(Array.isArray(argv));
    assert.match(argv[0], /powershell|pwsh/);
  });
  // AC-003
  it('test_when_unsupported_platform_then_chooseDispatch_null', () => {
    assert.equal(fn('chooseDispatch')('freebsd', {}), null, 'unsupported OS → null');
    assert.equal(fn('chooseDispatch')('darwin', { osascript: false }), null, 'absent notifier → null');
  });
});

describe('deliver', () => {
  // AC-003
  it('test_when_deliver_null_argv_then_terminal_fallback_dispatched', () => {
    const { result, captured } = captureStderr(() => fn('deliver')({ title: 't', body: 'b' }, null));
    assert.deepEqual(result, { dispatched: true, channel: 'terminal' });
    assert.ok(captured.length > 0, 'terminal fallback writes to stderr');
  });
  // AC-003
  it('test_when_deliver_spawn_error_then_terminal_fallback_no_throw', () => {
    const { result } = captureStderr(() =>
      fn('deliver')({ title: 't', body: 'b' }, ['definitely-not-a-real-binary-xyz', 'arg'])
    );
    assert.deepEqual(result, { dispatched: true, channel: 'terminal' }, 'ENOENT spawn → terminal fallback, no throw');
  });
});

describe('emit', () => {
  // AC-001
  it('test_when_emit_yielded_then_one_dispatch_exit0', () => {
    const root = makeRoot({ state: { state: 'yielded', slug: 'co-d-notifier', reason: 'yielded at /approve-spec' } });
    const code = fn('emit')(['emit', '--slug', 'co-d-notifier'], { rootDir: root });
    assert.equal(code, 0);
  });
  // AC-002
  it('test_when_emit_unreadable_state_then_noop_exit0', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-empty-'));
    const code = fn('emit')(['emit', '--slug', 'co-d-notifier'], { rootDir: root });
    assert.equal(code, 0, 'absent harness_state → no-op exit 0, never throws');
  });
  // AC-002
  it('test_when_emit_state_continue_then_no_dispatch_exit0', () => {
    const root = makeRoot({ state: { state: 'continue', slug: 'co-d-notifier', reason: 'spec done; next: tdd' } });
    const code = fn('emit')(['emit', '--slug', 'co-d-notifier'], { rootDir: root });
    assert.equal(code, 0, 'ordinary transition → exit 0, no notification');
  });
});

// ── on_stop extension (notifier-on-stop) ──────────────────────────────────

function readLog(root, slug) {
  const p = path.join(root, '.claude/state/harness', `${slug}.log`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

describe('stopModeShouldNotify (idle-stop truth table)', () => {
  const f = () => fn('stopModeShouldNotify');
  it('test_when_onstop_always_then_notifies_on_any_stop', () => {
    // 'always' pings on every real stop regardless of loop/marker/stop_hook_active.
    assert.equal(f()({ onStop: 'always', stopHookActive: true, state: 'continue', markerExists: true }), true);
    assert.equal(f()({ onStop: 'always', stopHookActive: false, state: 'done', markerExists: false }), true);
  });
  it('test_when_onstop_yielded_then_never_notifies_on_stop', () => {
    // default-preserving policy: no stop-mode notifications even when genuinely idle.
    assert.equal(f()({ onStop: 'yielded', stopHookActive: false, state: 'done', markerExists: false }), false);
  });
  it('test_when_onstop_unknown_then_never_notifies_on_stop', () => {
    // any non-idle/non-always value is treated as "no stop notifications" (fail-quiet).
    assert.equal(f()({ onStop: 'bogus', stopHookActive: false, state: 'done', markerExists: false }), false);
  });
  it('test_when_onstop_idle_and_stophookactive_then_silent', () => {
    // mid-continuation: a stop_hook_active stop is not idle.
    assert.equal(f()({ onStop: 'idle', stopHookActive: true, state: 'done', markerExists: false }), false);
  });
  it('test_when_onstop_idle_and_loop_alive_then_silent', () => {
    // harness loop alive (state=continue AND marker present) — inverse of continuation Path A.
    assert.equal(f()({ onStop: 'idle', stopHookActive: false, state: 'continue', markerExists: true }), false);
  });
  it('test_when_onstop_idle_and_state_yielded_then_silent', () => {
    // already notified at the yield via emit-mode; the gate-resume window too.
    assert.equal(f()({ onStop: 'idle', stopHookActive: false, state: 'yielded', markerExists: false }), false);
  });
  it('test_when_onstop_idle_and_state_done_then_notifies', () => {
    // workflow complete → genuine idle → ping.
    assert.equal(f()({ onStop: 'idle', stopHookActive: false, state: 'done', markerExists: false }), true);
  });
  it('test_when_onstop_idle_and_no_state_then_notifies', () => {
    // plain chat turn end (no harness_state) → idle → ping.
    assert.equal(f()({ onStop: 'idle', stopHookActive: false, state: undefined, markerExists: false }), true);
  });
  it('test_when_onstop_idle_and_continue_without_marker_then_notifies', () => {
    // state=continue but marker gone → continuation would NOT re-fire → idle/interrupted → ping.
    assert.equal(f()({ onStop: 'idle', stopHookActive: false, state: 'continue', markerExists: false }), true);
  });
});

describe('resolveOnStop', () => {
  it('test_when_on_stop_key_absent_then_resolveonstop_returns_yielded', () => {
    // read-time default preserves today's behavior for un-upgraded configs.
    assert.equal(fn('resolveOnStop')({ velocity: { notifier: { enabled: true } } }), 'yielded');
    assert.equal(fn('resolveOnStop')(undefined), 'yielded');
    assert.equal(fn('resolveOnStop')({}), 'yielded');
  });
  it('test_when_on_stop_set_then_resolveonstop_returns_it', () => {
    assert.equal(fn('resolveOnStop')({ velocity: { notifier: { on_stop: 'idle' } } }), 'idle');
    assert.equal(fn('resolveOnStop')({ velocity: { notifier: { on_stop: 'always' } } }), 'always');
    assert.equal(fn('resolveOnStop')({ velocity: { notifier: { on_stop: 'yielded' } } }), 'yielded');
  });
});

describe('composeStopNotification', () => {
  it('test_when_slug_present_then_stop_body_names_slug', () => {
    const msg = fn('composeStopNotification')({ slug: 'notifier-on-stop', state: 'done' });
    assert.equal(msg.title, 'Claude Code', 'clean product title, no slug in title');
    assert.ok(msg.body.includes('notifier-on-stop'), 'body names the slug');
    assert.ok(/idle/i.test(msg.body), 'body communicates idle/your-turn');
  });
  it('test_when_slug_absent_then_stop_body_generic', () => {
    const msg = fn('composeStopNotification')({});
    assert.equal(msg.title, 'Claude Code');
    assert.equal(typeof msg.body, 'string');
    assert.ok(msg.body.length > 0, 'generic idle body present');
    assert.ok(!msg.body.includes('undefined'), 'no leaked undefined slug');
  });
});

describe('emitStop (stop-mode orchestration)', () => {
  it('test_when_notifier_disabled_then_stop_mode_short_circuits', () => {
    const root = makeRoot({
      state: { state: 'done', slug: 'x' },
      config: { velocity: { notifier: { enabled: false, on_stop: 'idle' } } },
    });
    const { result, captured } = captureStderr(() =>
      fn('emitStop')(['stop'], { rootDir: root, payload: { stop_hook_active: false } })
    );
    assert.equal(result, 0, 'always exits 0');
    assert.equal(captured, '', 'disabled → no terminal fallback banner');
    assert.ok(!readLog(root, 'x').includes('notified'), 'disabled → never dispatched');
  });
  it('test_when_stop_mode_idle_and_done_then_delivers', () => {
    const root = makeRoot({
      state: { state: 'done', slug: 'x' },
      config: { velocity: { notifier: { enabled: true, on_stop: 'idle' } } },
    });
    // Delivery goes through the OS boundary (osascript/notify-send/terminal); channel varies
    // by platform, but a genuine idle-stop MUST attempt delivery and log it. Never throws.
    const code = captureStderr(() =>
      fn('emitStop')(['stop'], { rootDir: root, payload: { stop_hook_active: false } })
    ).result;
    assert.equal(code, 0);
    assert.ok(/notified/.test(readLog(root, 'x')), 'idle stop under on_stop=idle attempts delivery');
  });
  it('test_when_stop_mode_loop_alive_then_silent', () => {
    // state=continue + marker present → harness loop alive → no notification.
    const root = makeRoot({
      state: { state: 'continue', slug: 'x' },
      config: { velocity: { notifier: { enabled: true, on_stop: 'idle' } } },
    });
    fs.writeFileSync(path.join(root, '.claude/state/.harness_active'), 'x\n');
    const { result, captured } = captureStderr(() =>
      fn('emitStop')(['stop'], { rootDir: root, payload: { stop_hook_active: false } })
    );
    assert.equal(result, 0);
    assert.equal(captured, '', 'loop-alive → no terminal banner');
    assert.ok(!readLog(root, 'x').includes('notified'), 'loop-alive → never dispatched');
  });
});

describe('emit-mode unchanged (regression)', () => {
  it('test_when_emit_mode_unchanged_then_yield_path_still_notifies', () => {
    // adding on_stop to the config must not perturb the yield path.
    assert.equal(
      fn('shouldNotify')('yielded', { velocity: { notifier: { enabled: true, on_stop: 'idle' } } }),
      true,
      'yield-path shouldNotify is independent of on_stop',
    );
    const root = makeRoot({
      state: { state: 'yielded', slug: 'co-d-notifier', reason: 'yielded at /grant-commit' },
      config: { velocity: { notifier: { enabled: true, on_stop: 'idle' } } },
    });
    assert.equal(fn('emit')(['emit', '--slug', 'co-d-notifier'], { rootDir: root }), 0, 'emit still exits 0');
  });
});

describe('dependency-light (U6, AC-003)', () => {
  // AC-003
  it('test_when_no_new_package_dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@clack/prompts'], 'no new runtime dependency');
  });
  // AC-003
  it('test_when_notify_imports_only_node_builtins', () => {
    const src = fs.readFileSync(NOTIFY_PATH, 'utf8');
    const importRe = /^\s*import\s+[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      assert.ok(m[1].startsWith('node:'), `notify.mjs imports only node: builtins, found "${m[1]}"`);
    }
  });
});
