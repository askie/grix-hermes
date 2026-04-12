#!/usr/bin/env python3
"""Extract bind-local fields from JSON and forward them to bind_local.py."""

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


def extract_bind_fields(payload: dict[str, Any]) -> dict[str, str]:
    handoff = as_record(payload.get("handoff"))
    bind_local = as_record(handoff.get("bind_local"))
    if bind_local:
        return {
            "agent_name": clean_text(bind_local.get("agent_name")),
            "agent_id": clean_text(bind_local.get("agent_id")),
            "api_endpoint": clean_text(bind_local.get("api_endpoint")),
            "api_key": clean_text(bind_local.get("api_key")),
        }

    created_agent = as_record(payload.get("createdAgent"))
    if created_agent:
        return {
            "agent_name": clean_text(created_agent.get("agent_name") or created_agent.get("name")),
            "agent_id": clean_text(created_agent.get("id") or created_agent.get("agent_id")),
            "api_endpoint": clean_text(created_agent.get("api_endpoint") or payload.get("api_endpoint")),
            "api_key": clean_text(created_agent.get("api_key") or payload.get("api_key")),
        }

    return {
        "agent_name": clean_text(payload.get("agent_name") or payload.get("name")),
        "agent_id": clean_text(payload.get("agent_id") or payload.get("id")),
        "api_endpoint": clean_text(payload.get("api_endpoint")),
        "api_key": clean_text(payload.get("api_key")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read agent JSON and forward it to bind_local.py.")
    parser.add_argument("--from-file", default="")
    parser.add_argument("--model", default="")
    parser.add_argument("--openclaw", default="openclaw")
    parser.add_argument("--openclaw-home", default="")
    parser.add_argument("--skip-current", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = load_payload(args)
        bind_fields = extract_bind_fields(payload)
        missing = [key for key, value in bind_fields.items() if not value]
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
            "--openclaw",
            args.openclaw,
        ]
        if args.model:
            cmd.extend(["--model", args.model])
        if args.openclaw_home:
            cmd.extend(["--openclaw-home", args.openclaw_home])
        if args.skip_current:
            cmd.append("--skip-current")
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
