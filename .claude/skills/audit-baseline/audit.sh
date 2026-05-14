#!/usr/bin/env bash
# audit-baseline — drift check between docs/init/seed.md and the implementation.
#
# Reports each check as PASS / FAIL / WARN with a short detail. Exits 0 on a
# clean audit, 1 if any FAIL. Read-only; safe to run any time, in CI, or as
# the final step of /init-project.

set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

ROOT="$ROOT" python3 <<'PY'
import json, os, re, sys
from pathlib import Path

root = Path(os.environ['ROOT'])
results = []  # (name, status, detail)

def add(name, status, detail=""):
    results.append((name, status, detail))

# ---------- expected canonical sets (mirror seed.md §4) ----------
EXPECTED_HOOKS = {
    # Write/Bash boundary guards (17)
    "setup_guard", "destructive_cmd_guard", "git_commit_guard", "env_guard",
    "spec_approval_guard", "swarm_approval_guard", "verify_pass_guard",
    "track_guard", "artifact_template_guard", "plantuml_syntax_guard",
    "spec_diagram_presence_guard", "spec_design_calls_guard",
    "swarm_boundary_guard", "tdd_order_guard",
    "process_lifecycle_guard",
    "lint_runner", "test_runner",
    # Lifecycle hooks for project memory, cross-session continuity, and
    # workflow auto-continuation (4)
    "memory_session_start", "memory_stop", "memory_pre_compact",
    "harness_continuation",
    # Input-boundary hook for consent-gate marker writes (1)
    "consent_gate_grant",
}
EXPECTED_AGENTS = {
    # The only subagent in the baseline. Workers execute pre-decided recipes
    # from main context; they never make decisions.
    "swarm-worker",
}
# Skill provenance comes from the shipped manifest at obj/template/manifest.json.
# The build (scripts/build-manifest.mjs) reads owner: frontmatter from every
# .claude/skills/<slug>/SKILL.md and emits the canonical baseline-skill set as
# manifest.owners.skills. See CLAUDE.md Article XI and seed.md §17.
def load_manifest():
    path = root / "obj/template/manifest.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def read_skill_owner(slug):
    p = root / f".claude/skills/{slug}/SKILL.md"
    if not p.exists():
        return None
    text = p.read_text(encoding="utf-8", errors="replace")
    fm = re.match(r'^---\n([\s\S]*?)\n---\n', text)
    if not fm:
        return None
    m = re.search(r'^owner:\s*(\S+)\s*$', fm.group(1), re.MULTILINE)
    return m.group(1) if m else None

EXPECTED_COMMANDS = {"approve-spec", "approve-swarm", "grant-commit", "init-project"}

EXPECTED_MEMORY_FILES = {
    # Canonical files (six)
    "landmarks", "libraries", "decisions", "landmines", "conventions",
    "pending-questions",
    # Auto-extraction inbox (one); body gitignored, file committed
    "_pending",
    # Cross-session continuity snapshot (one); written by memory_stop &
    # memory_pre_compact, read by memory_session_start. Body gitignored.
    "_resume",
}

# ---------- helpers ----------
WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19, "twenty": 20, "twenty-one": 21,
    "twenty-two": 22, "twenty-three": 23, "twenty-four": 24, "twenty-five": 25,
    "twenty-six": 26, "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29,
    "thirty": 30, "thirty-one": 31, "thirty-two": 32, "thirty-three": 33,
    "thirty-four": 34, "thirty-five": 35, "thirty-six": 36, "thirty-seven": 37,
    "thirty-eight": 38, "thirty-nine": 39, "forty": 40,
}
def to_int(s):
    s = (s or "").strip().lower()
    if s.isdigit():
        return int(s)
    return WORDS.get(s)

def read_text(rel):
    p = root / rel
    return p.read_text(encoding="utf-8") if p.exists() else ""

def read_json(rel):
    txt = read_text(rel)
    if not txt: return None
    try:
        return json.loads(txt)
    except Exception:
        return None

# ---------- project.json additions (load early so headline counts can offset) ----------
# Headline claims in seed.md / CLAUDE.md / docs.jsx describe the *baseline* shape
# ("10 subagents", "27 skills"). After /init-project adds variants and stack
# skills, the disk has more files than baseline; those additions are recorded
# under project.json → additions and accounted for separately. Without this,
# every /init-project run would leave the audit FAILing on legitimate adds.
pj = read_json(".claude/project.json")
additions             = (pj or {}).get("additions", {}) or {}
add_agents            = set(additions.get("agents", []))
add_skills            = set(additions.get("skills", []))
add_hooks             = set(additions.get("hooks", []))
add_mcp_servers       = set(additions.get("mcp_servers", []))
add_swarm_worker_skills = set(additions.get("swarm_worker_skills", []))

# ---------- on-disk inventory ----------
hooks_dir   = root / ".claude/hooks"
agents_dir  = root / ".claude/agents"
skills_dir  = root / ".claude/skills"
cmds_dir    = root / ".claude/commands"

disk_hooks    = {p.stem for p in hooks_dir.glob("*.sh")} if hooks_dir.exists() else set()
disk_agents   = {p.stem for p in agents_dir.glob("*.md")} if agents_dir.exists() else set()
disk_skills   = {p.name for p in skills_dir.iterdir() if p.is_dir()} if skills_dir.exists() else set()
disk_commands = {p.stem for p in cmds_dir.glob("*.md")} if cmds_dir.exists() else set()

# Baseline subset of disk = total - project additions. Used by every count check
# below so headline claims still compare cleanly after /init-project runs.
disk_baseline_hooks  = disk_hooks  - add_hooks
disk_baseline_agents = disk_agents - add_agents

# Skill provenance: a skill is baseline iff its SKILL.md frontmatter declares
# owner: baseline. User-added skills (owner: user) are excluded from baseline
# counts so headline claims and check_names match even after a user adds skills.
disk_baseline_skills = {s for s in disk_skills if read_skill_owner(s) == "baseline"}
disk_user_skills     = {s for s in disk_skills if read_skill_owner(s) == "user"}

# ---------- counts vs seed.md ----------
seed = read_text("docs/init/seed.md")

def find_count(*patterns):
    for pat in patterns:
        m = re.search(pat, seed, re.IGNORECASE)
        if m:
            v = to_int(m.group(1))
            if v is not None: return v
    return None

# Pull headline counts from seed.md preamble. Hooks now come in two flavours
# (write/run-boundary guards + lifecycle hooks) so the headline gives the
# total via "(seventeen .sh scripts total)" or the §4.1 heading "Hooks (17
# total — …)". Prefer those; fall back to the legacy "<N> guards" form.
NUM_WORD = r"\d+|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty"
hooks_claimed   = find_count(
    rf"\((\d+|{NUM_WORD})\s+\.sh\s+scripts?\s+total\)",          # "(seventeen .sh scripts total)"
    rf"§4\.1\s+Hooks\s+\((\d+)\s+total\b",                          # "§4.1 Hooks (17 total"
    rf"\b({NUM_WORD})\s+guards?\b",                                 # legacy "fourteen guards"
)
agents_claimed  = find_count(r"\b(\d+|one|two|three|eight|nine|ten|eleven|twelve)\s+subagents?\b")
skills_claimed  = find_count(
    r"\b(\d+|twenty-(?:four|five|six|seven|eight|nine)|"
    r"thirty|thirty-(?:one|two|three|four|five|six|seven|eight|nine)|forty)\s+skills?\b")
gates_claimed   = find_count(r"\b(\d+|three)\s+consent\s+gates?\b")
cmds_claimed    = 4 if re.search(r"three\s+consent\s+gates?\s*\+\s*one\s+bootstrap", seed, re.IGNORECASE) else None

def check_count(label, claimed, actual):
    if claimed is None:
        add(label, "WARN", f"could not extract claimed count; disk has {actual}")
    elif claimed == actual:
        add(label, "PASS", f"{actual}")
    else:
        add(label, "FAIL", f"seed claims {claimed}, disk has {actual}")

check_count("hooks count (seed vs baseline)",    hooks_claimed,  len(disk_baseline_hooks))
check_count("agents count (seed vs baseline)",   agents_claimed, len(disk_baseline_agents))
check_count("skills count (seed vs baseline)",   skills_claimed, len(disk_baseline_skills))
check_count("commands count (seed vs disk)",     cmds_claimed,   len(disk_commands))

# ---------- names ----------
def check_names(label, baseline, additions, disk):
    expected = baseline | additions
    missing = sorted(expected - disk)
    unexpected = sorted(disk - expected)
    if not missing and not unexpected:
        if additions:
            detail = f"{len(baseline)} baseline + {len(additions)} project = {len(disk)}"
        else:
            detail = ""
        add(label, "PASS", detail)
    else:
        bits = []
        if missing:    bits.append(f"missing: {missing}")
        if unexpected: bits.append(f"unexpected: {unexpected}")
        add(label, "FAIL", "; ".join(bits))

check_names("hooks names match seed §4.1",    EXPECTED_HOOKS,    add_hooks,    disk_hooks)
check_names("agents names match seed §4.2",   EXPECTED_AGENTS,   add_agents,   disk_agents)

# Skills canonical set comes from manifest.owners.skills (built by
# scripts/build-manifest.mjs at release time). Falls back to disk_baseline_skills
# when the manifest is missing (e.g., first audit before initial build).
_manifest_for_skills = load_manifest()
if _manifest_for_skills is None:
    _canonical_skills = disk_baseline_skills
else:
    _canonical_skills = set((_manifest_for_skills.get("owners") or {}).get("skills", {}).keys()) \
                        or disk_baseline_skills
check_names("skills names match seed §4.3",   _canonical_skills, add_skills,   disk_baseline_skills)
check_names("commands names match seed §4.4", EXPECTED_COMMANDS, set(),        disk_commands)

# ---------- skill ownership (per-file hash drift + frontmatter validation) ----------
def check_skill_ownership():
    # Frontmatter validation: every on-disk SKILL.md must declare owner: baseline|user.
    for slug in sorted(disk_skills):
        owner = read_skill_owner(slug)
        if owner is None:
            add(f"skill ownership: {slug}", "FAIL", "missing owner frontmatter")
            continue
        if owner not in ("baseline", "user"):
            add(f"skill ownership: {slug}", "FAIL", f"invalid owner={owner}")
            continue
    # Manifest-driven baseline-skill presence + per-file hash check.
    manifest = load_manifest()
    if manifest is None:
        add("skill ownership: manifest", "WARN", "obj/template/manifest.json missing — run npm run build")
        return
    owners_skills = (manifest.get("owners") or {}).get("skills", {}) or {}
    files_map = manifest.get("files") or {}
    for slug in sorted(owners_skills.keys()):
        skill_dir = root / f".claude/skills/{slug}"
        if not skill_dir.is_dir():
            add(f"skill ownership: {slug}", "FAIL", "baseline skill missing")
            continue
        for path, expected_hash in files_map.items():
            if not path.startswith(f".claude/skills/{slug}/"):
                continue
            disk_file = root / path
            if not disk_file.exists():
                add(f"skill ownership: {slug}", "FAIL", f"baseline skill missing: {path}")
                continue
            actual = hashlib.sha256(disk_file.read_bytes()).hexdigest()
            if actual != expected_hash:
                add(f"skill ownership: {slug}", "FAIL", f"hash mismatch at {path}")
                break  # one mismatch per slug is enough; surface the first

import hashlib  # used by check_skill_ownership
check_skill_ownership()

# ---------- constitutional citation (Article XI + §17) ----------
# The check looks for the section HEADINGS specifically (## Article XI and
# ## §17), not just the literal strings — body prose can reference the
# names, but only the actual section heading proves the section exists.
def check_constitutional_citations():
    claude_text = read_text("CLAUDE.md")
    seed_text   = read_text("docs/init/seed.md")
    if "## Article XI" not in claude_text or "manifest" not in claude_text:
        add("CLAUDE.md citation", "FAIL", "CLAUDE.md missing Article XI citation")
    else:
        add("CLAUDE.md citation", "PASS", "Article XI present")
    if "## §17" not in seed_text or "manifest" not in seed_text:
        add("seed.md citation", "FAIL", "seed.md missing §17 citation")
    else:
        add("seed.md citation", "PASS", "§17 present")

check_constitutional_citations()

# ---------- memory directory ----------
mem_dir = root / ".claude/memory"
if not mem_dir.is_dir():
    add("memory directory exists", "FAIL", "missing .claude/memory/")
else:
    add("memory directory exists", "PASS", "")
    disk_memory = {p.stem for p in mem_dir.glob("*.md") if p.stem != "README"}
    missing = sorted(EXPECTED_MEMORY_FILES - disk_memory)
    unexpected = sorted(disk_memory - EXPECTED_MEMORY_FILES)
    if missing or unexpected:
        bits = []
        if missing:    bits.append(f"missing: {missing}")
        if unexpected: bits.append(f"unexpected: {unexpected}")
        add("memory files present", "FAIL", "; ".join(bits))
    else:
        add("memory files present", "PASS", f"{len(disk_memory)} files")
    # Each canonical file should have frontmatter (--- ... ---) and at least one entry.
    for name in sorted(EXPECTED_MEMORY_FILES):
        p = mem_dir / f"{name}.md"
        if not p.is_file():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if not text.startswith("---"):
            add(f"memory shape: {name}.md", "FAIL", "missing frontmatter")
            continue
        # _pending body may be empty; canonical must have at least one entry.
        if name == "_pending":
            add(f"memory shape: {name}.md", "PASS", "")
            continue
        body = text.split("---", 2)[-1] if text.startswith("---") else text
        # Strip fenced code blocks so example "## <stable key>" lines inside
        # ```markdown ... ``` don't count as entries.
        body_no_fence = re.sub(r"(?ms)^```.*?^```\s*$", "", body)
        entry_count = len(re.findall(r'(?m)^##\s+\S', body_no_fence))
        if entry_count == 0:
            add(f"memory shape: {name}.md", "FAIL", "no entries (## headings) in body")
        else:
            add(f"memory shape: {name}.md", "PASS", f"{entry_count} entries")
    # README inside memory/ is a structural expectation
    add("memory README", "PASS" if (mem_dir / "README.md").is_file() else "FAIL",
        "" if (mem_dir / "README.md").is_file() else "missing .claude/memory/README.md")

# ---------- src/ templates (pristine pre-init versions) ----------
# Pristine versions of every file that /init-project modifies. The build
# script overlays these onto the rsync'd template at pack time so the
# dogfood project's live state never ships to fresh users. See
# `docs/create-baseline.md`.
#
# The src/ tree mirrors the canonical paths with a `.template` suffix so
# `npx @friedbotstudio/create-baseline` can discover and overlay deterministically.
src_dir = root / "src"
if not src_dir.is_dir():
    add("src templates: directory", "FAIL", "missing src/")
else:
    add("src templates: directory", "PASS", "")

    # CLAUDE.template.md — must exist and read as constitution-voice (or, in
    # the pre-Stage-2 transitional shape, at least the user-voice lede). The
    # test below tolerates either: dogfood-leak fails hard; constitutional
    # markers OR the legacy user-voice lede pass.
    src_claude = src_dir / "CLAUDE.template.md"
    if not src_claude.is_file():
        add("src templates: CLAUDE.template.md", "FAIL", "missing")
    else:
        head = src_claude.read_text(encoding="utf-8", errors="replace")[:1200]
        if "is a general-purpose Claude setup" in head:
            add("src templates: CLAUDE.template.md", "FAIL",
                "lede uses dogfood voice ('is a general-purpose Claude setup'); "
                "template must read as ship-to-user constitution")
        elif re.search(r"\bArticle\s+I\b", head) or "in-session constitution" in head.lower():
            add("src templates: CLAUDE.template.md", "PASS", "constitution voice")
        elif "uses the Claude Code baseline" in head:
            add("src templates: CLAUDE.template.md", "PASS", "user-voice lede (pre-constitution)")
        else:
            add("src templates: CLAUDE.template.md", "FAIL",
                "lede missing — expected constitution markers ('Article I', 'in-session constitution') "
                "or transitional user-voice phrase 'uses the Claude Code baseline'")

    # project.template.json — must parse and be in pristine (unconfigured) state.
    src_pj = src_dir / "project.template.json"
    if not src_pj.is_file():
        add("src templates: project.template.json", "FAIL", "missing")
    else:
        try:
            pj_seed = json.loads(src_pj.read_text(encoding="utf-8"))
        except Exception as e:
            add("src templates: project.template.json", "FAIL", f"invalid JSON: {e}")
            pj_seed = None
        if pj_seed is not None:
            if pj_seed.get("configured") is not False:
                add("src templates: project.template.json", "FAIL",
                    "must be pristine — `configured` should be false (got "
                    f"{pj_seed.get('configured')!r})")
            else:
                add("src templates: project.template.json", "PASS", "configured=false")

    # seed.template.md — must exist + carry the §16 reservation (pre-init shape).
    # If `Generated:` appears under §16 the template has been polluted by an
    # /init-project run on the live seed file rather than against the dogfood copy.
    src_seed = src_dir / "seed.template.md"
    if not src_seed.is_file():
        add("src templates: seed.template.md", "FAIL", "missing")
    else:
        seed_text = src_seed.read_text(encoding="utf-8", errors="replace")
        s16 = re.search(r"##\s+§16\s+—\s+Project-specific configuration[\s\S]{0,400}",
                        seed_text)
        if not s16:
            add("src templates: seed.template.md", "FAIL", "missing §16 reservation")
        elif "Generated:" in s16.group(0):
            add("src templates: seed.template.md", "FAIL",
                "§16 has been populated (`Generated:` stamp present); template must stay pristine")
        else:
            add("src templates: seed.template.md", "PASS", "§16 reserved (pristine)")

    # .mcp.template.json — must parse and declare the three baseline servers.
    src_mcp = src_dir / ".mcp.template.json"
    if not src_mcp.is_file():
        add("src templates: .mcp.template.json", "FAIL", "missing")
    else:
        try:
            m = json.loads(src_mcp.read_text(encoding="utf-8"))
            servers = list((m.get("mcpServers") or {}).keys())
            missing = [s for s in ("context7", "plantuml", "playwright") if s not in servers]
            if missing:
                add("src templates: .mcp.template.json", "FAIL",
                    f"baseline servers missing: {missing}")
            else:
                add("src templates: .mcp.template.json", "PASS",
                    f"baseline servers present ({len(servers)} declared)")
        except Exception as e:
            add("src templates: .mcp.template.json", "FAIL", f"invalid JSON: {e}")

    # settings.template.json — must parse and wire every baseline hook.
    src_settings = src_dir / "settings.template.json"
    if not src_settings.is_file():
        add("src templates: settings.template.json", "FAIL", "missing")
    else:
        try:
            s_text = src_settings.read_text(encoding="utf-8")
            json.loads(s_text)
            missing_wired = sorted(h for h in EXPECTED_HOOKS if f"{h}.sh" not in s_text)
            if missing_wired:
                head = missing_wired[:3]
                tail = f" + {len(missing_wired) - 3} more" if len(missing_wired) > 3 else ""
                add("src templates: settings.template.json", "FAIL",
                    f"baseline hooks not wired: {head}{tail}")
            else:
                add("src templates: settings.template.json", "PASS",
                    f"all {len(EXPECTED_HOOKS)} baseline hooks wired")
        except Exception as e:
            add("src templates: settings.template.json", "FAIL", f"invalid JSON: {e}")

    # agents/swarm-worker.template.md — must carry all four substitution tokens.
    src_worker = src_dir / "agents" / "swarm-worker.template.md"
    if not src_worker.is_file():
        add("src templates: agents/swarm-worker.template.md", "FAIL", "missing")
    else:
        wt = src_worker.read_text(encoding="utf-8", errors="replace")
        tokens = ("{{NAME}}", "{{DESCRIPTION}}", "{{SKILLS}}", "{{ROLE_LINE}}")
        missing_tokens = [t for t in tokens if t not in wt]
        if missing_tokens:
            add("src templates: agents/swarm-worker.template.md", "FAIL",
                f"tokens missing: {missing_tokens}")
        else:
            add("src templates: agents/swarm-worker.template.md", "PASS",
                "all 4 tokens present")

    # memory/<canonical>.template.md — frontmatter + zero entries (skip
    # _pending / _resume, runtime-only).
    src_mem_dir = src_dir / "memory"
    canonical_memory = EXPECTED_MEMORY_FILES - {"_pending", "_resume"}
    if not src_mem_dir.is_dir():
        add("src templates: memory/", "FAIL", "missing src/memory/")
    else:
        for name in sorted(canonical_memory):
            p = src_mem_dir / f"{name}.template.md"
            if not p.is_file():
                add(f"src templates: memory/{name}.template.md", "FAIL", "missing")
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            if not text.startswith("---"):
                add(f"src templates: memory/{name}.template.md", "FAIL", "missing frontmatter")
                continue
            body = text.split("---", 2)[-1]
            # Same fenced-block stripping as the live-memory check.
            body_no_fence = re.sub(r"(?ms)^```.*?^```\s*$", "", body)
            entry_count = len(re.findall(r"(?m)^##\s+\S", body_no_fence))
            if entry_count > 0:
                add(f"src templates: memory/{name}.template.md", "FAIL",
                    f"template must be pristine; {entry_count} entries found")
            else:
                add(f"src templates: memory/{name}.template.md", "PASS", "pristine")

# ---------- helper scripts ----------
helpers = [
    ".claude/skills/swarm-plan/validate.sh",
    ".claude/skills/swarm-dispatch/swarm_merge.sh",
    ".claude/skills/spec-render/render.sh",
    ".claude/skills/spec-lint/lint.sh",
    ".claude/skills/archive/archive.sh",
    ".claude/skills/audit-baseline/audit.sh",
]
for rel in helpers:
    p = root / rel
    label = f"helper {rel.split('/.claude/skills/')[-1]}"
    if not p.exists():
        add(label, "FAIL", "missing")
    elif not os.access(p, os.X_OK):
        add(label, "FAIL", "not executable")
    else:
        add(label, "PASS", "")

# ---------- settings.json hook wiring ----------
settings_text = read_text(".claude/settings.json")
if not settings_text:
    add("settings.json present", "FAIL", "missing or empty")
else:
    try:
        json.loads(settings_text)
        add("settings.json parses", "PASS", "")
    except Exception as e:
        add("settings.json parses", "FAIL", str(e))
    for h in sorted(EXPECTED_HOOKS):
        if f"{h}.sh" in settings_text:
            add(f"hook wired: {h}", "PASS", "")
        else:
            add(f"hook wired: {h}", "FAIL", "not in settings.json")

# ---------- project.json keys ---------- (pj already loaded earlier for additions)
if pj is None:
    add("project.json parses", "FAIL", "missing or invalid JSON")
else:
    add("project.json parses", "PASS", "")
    expected_paths = [
        ("configured",                          ["configured"]),
        ("test.cmd",                            ["test", "cmd"]),
        ("lint.cmd",                            ["lint", "cmd"]),
        ("tdd.source_globs",                    ["tdd", "source_globs"]),
        ("tdd.test_globs",                      ["tdd", "test_globs"]),
        ("tdd.exempt_globs",                    ["tdd", "exempt_globs"]),
        ("tdd.ui_globs",                        ["tdd", "ui_globs"]),
        ("destructive.hard_block_patterns",     ["destructive", "hard_block_patterns"]),
        ("destructive.ask_patterns",            ["destructive", "ask_patterns"]),
        ("artifacts.required_sections.intake",  ["artifacts", "required_sections", "intake"]),
        ("artifacts.required_sections.brd",     ["artifacts", "required_sections", "brd"]),
        ("artifacts.required_sections.spec",    ["artifacts", "required_sections", "spec"]),
        ("artifacts.required_sections.rca",     ["artifacts", "required_sections", "rca"]),
        ("artifacts.required_diagrams.spec",    ["artifacts", "required_diagrams", "spec"]),
        ("swarm.max_parallel",                  ["swarm", "max_parallel"]),
        ("swarm.isolation",                     ["swarm", "isolation"]),
        ("swarm.min_tasks_worth_swarming",      ["swarm", "min_tasks_worth_swarming"]),
        ("swarm.refuse_dirty_tree",             ["swarm", "refuse_dirty_tree"]),
        ("swarm.exempt_path_prefixes",          ["swarm", "exempt_path_prefixes"]),
        ("swarm.enforced_path_prefixes",        ["swarm", "enforced_path_prefixes"]),
        ("consent.commit_ttl_seconds",          ["consent", "commit_ttl_seconds"]),
        ("consent.gate_marker_ttl_seconds",     ["consent", "gate_marker_ttl_seconds"]),
        ("additions.agents",                    ["additions", "agents"]),
        ("additions.skills",                    ["additions", "skills"]),
        ("additions.hooks",                     ["additions", "hooks"]),
        ("additions.mcp_servers",               ["additions", "mcp_servers"]),
        ("additions.swarm_worker_skills",       ["additions", "swarm_worker_skills"]),
    ]
    for label, path in expected_paths:
        cur = pj
        ok = True
        for k in path:
            if isinstance(cur, dict) and k in cur:
                cur = cur[k]
            else:
                ok = False; break
        add(f"project.json: {label}", "PASS" if ok else "FAIL", "" if ok else "missing key")

# ---------- .mcp.json servers ----------
mcp = read_json(".mcp.json")
if mcp is None:
    add(".mcp.json parses", "FAIL", "missing or invalid JSON")
else:
    add(".mcp.json parses", "PASS", "")
    servers = list((mcp.get("mcpServers") or {}).keys())
    for s in ("context7", "plantuml", "playwright"):
        add(f"mcp server: {s}", "PASS" if s in servers else "FAIL",
            "" if s in servers else "not declared")

# ---------- vendored license / notice ----------
recommender = root / ".claude/skills/claude-automation-recommender"
if recommender.is_dir():
    for fname in ("LICENSE", "NOTICE", "SKILL.md"):
        p = recommender / fname
        add(f"recommender {fname}",
            "PASS" if p.exists() else "FAIL",
            "" if p.exists() else "missing")
else:
    add("recommender skill directory", "FAIL", "missing")

# .claude/bin/ — vendored Apache-licensed PlantUML jar (deferred-fetch model;
# only LICENSE + NOTICE ship; the jar itself is fetched at install time and
# verified against a pinned sha256). The LICENSE + NOTICE are mandatory.
plantuml_dir = root / ".claude/bin"
if plantuml_dir.is_dir():
    for fname in ("LICENSE", "NOTICE"):
        p = plantuml_dir / fname
        add(f"plantuml-vendored {fname}",
            "PASS" if p.exists() else "FAIL",
            "" if p.exists() else f"missing — required for Apache 2.0 redistribution of plantuml-asl jar")
    notice_p = plantuml_dir / "NOTICE"
    if notice_p.exists():
        notice_text = notice_p.read_text(encoding="utf-8", errors="replace")
        required_substrings = [
            "plantuml-asl-1.2026.2",
            "c348f6a26d999f81fd05b5d49834bb70df9cf35fab0939c4edecb0909e64022b",
        ]
        missing = [s for s in required_substrings if s not in notice_text]
        if missing:
            add("plantuml-vendored NOTICE content", "FAIL",
                f"missing required attribution strings: {missing}")
        else:
            add("plantuml-vendored NOTICE content", "PASS",
                "upstream version + pinned sha256 present")
else:
    add(".claude/bin directory", "FAIL", "missing — required for vendored PlantUML LICENSE/NOTICE")

# ---------- Article X.2 / design-ui orchestrator surface ----------
claude_md = read_text("CLAUDE.md")
if "### X.2 Design-task routing" in claude_md:
    add("CLAUDE.md: Article X.2 present", "PASS", "design-task routing rule declared")
else:
    add("CLAUDE.md: Article X.2 present", "FAIL",
        "missing `### X.2 Design-task routing` heading — Article X.2 is the structural seam between design-ui and impeccable")

template_claude = read_text("src/CLAUDE.template.md")
if "### X.2 Design-task routing" in template_claude:
    add("src/CLAUDE.template.md: Article X.2 mirrors", "PASS", "")
else:
    add("src/CLAUDE.template.md: Article X.2 mirrors", "FAIL",
        "src template does not contain Article X.2 — template-drift will fail")

design_ui_skill = read_text(".claude/skills/design-ui/SKILL.md")
if re.search(r'^description:.*orchestrat', design_ui_skill, re.MULTILINE | re.IGNORECASE):
    add("design-ui SKILL.md: orchestrator role", "PASS",
        "frontmatter description names orchestrator role")
else:
    add("design-ui SKILL.md: orchestrator role", "FAIL",
        "frontmatter description must mention 'orchestrat' — the v1 code-writing role is retired")

# spec_design_calls_guard — present, executable, and wired in settings.
hook_path = root / ".claude/hooks/spec_design_calls_guard.sh"
hook_wired = "spec_design_calls_guard.sh" in (settings_text or "")
if hook_path.is_file() and os.access(hook_path, os.X_OK) and hook_wired:
    add("spec_design_calls_guard.sh: present + wired", "PASS",
        "file executable and wired in PreToolUse Write|Edit|MultiEdit chain")
else:
    detail = []
    if not hook_path.is_file():
        detail.append("hook script missing")
    elif not os.access(hook_path, os.X_OK):
        detail.append("hook not executable")
    if not hook_wired:
        detail.append("not wired in .claude/settings.json")
    add("spec_design_calls_guard.sh: present + wired", "FAIL", "; ".join(detail))

# ---------- cross-doc count claims ----------
#
# Two-layer design:
#
#   Layer 1 — regex sweep. Find every "<n> <noun>" or "<noun> (<n>)" shape.
#             Cheap, broad, but produces false positives (e.g. "Two subagents
#             review before /approve-spec" is a local count of two specific
#             reviewer agents, not a headline claim about the baseline).
#
#   Layer 2 — context classifier. Look at what surrounds each match and
#             bucket it into HEADLINE / LOCAL / AMBIGUOUS. Only HEADLINE
#             matches drive PASS/FAIL on the headline count. LOCAL matches
#             are suppressed silently. AMBIGUOUS matches surface a soft
#             note so the user can sanity-check without confusing them
#             into thinking the baseline is drifting.
#
# This keeps the sweep's recall (catches drift in unexpected phrasings)
# without the precision tax of dumping every match as a warning.

NUM = (r"(?<![.\d\-])("  # also block hyphen so "four" in "thirty-four" doesn't match
       r"\d+|"
       # Compounds first so "thirty-four" wins over bare "four".
       r"twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|"
       r"twenty-seven|twenty-eight|twenty-nine|"
       r"thirty-one|thirty-two|thirty-three|thirty-four|thirty-five|thirty-six|"
       r"thirty-seven|thirty-eight|thirty-nine|"
       r"twenty|thirty|forty|"
       r"one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
       r"thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)")

# Patterns matching the headline form: "<n> <noun>".
# Headline claims describe the *baseline* shape, so they compare against the
# baseline subset of disk (project additions are accounted for separately).
HEAD_PATTERNS = [
    (NUM + r"\s+hooks?\b",                             len(disk_baseline_hooks),    "hooks"),
    (NUM + r"\s+guard\s+(?:hook|script)s?\b",          len(disk_baseline_hooks),    "guard hooks/scripts"),
    (NUM + r"\s+(?:baseline\s+)?subagents?\b",         len(disk_baseline_agents),   "subagents"),
    (NUM + r"\s+skills\b",                             len(disk_baseline_skills),   "skills"),
]
# Patterns matching the parenthesised form: "<noun> (<n>)" — common in
# diagram labels like 'subagents (10)' that the headline form misses.
PAREN_PATTERNS = [
    (r"\b(?:guard\s+hooks?|guards?)\s*\((\d+)\)",      len(disk_baseline_hooks),    "guard hooks"),
    (r"\bsubagents?\s*\((\d+)\)",                       len(disk_baseline_agents),   "subagents"),
    (r"\bskills?\s*\((\d+)\)",                          len(disk_baseline_skills),   "skills"),
]
# Patterns matching the noun-first form: "<noun> <n>" — used in compact
# typographic lists like 'phases 11 · hooks 14 · skills 27 · agents 10'
# that the standard "<n> <noun>" headline form misses.
NOUN_FIRST_PATTERNS = [
    (r"\bhooks?\s+(\d+)\b",                             len(disk_baseline_hooks),    "hooks"),
    (r"\b(?:sub)?agents?\s+(\d+)\b",                    len(disk_baseline_agents),   "agents"),
    (r"\bskills?\s+(\d+)\b",                            len(disk_baseline_skills),   "skills"),
]

# Indicators that a count is LOCAL (sub-paragraph enumeration), not headline.
# Tested against the ~80 chars immediately following the matched snippet.
LOCAL_POST_HINTS = (
    "review before", "review of", "iterate safely", "iterate over",
    "+ one command", "+ 1 command", "sit between", "operate on",
    "ship a", "ship `template", "share `code", "review prose",
    "run between", "follow ", "handle ",
)
# Indicators that a count IS a headline claim about the baseline as a whole.
HEADLINE_PRE_HINTS = (
    "ships the claude code baseline (", "drop-in scaffold", "<strong>",
    "ships ", "baseline (", "delivers ", "twenty-", "fourteen ",
    "ten ", "eleven ",
)

def classify_match(text, m):
    """Return HEADLINE | LOCAL | AMBIGUOUS for a regex match."""
    start, end = m.span()
    pre = text[max(0, start - 80):start].lower()
    post = text[end:end + 80].lower()

    # LOCAL signals win first — local enumeration is the dominant FP source.
    for hint in LOCAL_POST_HINTS:
        if hint in post:
            return "LOCAL"
    # A colon or bullet introducing a list right after the count is also LOCAL
    # ("Two subagents review before /approve-spec:" then a bulleted list).
    stripped_post = post.lstrip()
    if stripped_post.startswith(":") and "\n" in post[:40]:
        return "LOCAL"

    # HEADLINE signals: lede position, structural <strong>, declarative cue.
    if start < 1200:  # lede / preamble window
        return "HEADLINE"
    for hint in HEADLINE_PRE_HINTS:
        if hint in pre:
            return "HEADLINE"

    return "AMBIGUOUS"

docs_to_check = [
    "CLAUDE.md",
    "README.md",
    "docs/init/seed.md",
]
for doc in docs_to_check:
    text = read_text(doc)
    if not text:
        add(f"{doc} count claims", "WARN", "file not present")
        continue

    headline_drift = []   # confirmed stale headline claims
    headline_ok    = 0    # headline claims that match disk
    local_n        = 0    # suppressed local counts
    ambiguous      = []   # neither clearly headline nor clearly local

    # Headline-form sweep (with classifier).
    for pat, expected, kind in HEAD_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            claimed = to_int(m.group(1))
            if claimed is None:
                continue
            tier = classify_match(text, m)
            if tier == "LOCAL":
                local_n += 1
                continue
            if claimed == expected:
                if tier == "HEADLINE":
                    headline_ok += 1
                # AMBIGUOUS-and-correct: silently fine.
                continue
            # claimed != expected
            snippet = m.group(0).strip()
            if tier == "HEADLINE":
                headline_drift.append(f'"{snippet}" → expected {expected} {kind}')
            else:  # AMBIGUOUS and stale — soft surface, may be local
                ambiguous.append(f'"{snippet}" (likely local; otherwise {expected} {kind})')

    # Parenthesised-form sweep. Mostly diagram labels like 'subagents (10)'.
    # Qualifier-prefixed forms ('phase skills (11)', 'shared globals (7)',
    # 'guard hooks' is itself a qualifier we already handle in the pattern)
    # are local subset counts — drop them.
    QUALIFIER_PREFIXES = ("phase ", "shared ", "local ", "scoped ",
                          "swarm ", "ui ", "test ")
    for pat, expected, kind in PAREN_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            claimed = to_int(m.group(1))
            if claimed is None:
                continue
            # Inspect the ~12 chars before the match — if a qualifier word
            # like 'phase' sits there, this is a sub-count, not headline.
            pre_word = text[max(0, m.start() - 12):m.start()].lower()
            if any(pre_word.endswith(q) for q in QUALIFIER_PREFIXES):
                local_n += 1
                continue
            if claimed == expected:
                headline_ok += 1
            else:
                snippet = m.group(0).strip()
                headline_drift.append(f'"{snippet}" → expected {expected} {kind}')

    # Noun-first sweep — for compact typographic count strips like
    # 'phases 11 · hooks 14 · skills 27 · agents 10 · gates 3'. The form
    # itself is structural (rare in flowing prose), so AMBIGUOUS classifier
    # results here are promoted to HEADLINE. Only an explicit LOCAL signal
    # in the surrounding context demotes a match to a suppressed local count.
    for pat, expected, kind in NOUN_FIRST_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            try:
                claimed = int(m.group(1))
            except (TypeError, ValueError):
                continue
            tier = classify_match(text, m)
            if tier == "LOCAL":
                local_n += 1
                continue
            # Treat AMBIGUOUS as HEADLINE for noun-first — the form is the signal.
            if claimed == expected:
                headline_ok += 1
                continue
            snippet = m.group(0).strip()
            headline_drift.append(f'"{snippet}" → expected {expected} {kind}')

    if headline_drift:
        # Real drift — promote to FAIL. The classifier has filtered out
        # the false positives that previously kept this at WARN.
        add(f"{doc} count claims", "FAIL", "; ".join(headline_drift[:3]) +
            (f"; +{len(headline_drift) - 3} more" if len(headline_drift) > 3 else ""))
    elif headline_ok:
        suffix = ""
        if local_n:
            suffix = f" ({local_n} local count{'s' if local_n != 1 else ''} suppressed)"
        add(f"{doc} count claims", "PASS", f"{headline_ok} headline claim{'s' if headline_ok != 1 else ''} match{suffix}")
    elif ambiguous:
        add(f"{doc} count claims", "WARN", "; ".join(ambiguous[:2]))
    else:
        add(f"{doc} count claims", "WARN", "no relevant claims found")

# ---------- quickfix invariants (5/6/7) ----------

# quickfix-5: scoped baseline files SHALL NOT contain the legacy doc-site
# path prefix. Scope is narrow (per seed.md §16 deviation #5): audit.sh, the
# audit-baseline SKILL.md, init-project.md, and seed.md §3 (lines 100-136).
# §16 itself is excluded — its deviation log legitimately records the historical
# removal and SHALL NOT be edited by a quickfix pass.
#
# The needle is built via concatenation so this assertion file is not a
# self-match — audit.sh is one of the scanned targets, and the needle string
# is the only thing here that may contain the joined literal.
_qf5_needle = "docs/" + "site"

def _qf5_scan(rel, line_range=None, cached=None):
    text = cached if cached is not None else read_text(rel)
    if not text:
        return []
    lines = text.splitlines()
    if line_range is not None:
        lo, hi = line_range
        sliced = lines[lo - 1:hi]
        return [(rel, lo + i) for i, ln in enumerate(sliced) if _qf5_needle in ln]
    return [(rel, i + 1) for i, ln in enumerate(lines) if _qf5_needle in ln]

_qf5_targets = [
    (".claude/skills/audit-baseline/audit.sh",  None,         None),
    (".claude/skills/audit-baseline/SKILL.md",  None,         None),
    (".claude/commands/init-project.md",        None,         None),
    ("docs/init/seed.md",                       (100, 136),   seed),
]
_qf5_hits = []
for _p, _r, _cached in _qf5_targets:
    _qf5_hits.extend(_qf5_scan(_p, _r, _cached))
if _qf5_hits:
    _qf5_detail = "; ".join(f"{p}:{ln}" for p, ln in _qf5_hits[:3])
    if len(_qf5_hits) > 3:
        _qf5_detail += f"; +{len(_qf5_hits) - 3} more"
    add("quickfix-5: no stale doc-site refs in scoped baseline files", "FAIL", _qf5_detail)
else:
    add("quickfix-5: no stale doc-site refs in scoped baseline files", "PASS", "4 paths clean")

# quickfix-6: HEAD_PATTERNS hooks regex SHALL match bare `<n> hooks` (no
# `guard` qualifier required). The current pattern requires `\s+guard\s+...`
# so the synthetic string "the harness has 17 hooks total" does not match.
_qf6_pat = next((pat for pat, _exp, kind in HEAD_PATTERNS if "hooks" in kind), None)
if _qf6_pat is None:
    add("quickfix-6: hooks count regex accepts bare phrasing", "FAIL",
        "could not locate hooks pattern in HEAD_PATTERNS")
else:
    _qf6_m = re.search(_qf6_pat, "the harness has 17 hooks total", re.IGNORECASE)
    if _qf6_m and to_int(_qf6_m.group(1)) == 17:
        add("quickfix-6: hooks count regex accepts bare phrasing", "PASS",
            f"matched {_qf6_m.group(0)!r} -> 17")
    else:
        add("quickfix-6: hooks count regex accepts bare phrasing", "FAIL",
            'bare-form regex did not match "17 hooks total"')

# quickfix-7: swarm-worker.md frontmatter `description:` SHALL begin with an
# imperative verb (Article II — "Decisions live in main context. Subagents
# only execute pre-decided recipes."). The third-person form `Executes` is
# rejected; the imperative `Execute` is accepted.
_qf7_text = read_text(".claude/agents/swarm-worker.md")
_qf7_m = re.search(r"(?m)^description:\s*(\S+)", _qf7_text or "")
if not _qf7_text:
    add("quickfix-7: swarm-worker description uses imperative voice", "FAIL",
        ".claude/agents/swarm-worker.md not present")
elif _qf7_m is None:
    add("quickfix-7: swarm-worker description uses imperative voice", "FAIL",
        "no `description:` line found in swarm-worker.md frontmatter")
else:
    _qf7_first = _qf7_m.group(1).rstrip(",.;:")
    if re.match(r"^(Execute|Run|Receive|Perform)\b", _qf7_first):
        add("quickfix-7: swarm-worker description uses imperative voice", "PASS",
            f"imperative voice: {_qf7_first}")
    else:
        add("quickfix-7: swarm-worker description uses imperative voice", "FAIL",
            f'description starts with "{_qf7_first}" — expected imperative verb (Execute|Run|Receive|Perform)')

# ---------- output ----------
name_w   = max((len(r[0]) for r in results), default=20)
fail_n   = sum(1 for _, s, _ in results if s == "FAIL")
warn_n   = sum(1 for _, s, _ in results if s == "WARN")
print(f"{'check'.ljust(name_w)}  {'status':<6}  detail")
print(f"{'-' * name_w}  {'-' * 6}  {'-' * 50}")
for name, status, detail in results:
    print(f"{name.ljust(name_w)}  {status:<6}  {detail}")
print(f"{'-' * name_w}  {'-' * 6}")
overall = "FAIL" if fail_n else "PASS"
print(f"{'overall'.ljust(name_w)}  {overall:<6}  fails={fail_n} warns={warn_n}")
sys.exit(1 if fail_n else 0)
PY
