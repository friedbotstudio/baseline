// Foundation — ## Decisions section markdown writer (AC-005, AC-006).
// Renders engineer-verbatim rationale as > blockquote so it stands out from
// Claude's prose. Pure string formatting.

export function writeDecisionsSection(decisions) {
  const lines = ['## Decisions', ''];

  if (!decisions || decisions.length === 0) {
    lines.push('*(none)*', '');
    return lines.join('\n');
  }

  for (const d of decisions) {
    const name = d.decision_name || d.name;
    lines.push(`### Decision: ${name}`, '');

    if (Array.isArray(d.options_considered) && d.options_considered.length) {
      lines.push(`**Options considered:** ${d.options_considered.join(' / ')}`);
    }
    lines.push(`**Chosen:** ${d.chosen}`);

    if (d.verbatim) {
      lines.push('**Engineer rationale (verbatim):**');
      for (const v of String(d.verbatim).split('\n')) {
        lines.push(`> ${v}`);
      }
    }

    if (Array.isArray(d.dismissed_alternatives) && d.dismissed_alternatives.length) {
      lines.push('', '**Dismissed alternatives:**');
      for (const alt of d.dismissed_alternatives) {
        lines.push(`- ${alt.option} — ${alt.reason}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function extractDecisions(specMarkdown) {
  const m = /^## Decisions\s*$([\s\S]*?)(?=^##\s|\Z)/m.exec(specMarkdown);
  return m ? m[1].trim() : null;
}
