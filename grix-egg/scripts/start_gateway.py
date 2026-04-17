#!/usr/bin/env python3
"""Start and verify a Hermes gateway for one profile."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


NEGATIVE_STATUS_HINTS = [
    "not running",
    "not installed",
    "installed but not running",
    "inactive",
    "stopped",
]

POSITIVE_STATUS_HINTS = [
    "running",
    "healthy",
    "installed and running",
]


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def resolve_hermes_home(explicit: str) -> Path:
    raw = clean_text(explicit) or clean_text(os.environ.get("HERMES_HOME")) or "~/.hermes"
    return Path(os.path.expanduser(raw)).resolve()


def resolve_profile_dir(hermes_home: Path, profile_name: str) -> Path:
    normalized = clean_text(profile_name)
    if normalized in {"", "default"}:
        return hermes_home
    return (hermes_home / "profiles" / normalized).resolve()


def ensure_hermes_binary(hermes_cmd: str) -> None:
    if os.sep in hermes_cmd:
        candidate = Path(os.path.expanduser(hermes_cmd)).resolve()
        if not candidate.exists():
            raise RuntimeError(f"Hermes CLI not found: {candidate}")
        return
    if shutil.which(hermes_cmd):
        return
    raise RuntimeError(
        f"Hermes CLI '{hermes_cmd}' is not available in PATH. "
        "Install Hermes first or pass --hermes with an absolute path."
    )


def profile_prefix(hermes_cmd: str, profile_name: str) -> list[str]:
    normalized = clean_text(profile_name)
    if normalized in {"", "default"}:
        return [hermes_cmd]
    return [hermes_cmd, "--profile", normalized]


def run_command(cmd: list[str], env: dict[str, str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, text=True, capture_output=True, env=env)
    if check and result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        raise RuntimeError(stderr or stdout or f"command failed: {' '.join(cmd)}")
    return result


def summarize_output(result: subprocess.CompletedProcess[str]) -> str:
    parts = [clean_text(result.stdout), clean_text(result.stderr)]
    return "\n".join(part for part in parts if part)


def status_is_running(result: subprocess.CompletedProcess[str]) -> bool:
    if result.returncode != 0:
        return False
    combined = summarize_output(result).lower()
    if not combined:
        return False
    if any(hint in combined for hint in NEGATIVE_STATUS_HINTS):
        return False
    return any(hint in combined for hint in POSITIVE_STATUS_HINTS)


def main() -> int:
    parser = argparse.ArgumentParser(description="Start a Hermes gateway and verify it is running.")
    parser.add_argument("--profile-name", default="")
    parser.add_argument("--hermes-home", default="")
    parser.add_argument("--hermes", default="hermes")
    parser.add_argument("--start-subcommand", choices=["start", "run"], default="start")
    parser.add_argument("--status-subcommand", default="status")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        hermes_home = resolve_hermes_home(args.hermes_home)
        profile_name = clean_text(args.profile_name)
        profile_dir = resolve_profile_dir(hermes_home, profile_name)
        if not profile_dir.exists():
            raise RuntimeError(f"Hermes profile does not exist: {profile_dir}")

        ensure_hermes_binary(args.hermes)
        env = dict(os.environ)
        env["HERMES_HOME"] = str(hermes_home)

        command_prefix = profile_prefix(args.hermes, profile_name)
        status_cmd = command_prefix + ["gateway", args.status_subcommand]
        status_before = run_command(status_cmd, env=env, check=False)
        already_running = status_is_running(status_before)

        start_result: subprocess.CompletedProcess[str] | None = None
        if not already_running:
            start_cmd = command_prefix + ["gateway", args.start_subcommand]
            start_result = run_command(start_cmd, env=env, check=False)
            if start_result.returncode != 0:
                raise RuntimeError(
                    "Failed to start Hermes gateway.\n"
                    f"command: {' '.join(start_cmd)}\n"
                    f"output:\n{summarize_output(start_result)}"
                )

        status_after = run_command(status_cmd, env=env, check=False)
        if not status_is_running(status_after):
            raise RuntimeError(
                "Hermes gateway did not report a running state after startup.\n"
                f"command: {' '.join(status_cmd)}\n"
                f"output:\n{summarize_output(status_after)}"
            )

        payload = {
            "ok": True,
            "profile_name": profile_name or "default",
            "hermes_home": str(hermes_home),
            "profile_dir": str(profile_dir),
            "already_running": already_running,
            "start_subcommand": args.start_subcommand,
            "status_before": {
                "code": status_before.returncode,
                "stdout": clean_text(status_before.stdout),
                "stderr": clean_text(status_before.stderr),
            },
            "status_after": {
                "code": status_after.returncode,
                "stdout": clean_text(status_after.stdout),
                "stderr": clean_text(status_after.stderr),
            },
            "start_result": None if start_result is None else {
                "code": start_result.returncode,
                "stdout": clean_text(start_result.stdout),
                "stderr": clean_text(start_result.stderr),
            },
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(json.dumps(payload, ensure_ascii=False))
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
