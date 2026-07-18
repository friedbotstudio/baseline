// settings.json hook wiring — the file parses and every baseline hook is wired
// into a hook chain (matched by its .sh or .mjs filename).
export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { settingsText } = ctx;
  if (!settingsText) { add('settings.json present', 'FAIL', 'missing or empty'); return rows; }
  try { JSON.parse(settingsText); add('settings.json parses', 'PASS', ''); }
  catch (e) { add('settings.json parses', 'FAIL', e.message); }
  for (const h of [...ctx.EXPECTED_HOOKS].sort()) {
    if (settingsText.includes(`${h}.sh`) || settingsText.includes(`${h}.mjs`)) add(`hook wired: ${h}`, 'PASS', '');
    else add(`hook wired: ${h}`, 'FAIL', 'not in settings.json');
  }
  return rows;
}
