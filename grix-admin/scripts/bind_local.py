#!/usr/bin/env python3
"""Bind one remote Grix API agent into local OpenClaw config."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any


MINIMAL_PERSONA_FILES = {
    "IDENTITY.md": "# Identity\n\nThis agent is managed by grix-hermes.\n",
    "SOUL.md": "# Soul\n\nRespond clearly and keep the workflow moving.\n",
    "AGENTS.md": "# Agents\n\nUse the current workspace and configured tools.\n",
}


def run_command(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, text=True, capture_output=True)
    if check and result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        raise RuntimeError(stderr or stdout or f"command failed: {' '.join(cmd)}")
    return result


def safe_config_get(openclaw_cmd: str, path: str, default: Any) -> Any:
    result = subprocess.run(
        [openclaw_cmd, "config", "get", path, "--json"],
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return default
    text = (result.stdout or "").strip()
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def ensure_minimal_persona(workspace: Path) -> list[str]:
    ensure_dir(workspace)
    created: list[str] = []
    for file_name, content in MINIMAL_PERSONA_FILES.items():
        file_path = workspace / file_name
        if file_path.exists():
            continue
        file_path.write_text(content, encoding="utf-8")
        created.append(str(file_path))
    return created


def merge_tool_allowlist(current: Any) -> list[str]:
    existing: list[str] = []
    if isinstance(current, list):
        for item in current:
            text = str(item or "").strip()
            if text:
                existing.append(text)
    if "message" not in existing:
        existing.append("message")
    return existing


def resolve_model(args: argparse.Namespace, agents_list: list[dict[str, Any]], openclaw_cmd: str, skip_current: bool) -> str:
    explicit = str(args.model or "").strip()
    if explicit:
        return explicit
    for entry in agents_list:
        if str(entry.get("id") or "").strip() == args.agent_name:
            model = str(entry.get("model") or "").strip()
            if model:
                return model
    if skip_current:
        return ""
    defaults = safe_config_get(openclaw_cmd, "agents.defaults.model.primary", "")
    return str(defaults or "").strip()


def build_plan(args: argparse.Namespace) -> dict[str, Any]:
    openclaw_cmd = args.openclaw
    skip_current = bool(args.skip_current)
    current_accounts = {} if skip_current else safe_config_get(openclaw_cmd, "channels.grix.accounts", {})
    current_agents = [] if skip_current else safe_config_get(openclaw_cmd, "agents.list", [])
    current_profile = "coding" if skip_current else safe_config_get(openclaw_cmd, "tools.profile", "coding")
    current_allow = [] if skip_current else safe_config_get(openclaw_cmd, "tools.alsoAllow", [])
    current_visibility = "agent" if skip_current else safe_config_get(openclaw_cmd, "tools.sessions.visibility", "agent")
    current_grix_enabled = True if skip_current else safe_config_get(openclaw_cmd, "channels.grix.enabled", True)

    openclaw_root = Path(os.path.expanduser(args.openclaw_home or "~/.openclaw"))
    workspace = openclaw_root / f"workspace-{args.agent_name}"
    agent_dir = openclaw_root / "agents" / args.agent_name / "agent"
    model = resolve_model(args, current_agents if isinstance(current_agents, list) else [], openclaw_cmd, skip_current)
    if not model:
        raise RuntimeError("Missing model. Pass --model or ensure agents.defaults.model.primary exists.")

    account_json = {
        "name": args.agent_name,
        "enabled": True,
        "apiKey": args.api_key,
        "wsUrl": args.api_endpoint,
        "agentId": args.agent_id,
    }

    next_agents = []
    replaced = False
    for entry in current_agents if isinstance(current_agents, list) else []:
        if str(entry.get("id") or "").strip() != args.agent_name:
            next_agents.append(entry)
            continue
        replaced = True
        updated = dict(entry)
        updated["id"] = args.agent_name
        updated["name"] = args.agent_name
        updated["workspace"] = str(workspace)
        updated["agentDir"] = str(agent_dir)
        updated["model"] = model
        next_agents.append(updated)
    if not replaced:
        next_agents.append(
            {
                "id": args.agent_name,
                "name": args.agent_name,
                "workspace": str(workspace),
                "agentDir": str(agent_dir),
                "model": model,
            }
        )

    commands: list[list[str]] = [
        [openclaw_cmd, "config", "set", f"channels.grix.accounts.{args.agent_name}", json.dumps(account_json, ensure_ascii=False), "--strict-json"],
        [openclaw_cmd, "config", "set", "agents.list", json.dumps(next_agents, ensure_ascii=False), "--strict-json"],
        [openclaw_cmd, "agents", "bind", "--agent", args.agent_name, "--bind", f"grix:{args.agent_name}", "--json"],
        [openclaw_cmd, "config", "set", "tools.profile", json.dumps(str(current_profile or "coding")), "--strict-json"],
        [openclaw_cmd, "config", "set", "tools.alsoAllow", json.dumps(merge_tool_allowlist(current_allow), ensure_ascii=False), "--strict-json"],
        [openclaw_cmd, "config", "set", "tools.sessions.visibility", json.dumps(str(current_visibility or "agent")), "--strict-json"],
    ]
    if current_grix_enabled is False:
        commands.append([openclaw_cmd, "config", "set", "channels.grix.enabled", "true", "--strict-json"])
    commands.extend(
        [
            [openclaw_cmd, "config", "validate"],
            [openclaw_cmd, "config", "get", f"channels.grix.accounts.{args.agent_name}", "--json"],
            [openclaw_cmd, "config", "get", "agents.list", "--json"],
            [openclaw_cmd, "agents", "bindings", "--agent", args.agent_name, "--json"],
        ]
    )

    return {
        "agent_name": args.agent_name,
        "agent_id": args.agent_id,
        "workspace": str(workspace),
        "agent_dir": str(agent_dir),
        "model": model,
        "account": account_json,
        "agents_list": next_agents,
        "commands": commands,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Bind one Grix API agent into local OpenClaw config.")
    parser.add_argument("--agent-name", required=True)
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--api-endpoint", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--model", default="")
    parser.add_argument("--openclaw", default="openclaw")
    parser.add_argument("--openclaw-home", default="")
    parser.add_argument("--skip-current", action="store_true", help="Do not read current OpenClaw config before building the plan.")
    parser.add_argument("--dry-run", action="store_true", help="Only print the planned result and commands.")
    parser.add_argument("--json", action="store_true", help="Emit JSON summary.")
    args = parser.parse_args()

    try:
        plan = build_plan(args)
        created_files: list[str] = []
        command_results: list[dict[str, Any]] = []
        if not args.dry_run:
            created_files = ensure_minimal_persona(Path(plan["workspace"]))
            ensure_dir(Path(plan["agent_dir"]))
            for cmd in plan["commands"]:
                result = run_command(cmd)
                command_results.append(
                    {
                        "cmd": cmd,
                        "stdout": (result.stdout or "").strip(),
                        "stderr": (result.stderr or "").strip(),
                    }
                )
        payload = {
            "ok": True,
            "dry_run": bool(args.dry_run),
            "created_files": created_files,
            "command_results": command_results,
            **plan,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"agent={plan['agent_name']} workspace={plan['workspace']} dry_run={args.dry_run}")
            for cmd in plan["commands"]:
                print("$ " + " ".join(cmd))
        return 0
    except Exception as exc:  # noqa: BLE001
        payload = {"ok": False, "error": str(exc)}
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
