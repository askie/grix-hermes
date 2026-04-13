#!/usr/bin/env python3
"""Extract Hermes bind fields from JSON and forward them to bind_local.py."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


def load_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.from_file:
        return json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    if not raw:
        raise RuntimeError("No JSON input provided.")
    return json.loads(raw)


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def as_record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def clean_bool_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    normalized = clean_text(value).lower()
    if normalized in {"true", "false"}:
        return normalized
    return ""


def first_present(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def extract_bind_fields(payload: dict[str, Any]) -> dict[str, str]:
    handoff = as_record(payload.get("handoff"))
    bind_hermes = as_record(handoff.get("bind_hermes"))
    if bind_hermes:
        return {
            "profile_name": clean_text(bind_hermes.get("profile_name")),
            "agent_name": clean_text(bind_hermes.get("agent_name")),
            "agent_id": clean_text(bind_hermes.get("agent_id")),
            "api_endpoint": clean_text(bind_hermes.get("api_endpoint")),
            "api_key": clean_text(bind_hermes.get("api_key")),
            "is_main": clean_bool_text(bind_hermes.get("is_main")),
        }

    bind_local = as_record(handoff.get("bind_local"))
    if bind_local:
        return {
            "profile_name": clean_text(bind_local.get("profile_name") or bind_local.get("agent_name")),
            "agent_name": clean_text(bind_local.get("agent_name")),
            "agent_id": clean_text(bind_local.get("agent_id")),
            "api_endpoint": clean_text(bind_local.get("api_endpoint")),
            "api_key": clean_text(bind_local.get("api_key")),
            "is_main": clean_bool_text(bind_local.get("is_main")),
        }

    created_agent = as_record(payload.get("createdAgent"))
    if created_agent:
        return {
            "profile_name": clean_text(created_agent.get("profile_name") or created_agent.get("agent_name") or created_agent.get("name")),
            "agent_name": clean_text(created_agent.get("agent_name") or created_agent.get("name")),
            "agent_id": clean_text(created_agent.get("id") or created_agent.get("agent_id")),
            "api_endpoint": clean_text(created_agent.get("api_endpoint") or payload.get("api_endpoint")),
            "api_key": clean_text(created_agent.get("api_key") or payload.get("api_key")),
            "is_main": clean_bool_text(
                first_present(
                    created_agent.get("is_main"),
                    payload.get("requestedIsMain"),
                    payload.get("requested_is_main"),
                    payload.get("is_main"),
                )
            ),
        }

    return {
        "profile_name": clean_text(payload.get("profile_name") or payload.get("agent_name") or payload.get("name")),
        "agent_name": clean_text(payload.get("agent_name") or payload.get("name")),
        "agent_id": clean_text(payload.get("agent_id") or payload.get("id")),
        "api_endpoint": clean_text(payload.get("api_endpoint")),
        "api_key": clean_text(payload.get("api_key")),
        "is_main": clean_bool_text(payload.get("is_main")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read agent JSON and forward it to Hermes bind helper.")
    parser.add_argument("--from-file", default="")
    parser.add_argument("--profile-name", default="")
    parser.add_argument("--profile-mode", default="create-or-reuse", choices=["create", "reuse", "create-or-reuse"])
    parser.add_argument("--is-main", default="", choices=["", "true", "false"])
    parser.add_argument("--clone-from", default="")
    parser.add_argument("--install-dir", default="")
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
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = load_payload(args)
        bind_fields = extract_bind_fields(payload)
        if not bind_fields.get("profile_name"):
            bind_fields["profile_name"] = bind_fields.get("agent_name", "")
        missing = [key for key in ["profile_name", "agent_name", "agent_id", "api_endpoint", "api_key"] if not bind_fields.get(key)]
        if missing:
            raise RuntimeError(f"Missing bind-local fields: {', '.join(missing)}")
        bind_script = Path(__file__).with_name("bind_local.py")
        cmd = [
            sys.executable,
            str(bind_script),
            "--agent-name",
            bind_fields["agent_name"],
            "--agent-id",
            bind_fields["agent_id"],
            "--api-endpoint",
            bind_fields["api_endpoint"],
            "--api-key",
            bind_fields["api_key"],
            "--profile-mode",
            args.profile_mode,
            "--hermes",
            args.hermes,
            "--node",
            args.node,
        ]
        profile_name = args.profile_name or bind_fields["profile_name"]
        if profile_name:
            cmd.extend(["--profile-name", profile_name])
        is_main = clean_bool_text(args.is_main) or bind_fields.get("is_main", "")
        if is_main:
            cmd.extend(["--is-main", is_main])
        if args.clone_from:
            cmd.extend(["--clone-from", args.clone_from])
        if args.install_dir:
            cmd.extend(["--install-dir", args.install_dir])
        if args.account_id:
            cmd.extend(["--account-id", args.account_id])
        if args.skill_endpoint:
            cmd.extend(["--skill-endpoint", args.skill_endpoint])
        if args.skill_agent_id:
            cmd.extend(["--skill-agent-id", args.skill_agent_id])
        if args.skill_api_key:
            cmd.extend(["--skill-api-key", args.skill_api_key])
        if args.skill_account_id:
            cmd.extend(["--skill-account-id", args.skill_account_id])
        if args.allowed_users:
            cmd.extend(["--allowed-users", args.allowed_users])
        if args.allow_all_users:
            cmd.extend(["--allow-all-users", args.allow_all_users])
        if args.home_channel:
            cmd.extend(["--home-channel", args.home_channel])
        if args.home_channel_name:
            cmd.extend(["--home-channel-name", args.home_channel_name])
        if args.dry_run:
            cmd.append("--dry-run")
        if args.json:
            cmd.append("--json")

        result = subprocess.run(cmd, text=True, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "").strip())

        if result.stdout:
            sys.stdout.write(result.stdout)
        return 0
    except Exception as exc:  # noqa: BLE001
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
