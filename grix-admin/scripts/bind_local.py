#!/usr/bin/env python3
"""Bind one remote Grix API agent into a local Hermes profile."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def resolve_default_hermes_home() -> Path:
    raw = clean_text(os.environ.get("HERMES_HOME")) or "~/.hermes"
    return Path(os.path.expanduser(raw)).resolve()


def resolve_profile_dir(profile_name: str) -> Path:
    normalized = clean_text(profile_name)
    if normalized in {"", "default"}:
        return resolve_default_hermes_home()
    return (Path.home() / ".hermes" / "profiles" / normalized).resolve()


def format_env_value(value: str) -> str:
    if not value:
        return ""
    if any(char.isspace() for char in value) or any(char in value for char in ['"', "#"]):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def read_env_lines(env_path: Path) -> list[str]:
    if not env_path.exists():
        return []
    return env_path.read_text(encoding="utf-8").splitlines()


def apply_env_changes(env_path: Path, updates: dict[str, str], removals: set[str]) -> dict[str, Any]:
    lines = read_env_lines(env_path)
    result_lines: list[str] = []
    changed_keys: list[str] = []
    seen: set[str] = set()

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            result_lines.append(raw_line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in removals:
            changed_keys.append(key)
            continue
        if key in updates:
            result_lines.append(f"{key}={format_env_value(updates[key])}")
            changed_keys.append(key)
            seen.add(key)
            continue
        result_lines.append(raw_line)

    for key, value in updates.items():
        if key in seen:
            continue
        result_lines.append(f"{key}={format_env_value(value)}")
        changed_keys.append(key)

    ensure_dir(env_path.parent)
    env_path.write_text("\n".join(result_lines).rstrip() + "\n", encoding="utf-8")
    return {
        "env_path": str(env_path),
        "changed_keys": sorted(set(changed_keys)),
    }


def run_command(cmd: list[str], *, check: bool = True, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, text=True, capture_output=True, env=env)
    if check and result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        raise RuntimeError(stderr or stdout or f"command failed: {' '.join(cmd)}")
    return result


def parse_optional_bool(value: Any) -> bool | None:
    normalized = clean_text(value).lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    return None


def resolve_management_policy(profile_exists: bool, is_main: bool | None) -> str:
    if is_main is True:
        return "main"
    if is_main is False:
        return "restricted"
    return "preserve" if profile_exists else "restricted"


def build_plan(args: argparse.Namespace) -> dict[str, Any]:
    profile_name = clean_text(args.profile_name) or args.agent_name
    profile_dir = resolve_profile_dir(profile_name)
    profile_exists = profile_dir.exists()
    profile_mode = args.profile_mode
    is_main = parse_optional_bool(args.is_main)
    management_policy = resolve_management_policy(profile_exists, is_main)
    skill_source_dir = "" if args.skip_skill_source else str(
        Path(clean_text(args.skill_source_dir) or Path(__file__).resolve().parents[2]).resolve()
    )

    if profile_exists and profile_mode == "create":
        raise RuntimeError(f"Hermes profile already exists: {profile_name}")
    if not profile_exists and profile_mode == "reuse":
        raise RuntimeError(f"Hermes profile does not exist: {profile_name}")

    create_cmd: list[str] | None = None
    if not profile_exists:
        create_cmd = [args.hermes, "profile", "create", profile_name, "--clone"]
        clone_from = clean_text(args.clone_from)
        if clone_from:
            create_cmd.extend(["--clone-from", clone_from])

    skill_endpoint = clean_text(args.skill_endpoint) or args.api_endpoint
    skill_agent_id = clean_text(args.skill_agent_id) or args.agent_id
    skill_api_key = clean_text(args.skill_api_key) or args.api_key
    skill_account_id = clean_text(args.skill_account_id)

    env_updates = {
        "GRIX_ENDPOINT": args.api_endpoint,
        "GRIX_AGENT_ID": args.agent_id,
        "GRIX_API_KEY": args.api_key,
        "GRIX_SKILL_ENDPOINT": skill_endpoint,
        "GRIX_SKILL_AGENT_ID": skill_agent_id,
        "GRIX_SKILL_API_KEY": skill_api_key,
    }
    env_removals: set[str] = set()

    account_id = clean_text(args.account_id)
    if account_id:
        env_updates["GRIX_ACCOUNT_ID"] = account_id
    if skill_account_id:
        env_updates["GRIX_SKILL_ACCOUNT_ID"] = skill_account_id
    elif account_id:
        env_updates["GRIX_SKILL_ACCOUNT_ID"] = account_id

    allowed_users = clean_text(args.allowed_users)
    allow_all_users = clean_text(args.allow_all_users).lower()
    if allowed_users:
        env_updates["GRIX_ALLOWED_USERS"] = allowed_users
        env_removals.add("GRIX_ALLOW_ALL_USERS")
    elif allow_all_users == "true":
        env_updates["GRIX_ALLOW_ALL_USERS"] = "true"
        env_removals.add("GRIX_ALLOWED_USERS")
    elif allow_all_users == "false":
        env_removals.add("GRIX_ALLOW_ALL_USERS")

    home_channel = clean_text(args.home_channel)
    home_channel_name = clean_text(args.home_channel_name)
    if home_channel:
        env_updates["GRIX_HOME_CHANNEL"] = home_channel
    if home_channel_name:
        env_updates["GRIX_HOME_CHANNEL_NAME"] = home_channel_name

    config_path = profile_dir / "config.yaml"
    env_path = profile_dir / ".env"

    commands: list[list[str]] = []
    if create_cmd:
        commands.append(create_cmd)
    if skill_source_dir:
        commands.append([
            args.node,
            str(Path(__file__).with_name("patch_profile_config.mjs")),
            "--config",
            str(config_path),
            "--external-dir",
            skill_source_dir,
            "--management-policy",
            management_policy,
            "--json",
        ])

    return {
        "profile_name": profile_name,
        "profile_dir": str(profile_dir),
        "profile_exists": profile_exists,
        "profile_mode": profile_mode,
        "agent_name": args.agent_name,
        "agent_id": args.agent_id,
        "is_main": is_main,
        "management_policy": management_policy,
        "api_endpoint": args.api_endpoint,
        "skill_source_dir": skill_source_dir,
        "env_path": str(env_path),
        "config_path": str(config_path),
        "env_updates": env_updates,
        "env_removals": sorted(env_removals),
        "commands": commands,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Bind one Grix API agent into a local Hermes profile.")
    parser.add_argument("--agent-name", required=True)
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--api-endpoint", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--profile-name", default="")
    parser.add_argument("--profile-mode", choices=["create", "reuse", "create-or-reuse"], default="create-or-reuse")
    parser.add_argument("--is-main", default="", choices=["", "true", "false"])
    parser.add_argument("--clone-from", default="")
    parser.add_argument("--skill-source-dir", default="")
    parser.add_argument("--skip-skill-source", action="store_true")
    parser.add_argument("--account-id", default="")
    parser.add_argument("--skill-endpoint", default="")
    parser.add_argument("--skill-agent-id", default="")
    parser.add_argument("--skill-api-key", default="")
    parser.add_argument("--skill-account-id", default="")
    parser.add_argument("--allowed-users", default="")
    parser.add_argument("--allow-all-users", default="", choices=["", "true", "false"])
    parser.add_argument("--home-channel", default="")
    parser.add_argument("--home-channel-name", default="")
    parser.add_argument("--hermes", default="hermes")
    parser.add_argument("--node", default="node")
    parser.add_argument("--dry-run", action="store_true", help="Only print the planned result and commands.")
    parser.add_argument("--json", action="store_true", help="Emit JSON summary.")
    args = parser.parse_args()

    try:
        plan = build_plan(args)
        created_profile = False
        env_result: dict[str, Any] | None = None
        config_result: dict[str, Any] | None = None
        command_results: list[dict[str, Any]] = []

        if not args.dry_run:
            for cmd in plan["commands"]:
                result = run_command(cmd)
                stdout = (result.stdout or "").strip()
                stderr = (result.stderr or "").strip()
                command_results.append({"cmd": cmd, "stdout": stdout, "stderr": stderr})
                if cmd[0] == args.hermes:
                    created_profile = True
                elif stdout:
                    config_result = json.loads(stdout)

            env_result = apply_env_changes(
                Path(plan["env_path"]),
                plan["env_updates"],
                set(plan["env_removals"]),
            )

        payload = {
            "ok": True,
            "dry_run": bool(args.dry_run),
            "created_profile": created_profile,
            "env_result": env_result,
            "config_result": config_result,
            "command_results": command_results,
            **plan,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"profile={plan['profile_name']} agent={plan['agent_name']} dry_run={args.dry_run}")
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
