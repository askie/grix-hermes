#!/usr/bin/env python3
"""Create one API agent through grix_auth.py and optionally bind it locally."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


def load_or_create_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.agent_json_file:
        return json.loads(Path(args.agent_json_file).read_text(encoding="utf-8"))

    auth_script = Path(__file__).with_name("grix_auth.py")
    cmd = [
        sys.executable,
        str(auth_script),
        "--base-url",
        args.base_url,
        "create-api-agent",
        "--access-token",
        args.access_token,
        "--agent-name",
        args.agent_name,
    ]
    if args.avatar_url:
        cmd.extend(["--avatar-url", args.avatar_url])
    result = subprocess.run(cmd, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "").strip())
    return json.loads(result.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create one API agent and continue to local bind.")
    parser.add_argument("--access-token", default="")
    parser.add_argument("--agent-name", default="")
    parser.add_argument("--avatar-url", default="")
    parser.add_argument("--base-url", default="https://grix.dhf.pub")
    parser.add_argument("--agent-json-file", default="", help="Use an existing create-api-agent JSON result instead of calling HTTP.")
    parser.add_argument("--model", default="")
    parser.add_argument("--openclaw", default="openclaw")
    parser.add_argument("--openclaw-home", default="")
    parser.add_argument("--skip-current", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        if not args.agent_json_file and (not args.access_token or not args.agent_name):
            raise RuntimeError("Need --agent-json-file or both --access-token and --agent-name.")
        created_payload = load_or_create_payload(args)

        bind_script = Path(__file__).resolve().parents[2] / "grix-admin" / "scripts" / "bind_from_json.py"
        cmd = [
            sys.executable,
            str(bind_script),
        ]
        if args.model:
            cmd.extend(["--model", args.model])
        if args.openclaw:
            cmd.extend(["--openclaw", args.openclaw])
        if args.openclaw_home:
            cmd.extend(["--openclaw-home", args.openclaw_home])
        if args.skip_current:
            cmd.append("--skip-current")
        if args.dry_run:
            cmd.append("--dry-run")
        if args.json:
            cmd.append("--json")

        bind_result = subprocess.run(
            cmd,
            input=json.dumps(created_payload, ensure_ascii=False),
            text=True,
            capture_output=True,
        )
        if bind_result.returncode != 0:
            raise RuntimeError((bind_result.stderr or bind_result.stdout or "").strip())

        if args.json:
            payload = {
                "ok": True,
                "created_agent": created_payload,
                "bind_result": json.loads(bind_result.stdout) if bind_result.stdout.strip() else None,
            }
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            if bind_result.stdout:
                sys.stdout.write(bind_result.stdout)
        return 0
    except Exception as exc:  # noqa: BLE001
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
