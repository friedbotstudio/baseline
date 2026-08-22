// Foundation: can this host carry a message to another session?
//
// Every branch that is not a clear yes resolves unavailable. An accelerator that
// guesses available and is wrong makes a peer wait for a message that will never
// arrive, which is strictly worse than never promising one.

// Cross-session messaging landed in this version, runs on these platforms only,
// and is absent wherever feature-flag evaluation is off or the session runs
// against a cloud provider rather than the first-party host.
export const MIN_HOST_VERSION = '2.1.224';
const SUPPORTED_PLATFORMS = Object.freeze(['darwin', 'linux']);
const DISABLING_ENV = Object.freeze([
  'DISABLE_TELEMETRY',
  'DO_NOT_TRACK',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'DISABLE_GROWTHBOOK',
]);
const CLOUD_PROVIDER_ENV = Object.freeze([
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]);

function parseVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function atLeast(version, floor) {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > floor[i]) return true;
    if (version[i] < floor[i]) return false;
  }
  return true;
}

const truthy = (v) => typeof v === 'string' && v !== '' && v !== '0' && v.toLowerCase() !== 'false';

/**
 * Decide whether this host can carry a pointer to another session.
 *
 * Every branch that is not a clear yes returns `available: false` with a reason.
 * An accelerator that guesses available and is wrong makes a peer wait for a
 * message that will never arrive — strictly worse than never promising one.
 */
export function probeNativeMessaging({ platform, version, env } = {}) {
  const environment = env && typeof env === 'object' ? env : {};

  if (typeof platform !== 'string' || platform === '') {
    return { available: false, reason: 'platform unknown' };
  }
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return { available: false, reason: `platform ${platform} does not carry cross-session messages` };
  }

  const parsed = parseVersion(version);
  if (parsed === null) return { available: false, reason: 'host version unreadable' };
  if (!atLeast(parsed, parseVersion(MIN_HOST_VERSION))) {
    return { available: false, reason: `host ${version} predates ${MIN_HOST_VERSION}` };
  }

  for (const key of DISABLING_ENV) {
    if (truthy(environment[key])) return { available: false, reason: `${key} disables message delivery` };
  }
  for (const key of CLOUD_PROVIDER_ENV) {
    if (truthy(environment[key])) return { available: false, reason: `${key}: cloud providers carry no cross-session messages` };
  }

  return { available: true, reason: 'host carries cross-session messages' };
}
