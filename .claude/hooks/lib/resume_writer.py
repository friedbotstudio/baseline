#!/usr/bin/env python3
"""Continuity snapshot writer.

Walks a Claude Code transcript JSONL plus state files and writes a
single-snapshot `.claude/memory/_resume.md`. Shared by:

  - memory_pre_compact.sh (PreCompact event — capture before compaction)
  - memory_stop.sh        (Stop event      — refresh every turn-end)

The snapshot answers "where were we / what's next?" so a session that
gets compacted, /clear'd, or resumed in a new shell can pick up without
the user re-explaining context.

Heuristic only: scrapes the transcript for recent user prompts, recent
file writes, and the most recent Skill invocation, then merges with
.claude/state/workflow.json if present.

Invoked as:
    python3 resume_writer.py <transcript_path> <project_dir> <trigger>

trigger is one of: pre-compact, stop, harness — recorded in frontmatter.
Exits 0 on success or any failure (this is best-effort; it must never
break the hook that called it).
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# How many most-recent items of each kind to retain in the snapshot.
MAX_USER_PROMPTS = 3
MAX_FILES = 12
MAX_SKILLS = 5
MAX_BASH = 5
USER_PROMPT_CHARS = 400  # truncate per-prompt; the snapshot is bounded


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_json(path: Path) -> dict | list | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _iter_transcript_events(transcript: Path) -> Iterable[dict]:
    if not transcript.is_file():
        return
    try:
        with transcript.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except Exception:
                    continue
    except Exception:
        return


def _extract_text_blocks(content) -> list[str]:
    """A message's `content` is either a string or list of typed blocks."""
    out: list[str] = []
    if isinstance(content, str):
        if content.strip():
            out.append(content.strip())
        return out
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            t = block.get("text", "")
            if isinstance(t, str) and t.strip():
                out.append(t.strip())
    return out


def _walk(transcript: Path) -> dict:
    """Single pass over the transcript collecting everything we need."""
    user_prompts: list[str] = []
    file_writes: list[tuple[str, str]] = []  # (path, tool)
    skill_calls: list[str] = []
    bash_cmds: list[str] = []
    last_assistant_text: str = ""

    for ev in _iter_transcript_events(transcript):
        msg = ev.get("message") if isinstance(ev, dict) else None
        if not isinstance(msg, dict):
            # Some transcripts put role/content at top level.
            msg = ev if isinstance(ev, dict) else {}
        role = msg.get("role") or ev.get("role") if isinstance(ev, dict) else None
        content = msg.get("content")

        if role == "user":
            for t in _extract_text_blocks(content):
                # Skip system-reminder noise and hook injections.
                if t.startswith("<system-reminder>") or "<command-name>" in t[:64]:
                    continue
                if t.startswith("<local-command-"):
                    continue
                user_prompts.append(t)
        elif role == "assistant":
            text_blocks = _extract_text_blocks(content)
            if text_blocks:
                last_assistant_text = text_blocks[-1]
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") != "tool_use":
                        continue
                    name = block.get("name", "")
                    inp = block.get("input") or {}
                    if name in ("Edit", "Write", "MultiEdit"):
                        fp = inp.get("file_path") or ""
                        if fp:
                            file_writes.append((fp, name))
                    elif name == "Skill":
                        sk = inp.get("skill") or ""
                        if sk:
                            skill_calls.append(sk)
                    elif name == "Bash":
                        cmd = inp.get("command") or ""
                        if cmd:
                            bash_cmds.append(cmd.strip().splitlines()[0][:160])

    return {
        "user_prompts": user_prompts,
        "file_writes": file_writes,
        "skill_calls": skill_calls,
        "bash_cmds": bash_cmds,
        "last_assistant_text": last_assistant_text,
    }


def _read_workflow(project_dir: Path) -> dict:
    """Return whatever .claude/state/workflow.json holds, or {}."""
    p = project_dir / ".claude" / "state" / "workflow.json"
    data = _read_json(p)
    return data if isinstance(data, dict) else {}


def _last_harness_log_line(project_dir: Path, slug: str) -> str:
    log = project_dir / ".claude" / "state" / "harness" / f"{slug}.log"
    if not log.is_file():
        return ""
    try:
        lines = [ln for ln in log.read_text(encoding="utf-8", errors="replace").splitlines() if ln.strip()]
        return lines[-1] if lines else ""
    except Exception:
        return ""


def _rel(path: str, project_dir: Path) -> str:
    """Make project-relative if possible."""
    try:
        p = Path(path)
        if p.is_absolute():
            return str(p.relative_to(project_dir))
    except Exception:
        pass
    return path


def _dedup_keep_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it in seen:
            continue
        seen.add(it)
        out.append(it)
    return out


def compose_snapshot(transcript: Path, project_dir: Path, trigger: str) -> str:
    walk = _walk(transcript)
    workflow = _read_workflow(project_dir)

    slug = workflow.get("slug") or "(none)"
    entry_phase = workflow.get("entry_phase") or "(unknown)"
    completed = workflow.get("completed") or []
    exceptions = workflow.get("exceptions") or []
    phases = workflow.get("phases") or []

    # Next phase = first phase not in completed, after entry_phase.
    next_phase = "(unknown)"
    if phases and isinstance(completed, list):
        try:
            start = phases.index(entry_phase) if entry_phase in phases else 0
        except ValueError:
            start = 0
        for ph in phases[start:]:
            if ph in exceptions:
                continue
            if ph not in completed:
                next_phase = ph
                break
        else:
            next_phase = "(workflow complete)"

    last_completed = completed[-1] if completed else "(none)"

    # File writes — most recent unique paths, project-relative.
    files_recent = []
    for fp, _tool in reversed(walk["file_writes"]):
        rel = _rel(fp, project_dir)
        if rel.startswith(".claude/state/") or rel.startswith(".claude/memory/_pending"):
            continue
        if rel not in files_recent:
            files_recent.append(rel)
        if len(files_recent) >= MAX_FILES:
            break

    # User prompts — last K, most-recent first.
    prompts_recent = walk["user_prompts"][-MAX_USER_PROMPTS:]
    prompts_recent = list(reversed(prompts_recent))

    # Skill calls — last K, dedup keep-order, most-recent first.
    skills_recent = list(reversed(_dedup_keep_order(walk["skill_calls"][-MAX_SKILLS * 3:])))[:MAX_SKILLS]

    # Bash — last K (chatty, so keep small).
    bash_recent = walk["bash_cmds"][-MAX_BASH:]
    bash_recent = list(reversed(bash_recent))

    last_log = _last_harness_log_line(project_dir, slug) if slug != "(none)" else ""

    # Continue-with hint.
    if slug == "(none)":
        hint = "No active workflow. Run `/triage \"<request>\"` to start one, or `/harness` if you have a concrete request."
    elif next_phase == "(workflow complete)":
        hint = f"Workflow `{slug}` is complete. Run `/grant-commit` then `/harness` to commit."
    else:
        hint = f"Run `/harness` to resume `{slug}` at phase `{next_phase}`."

    # Compose markdown.
    lines: list[str] = []
    lines.append("---")
    lines.append("name: resume")
    lines.append("type: continuity")
    lines.append(f"last-updated: {_utc_now_iso()}")
    lines.append(f"trigger: {trigger}")
    lines.append("---")
    lines.append("")
    lines.append("# Resume snapshot")
    lines.append("")
    lines.append("## Active workflow")
    lines.append(f"- Slug: `{slug}`")
    lines.append(f"- Entry phase: `{entry_phase}`")
    lines.append(f"- Last completed phase: `{last_completed}`")
    lines.append(f"- Next phase due: `{next_phase}`")
    if exceptions:
        lines.append(f"- Exceptions: {', '.join(f'`{e}`' for e in exceptions)}")
    if last_log:
        lines.append(f"- Last harness log: `{last_log}`")
    lines.append("")

    lines.append("## In-flight files (most recent writes this session)")
    if files_recent:
        for fp in files_recent:
            lines.append(f"- `{fp}`")
    else:
        lines.append("- (none captured)")
    lines.append("")

    lines.append("## Recent skill invocations")
    if skills_recent:
        for sk in skills_recent:
            lines.append(f"- `/{sk}`")
    else:
        lines.append("- (none captured)")
    lines.append("")

    if bash_recent:
        lines.append("## Recent shell commands")
        for cmd in bash_recent:
            lines.append(f"- `{cmd}`")
        lines.append("")

    lines.append("## Recent user requests (most recent first)")
    if prompts_recent:
        for p in prompts_recent:
            text = p.replace("\r", " ")
            if len(text) > USER_PROMPT_CHARS:
                text = text[:USER_PROMPT_CHARS].rstrip() + "…"
            block = "\n".join(f"> {ln}" for ln in text.splitlines())
            lines.append(block)
            lines.append("")
    else:
        lines.append("- (none captured)")
        lines.append("")

    lines.append("## Continue with")
    lines.append(hint)
    lines.append("")

    return "\n".join(lines)


def write_snapshot(transcript: Path, project_dir: Path, trigger: str) -> Path | None:
    mem_dir = project_dir / ".claude" / "memory"
    if not mem_dir.is_dir():
        return None
    body = compose_snapshot(transcript, project_dir, trigger)
    out = mem_dir / "_resume.md"
    try:
        out.write_text(body, encoding="utf-8")
        return out
    except Exception:
        return None


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        sys.stderr.write("usage: resume_writer.py <transcript> <project_dir> <trigger>\n")
        return 0  # never fail the caller
    try:
        transcript = Path(argv[1])
        project_dir = Path(argv[2])
        trigger = argv[3]
        write_snapshot(transcript, project_dir, trigger)
    except Exception as e:
        sys.stderr.write(f"resume_writer: {e}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
