// roadmap-append — pure text->text transforms that add an epic section to the plan.
// Foundation: the heading/row grammar. Domain: appendEpic, the additive-only merge.
// The grammar mirrors roadmap/parse.mjs and sync.mjs; those two mutate rows that
// already exist, this one is the only writer that creates them.

const PLANNED = '⬜';
const IN_PROGRESS = '🟡';
const DONE = '✅';

const EPIC_HEADING = /^## Epic (\d+) — (.*)$/;
const TAG = /\(([^)]*)\)\s*$/;
const SLICE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const STATUS_EMOJI = /⬜|🟡|✅/u;

// Security review 2026-08-15 (MEDIUM, CWE-74): a title carrying a status emoji
// wins over the real marker, because parseRoadmap reads the EARLIEST emoji on the
// heading — a planned epic then reports as shipped. A newline forges a whole
// heading or row. Reject rather than sanitise: this is the only site that creates
// headings, so it is the only place the one-emoji-per-heading contract is
// enforceable. Same call as workspace/render.mjs and shards.mjs.
function assertInert(value, field) {
  const text = String(value ?? '');
  if (/[\r\n]/.test(text)) throw new Error(`roadmap-append: ${field} must not contain a newline`);
  if (STATUS_EMOJI.test(text)) throw new Error(`roadmap-append: ${field} must not contain a status emoji`);
}

// --- Foundation: read the epic headings already on the plan ------------------

function epicHeadings(text) {
  const headings = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = EPIC_HEADING.exec(line);
    if (m) headings.push({ num: Number(m[1]), tag: TAG.exec(m[2])?.[1]?.trim() ?? null });
  }
  return headings;
}

export function nextEpicNumber(text) {
  const nums = epicHeadings(text).map((h) => h.num);
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

export function epicPresent(text, slug) {
  return epicHeadings(text).some((h) => h.tag === slug);
}

// --- Foundation: the heading emoji a body of rows implies --------------------

function impliedHeadingStatus(slices) {
  const statuses = slices.map((s) => s.status ?? PLANNED);
  if (statuses.length === 0 || statuses.every((s) => s === PLANNED)) return PLANNED;
  if (statuses.every((s) => s === DONE)) return DONE;
  return IN_PROGRESS;
}

// --- Domain: render one epic section -----------------------------------------

export function renderEpicSection({ num, title, tag, summary, slices = [] }) {
  assertInert(title, 'epic title');
  assertInert(tag, 'epic tag');
  for (const slice of slices) {
    if (!SLICE_ID.test(String(slice.id ?? ''))) {
      throw new Error(`roadmap-append: slice id ${JSON.stringify(slice.id)} must match ${SLICE_ID}`);
    }
    assertInert(slice.title, `slice ${slice.id} title`);
  }

  const lines = [`## Epic ${num} — ${title}  ${impliedHeadingStatus(slices)}  (${tag})`, ''];
  if (summary) lines.push(summary, '');
  for (const slice of slices) lines.push(`- ${slice.status ?? PLANNED} ${slice.id}. ${slice.title}`);
  lines.push('');
  return lines.join('\n');
}

// --- Domain: additive-only merge, deduped on the slug tag --------------------

export function appendEpic(text, { slug, title, summary, slices = [] }) {
  const body = String(text ?? '');
  if (epicPresent(body, slug)) return { text: body, changed: false, epicNum: null };

  const epicNum = nextEpicNumber(body);
  const section = renderEpicSection({ num: epicNum, title, tag: slug, summary, slices });
  const separator = body.endsWith('\n') ? '' : '\n';
  return { text: `${body}${separator}${section}`, changed: true, epicNum };
}
