#!/usr/bin/env python3
"""Update the grix-hermes skill bundle for Hermes deployments."""

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


def default_install_dir() -> Path:
    hermes_home = Path(os.path.expanduser(clean_text(os.environ.get("HERMES_HOME")) or "~/.hermes")).resolve()
    return hermes_home / "skills" / "grix-hermes"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def run_command(cmd: list[str], *, cwd: str | None = None, check: bool = True) -> dict[str, Any]:
    result = subprocess.run(cmd, text=True, capture_output=True, cwd=cwd)
    payload = {
        "cmd": cmd,
        "cwd": cwd or "",
        "code": result.returncode,
        "stdout": (result.stdout or "").strip(),
        "stderr": (result.stderr or "").strip(),
    }
    if check and result.returncode != 0:
        raise RuntimeError(payload["stderr"] or payload["stdout"] or f"command failed: {' '.join(cmd)}")
    return payload


def detect_repo_state(repo_root: Path, git_cmd: str) -> dict[str, Any]:
    state = {
        "repo_root": str(repo_root),
        "has_git": (repo_root / ".git").exists(),
        "branch": "",
        "upstream": "",
        "dirty": False,
        "dirty_entries": [],
    }
    if not state["has_git"]:
        return state

    branch = run_command([git_cmd, "rev-parse", "--abbrev-ref", "HEAD"], cwd=str(repo_root))
    state["branch"] = branch["stdout"]
    status = run_command([git_cmd, "status", "--short"], cwd=str(repo_root))
    state["dirty_entries"] = [line for line in status["stdout"].splitlines() if line.strip()]
    state["dirty"] = bool(state["dirty_entries"])
    upstream = run_command(
        [git_cmd, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        cwd=str(repo_root),
        check=False,
    )
    if upstream["code"] == 0:
        state["upstream"] = upstream["stdout"]
    return state


def build_plan(args: argparse.Namespace) -> dict[str, Any]:
    repo_root = Path(clean_text(args.repo_root) or project_root()).resolve()
    raw_install_dir = clean_text(args.install_dir)
    install_dir = Path(raw_install_dir).resolve() if raw_install_dir else None
    if install_dir is None and args.mode in {"apply-update", "check-and-apply"}:
        install_dir = default_install_dir()
    repo_state = detect_repo_state(repo_root, args.git)
    strategy = "git-pull"
    if not repo_state["has_git"]:
        if args.mode != "check-only":
            raise RuntimeError("Repository root is not a git checkout. Pass a git repo root for Hermes skill updates.")
        strategy = "inspect-only"

    commands: list[dict[str, Any]] = []

    if repo_state["has_git"]:
        commands.extend(
            [
                {"cmd": [args.git, "status", "--short"], "cwd": str(repo_root), "stage": "inspect"},
                {"cmd": [args.git, "rev-parse", "--abbrev-ref", "HEAD"], "cwd": str(repo_root), "stage": "inspect"},
                {"cmd": [args.git, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "cwd": str(repo_root), "stage": "inspect", "check": False},
            ]
        )
        if args.mode in {"check-only", "check-and-apply"}:
            commands.append({"cmd": [args.git, "fetch", "--prune"], "cwd": str(repo_root), "stage": "inspect"})
            if repo_state["upstream"]:
                commands.append(
                    {
                        "cmd": [args.git, "rev-list", "--left-right", "--count", f"HEAD...{repo_state['upstream']}"],
                        "cwd": str(repo_root),
                        "stage": "inspect",
                    }
                )
        if args.mode in {"apply-update", "check-and-apply"}:
            commands.append({"cmd": [args.git, "pull", "--ff-only"], "cwd": str(repo_root), "stage": "apply"})
            commands.append({"cmd": [args.npm, "install"], "cwd": str(repo_root), "stage": "apply"})

    if install_dir and args.mode in {"apply-update", "check-and-apply"}:
        commands.append(
            {
                "cmd": [args.node, str(repo_root / "bin" / "grix-hermes.mjs"), "install", "--dest", str(install_dir), "--force"],
                "cwd": str(repo_root),
                "stage": "apply",
            }
        )

    cron_ready = repo_state["has_git"] and not repo_state["dirty"]

    return {
        "repo_root": str(repo_root),
        "install_dir": str(install_dir) if install_dir else "",
        "mode": args.mode,
        "strategy": strategy,
        "allow_dirty": args.allow_dirty,
        "repo_state": repo_state,
        "cron_ready": cron_ready,
        "commands": commands,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Update the grix-hermes skill bundle for Hermes.")
    parser.add_argument("--mode", choices=["check-only", "apply-update", "check-and-apply"], default="check-and-apply")
    parser.add_argument("--repo-root", default="")
    parser.add_argument("--install-dir", default="", help="Optional Hermes install dir to refresh after pulling the repo.")
    parser.add_argument("--allow-dirty", default="false", choices=["true", "false"])
    parser.add_argument("--git", default="git")
    parser.add_argument("--npm", default="npm")
    parser.add_argument("--node", default="node")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    args.allow_dirty = args.allow_dirty == "true"

    try:
        plan = build_plan(args)
        results: list[dict[str, Any]] = []

        if not args.dry_run:
            repo_state = plan["repo_state"]
            if plan["mode"] in {"apply-update", "check-and-apply"} and repo_state["has_git"] and repo_state["dirty"] and not args.allow_dirty:
                raise RuntimeError("Repository has uncommitted changes; refuse to auto-update without --allow-dirty true.")

            for entry in plan["commands"]:
                cmd = entry["cmd"]
                cwd = entry["cwd"] or None
                check = entry.get("check", True)
                results.append(run_command(cmd, cwd=cwd, check=check))

        payload = {
            "ok": True,
            "dry_run": bool(args.dry_run),
            "results": results,
            **plan,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"mode={plan['mode']} strategy={plan['strategy']} dry_run={args.dry_run}")
            for entry in plan["commands"]:
                print("$ " + " ".join(entry["cmd"]))
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
