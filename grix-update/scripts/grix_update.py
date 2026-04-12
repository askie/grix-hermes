#!/usr/bin/env python3
"""Run OpenClaw Grix plugin update flow with a stable CLI surface."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Any


def run_command(cmd: list[str], *, check: bool = True) -> dict[str, Any]:
    result = subprocess.run(cmd, text=True, capture_output=True)
    payload = {
        "cmd": cmd,
        "code": result.returncode,
        "stdout": (result.stdout or "").strip(),
        "stderr": (result.stderr or "").strip(),
    }
    if check and result.returncode != 0:
        raise RuntimeError(payload["stderr"] or payload["stdout"] or f"command failed: {' '.join(cmd)}")
    return payload


def build_plan(args: argparse.Namespace) -> list[list[str]]:
    openclaw_cmd = args.openclaw
    plugin_id = args.plugin_id
    inspect_cmd = [openclaw_cmd, "plugins", "inspect", plugin_id, "--json"]
    update_probe_cmd = [openclaw_cmd, "plugins", "update", plugin_id, "--dry-run"]
    apply_cmd = [openclaw_cmd, "plugins", "update", plugin_id]
    doctor_cmd = [openclaw_cmd, "plugins", "doctor"]
    restart_cmd = [openclaw_cmd, "gateway", "restart"]
    health_cmd = [openclaw_cmd, "health", "--json"]

    if args.mode == "check-only":
        return [inspect_cmd, update_probe_cmd]

    if args.mode == "apply-update":
        commands = [inspect_cmd, apply_cmd, doctor_cmd]
        if args.allow_restart:
            commands.append(restart_cmd)
        commands.append(health_cmd)
        return commands

    if args.mode == "check-and-apply":
        commands = [inspect_cmd, update_probe_cmd, apply_cmd, doctor_cmd]
        if args.allow_restart:
            commands.append(restart_cmd)
        commands.append(health_cmd)
        return commands

    raise RuntimeError(f"unsupported mode: {args.mode}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Grix/OpenClaw plugin update workflow.")
    parser.add_argument("--mode", choices=["check-only", "apply-update", "check-and-apply"], default="check-and-apply")
    parser.add_argument("--plugin-id", default="grix")
    parser.add_argument("--allow-restart", default="true", choices=["true", "false"])
    parser.add_argument("--openclaw", default="openclaw")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    args.allow_restart = args.allow_restart == "true"

    try:
        commands = build_plan(args)
        results: list[dict[str, Any]] = []
        if not args.dry_run:
            for cmd in commands:
                results.append(run_command(cmd))
        payload = {
            "ok": True,
            "mode": args.mode,
            "plugin_id": args.plugin_id,
            "allow_restart": args.allow_restart,
            "dry_run": bool(args.dry_run),
            "commands": commands,
            "results": results,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"mode={args.mode} plugin_id={args.plugin_id} dry_run={args.dry_run}")
            for cmd in commands:
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
