#!/usr/bin/env python3
"""World of Codecraft activity hook for Claude Code (herdr-app mod).

Writes ~/.local/state/world-of-codecraft/<HC_TERMINAL_ID>.json, which the mod polls
to pick the hero's scene while the agent is working.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

TERMINAL = os.environ.get("HC_TERMINAL_ID")
STATE_DIR = Path.home() / ".local/state/world-of-codecraft"

READ_TOOLS = {"Read", "Grep", "Glob", "LS", "LSP", "ToolSearch"}
WEB_TOOLS = {"WebFetch", "WebSearch"}
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
AGENT_TOOLS = {"Agent", "Task"}
TEST_RE = re.compile(r"\b(pytest|just test|code-checks|npm (run )?test|pnpm test|yarn test|go test|cargo test|vitest|jest)\b")
COMMIT_RE = re.compile(r"\bgit\b[^|;&]*\bcommit\b")
PUSH_RE = re.compile(r"\bgit\b[^|;&]*\bpush\b")


def act_for(tool: str, tool_input: dict) -> str:
    if tool in READ_TOOLS:
        return "eclaire"
    if tool in WEB_TOOLS:
        return "web"
    if tool in EDIT_TOOLS:
        return "code"
    if tool == "Bash" and TEST_RE.search(tool_input.get("command", "")):
        return "test"
    return "travail"


def main() -> None:
    if not TERMINAL:
        return
    event = json.load(sys.stdin)
    name = event.get("hook_event_name")
    tool = event.get("tool_name", "")
    tool_input = event.get("tool_input") or {}
    command = tool_input.get("command", "") if tool == "Bash" else ""

    path = STATE_DIR / f"{TERMINAL}.json"
    try:
        s = json.loads(path.read_text())
    except (OSError, ValueError):
        s = {}
    now = int(time.time() * 1000)

    if name == "UserPromptSubmit":
        s.update(act="pense", tache=s.get("tache", 0) + 1, coups=0, errTache=0, subs=0)
    elif name == "PreToolUse":
        s["act"] = act_for(tool, tool_input)
        if tool in AGENT_TOOLS:
            s["subs"] = s.get("subs", 0) + 1
    elif name in ("PostToolUse", "PostToolUseFailure"):
        ok = name == "PostToolUse"
        if tool in AGENT_TOOLS:
            s["subs"] = max(0, s.get("subs", 0) - 1)
        if ok and tool in EDIT_TOOLS:
            s["coups"] = s.get("coups", 0) + 1
        if not ok:
            s.update(err=s.get("err", 0) + 1, errT=now, errTache=s.get("errTache", 0) + 1)
        if command and TEST_RE.search(command):
            s["essai"] = {"ok": ok, "t": now}
        if ok and COMMIT_RE.search(command):
            s["commitT"] = now
        if ok and PUSH_RE.search(command):
            s["pushT"] = now
        s["act"] = "pense"
    elif name == "PreCompact":
        s["act"] = "medite"
    elif name == "Stop":
        s.update(act="pense", subs=0)
    else:
        return

    s["t"] = now
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(s))
    tmp.replace(path)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
