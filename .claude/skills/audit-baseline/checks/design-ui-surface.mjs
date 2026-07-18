// Article XI.2 / design-ui orchestrator surface — the design-task routing rule
// in CLAUDE.md (and its template mirror), the design-ui orchestrator role, and
// the spec_design_calls_guard hook presence + wiring.
export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { readText, settingsText } = ctx;

  if (readText('CLAUDE.md').includes('### XI.2 Design-task routing')) {
    add('CLAUDE.md: Article XI.2 present', 'PASS', 'design-task routing rule declared');
  } else {
    add('CLAUDE.md: Article XI.2 present', 'FAIL', 'missing `### XI.2 Design-task routing` heading — Article XI.2 is the structural seam between design-ui and impeccable');
  }

  if (!ctx.skipSrc) {
    if (readText('src/CLAUDE.template.md').includes('### XI.2 Design-task routing')) {
      add('src/CLAUDE.template.md: Article XI.2 mirrors', 'PASS', '');
    } else {
      add('src/CLAUDE.template.md: Article XI.2 mirrors', 'FAIL', 'src template does not contain Article XI.2 — template-drift will fail');
    }
  }

  if (/^description:.*orchestrat/im.test(readText('.claude/skills/design-ui/SKILL.md'))) {
    add('design-ui SKILL.md: orchestrator role', 'PASS', 'frontmatter description names orchestrator role');
  } else {
    add('design-ui SKILL.md: orchestrator role', 'FAIL', "frontmatter description must mention 'orchestrat' — the v1 code-writing role is retired");
  }

  const hookRel = ctx.exists('.claude/hooks/spec_design_calls_guard.mjs')
    ? '.claude/hooks/spec_design_calls_guard.mjs'
    : '.claude/hooks/spec_design_calls_guard.sh';
  const hookWired = settingsText.includes('spec_design_calls_guard.sh') || settingsText.includes('spec_design_calls_guard.mjs');
  const hookExists = ctx.exists(hookRel);
  const hookExec = hookExists && ctx.accessX(hookRel);
  if (hookExists && hookExec && hookWired) {
    add('spec_design_calls_guard: present + wired', 'PASS', `${hookRel.split('/').pop()} executable and wired in PreToolUse Write|Edit|MultiEdit chain`);
  } else {
    const detail = [];
    if (!hookExists) detail.push('hook script missing');
    else if (!hookExec) detail.push('hook not executable');
    if (!hookWired) detail.push('not wired in .claude/settings.json');
    add('spec_design_calls_guard: present + wired', 'FAIL', detail.join('; '));
  }
  return rows;
}
