#!/usr/bin/env python3
"""Run a Hermes-side Grix install flow end to end."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Any


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def as_record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def clean_bool_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    normalized = clean_text(value).lower()
    return normalized if normalized in {"true", "false"} else ""


def truthy(value: Any) -> bool:
    normalized = clean_text(value).lower()
    return normalized in {"1", "true", "yes", "on"}


def load_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.from_file:
        return json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    if not raw:
        raise RuntimeError("No install flow JSON provided.")
    return json.loads(raw)


def normalize_route(raw_route: Any) -> str:
    route = clean_text(raw_route)
    if route == "openclaw_create_new":
        return "hermes_create_new"
    if route == "openclaw_existing":
        return "hermes_existing"
    return route


def required_for_route(route: str) -> list[str]:
    if route in {"hermes_create_new", "hermes_existing"}:
        return ["install_id", "main_agent"]
    return ["install_id"]


def resolve_hermes_home(explicit: str) -> Path:
    raw = clean_text(explicit) or clean_text(os.environ.get("HERMES_HOME")) or "~/.hermes"
    return Path(os.path.expanduser(raw)).resolve()


def resolve_profile_dir(hermes_home: Path, profile_name: str) -> Path:
    normalized = clean_text(profile_name)
    if normalized in {"", "default"}:
        return hermes_home
    return (hermes_home / "profiles" / normalized).resolve()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_install_dir(hermes_home: Path) -> Path:
    return hermes_home / "skills" / "grix-hermes"


def run_command(
    cmd: list[str],
    *,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
    input_text: str | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        env=env,
        cwd=cwd,
        input=input_text,
    )
    if check and result.returncode != 0:
        stderr = clean_text(result.stderr)
        stdout = clean_text(result.stdout)
        raise RuntimeError(stderr or stdout or f"command failed: {' '.join(cmd)}")
    return result


def parse_json_output(result: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    raw = clean_text(result.stdout)
    if not raw:
        return {}
    return json.loads(raw)


def append_text_flag(cmd: list[str], flag: str, value: Any) -> None:
    text = clean_text(value)
    if text:
        cmd.extend([flag, text])


def append_bool_flag(cmd: list[str], flag: str, value: Any) -> None:
    normalized = clean_bool_text(value)
    if normalized:
        cmd.extend([flag, normalized])


def merge_bind_options(payload: dict[str, Any], profile_name: str, is_main_text: str) -> dict[str, Any]:
    bind = as_record(payload.get("bind"))
    install = as_record(payload.get("install"))
    return {
        "profile_name": clean_text(profile_name) or clean_text(bind.get("profile_name")) or clean_text(install.get("profile_name")),
        "profile_mode": clean_text(bind.get("profile_mode")) or clean_text(payload.get("profile_mode")) or "create-or-reuse",
        "clone_from": clean_text(bind.get("clone_from")) or clean_text(payload.get("clone_from")),
        "account_id": clean_text(bind.get("account_id")) or clean_text(payload.get("account_id")),
        "skill_endpoint": clean_text(bind.get("skill_endpoint")) or clean_text(payload.get("skill_endpoint")),
        "skill_agent_id": clean_text(bind.get("skill_agent_id")) or clean_text(payload.get("skill_agent_id")),
        "skill_api_key": clean_text(bind.get("skill_api_key")) or clean_text(payload.get("skill_api_key")),
        "skill_account_id": clean_text(bind.get("skill_account_id")) or clean_text(payload.get("skill_account_id")),
        "allowed_users": clean_text(bind.get("allowed_users")) or clean_text(payload.get("allowed_users")),
        "allow_all_users": clean_bool_text(bind.get("allow_all_users") or payload.get("allow_all_users")),
        "home_channel": clean_text(bind.get("home_channel")) or clean_text(payload.get("home_channel")),
        "home_channel_name": clean_text(bind.get("home_channel_name")) or clean_text(payload.get("home_channel_name")),
        "is_main": is_main_text or clean_bool_text(bind.get("is_main") or payload.get("is_main")),
    }


def build_bind_input_payload(payload: dict[str, Any], bind_options: dict[str, Any]) -> dict[str, Any]:
    bind_hermes = as_record(payload.get("bind_hermes"))
    if bind_hermes:
        return {**bind_hermes, "profile_name": bind_options["profile_name"] or clean_text(bind_hermes.get("profile_name"))}

    remote_agent = as_record(payload.get("remote_agent"))
    if remote_agent:
        return {
            "profile_name": bind_options["profile_name"] or clean_text(remote_agent.get("profile_name") or remote_agent.get("agent_name")),
            "agent_name": clean_text(remote_agent.get("agent_name") or remote_agent.get("name")),
            "agent_id": clean_text(remote_agent.get("agent_id") or remote_agent.get("id")),
            "api_endpoint": clean_text(remote_agent.get("api_endpoint")),
            "api_key": clean_text(remote_agent.get("api_key")),
            "is_main": bind_options["is_main"],
        }

    return payload


def infer_profile_name(payload: dict[str, Any], install: dict[str, Any]) -> str:
    direct = clean_text(payload.get("profile_name")) or clean_text(install.get("profile_name"))
    if direct:
        return direct
    remote_agent = as_record(payload.get("remote_agent"))
    if remote_agent:
        return clean_text(remote_agent.get("profile_name") or remote_agent.get("agent_name") or remote_agent.get("name"))
    register = as_record(payload.get("grix_register"))
    if register:
        return clean_text(register.get("profile_name") or register.get("agent_name"))
    admin = as_record(payload.get("grix_admin"))
    if admin:
        return clean_text(admin.get("profile_name") or admin.get("agent_name"))
    bind_hermes = as_record(payload.get("bind_hermes"))
    if bind_hermes:
        return clean_text(bind_hermes.get("profile_name") or bind_hermes.get("agent_name"))
    return ""


def build_bind_step(
    payload: dict[str, Any],
    *,
    args: argparse.Namespace,
    install_dir: Path,
    bind_options: dict[str, Any],
) -> dict[str, Any]:
    register = as_record(payload.get("grix_register"))
    admin = as_record(payload.get("grix_admin"))

    if register:
        cmd = [
            args.python,
            args.create_and_bind_script,
            "--profile-mode",
            bind_options["profile_mode"],
            "--install-dir",
            str(install_dir),
            "--hermes",
            args.hermes,
            "--node",
            args.node,
        ]
        append_text_flag(cmd, "--access-token", register.get("access_token"))
        append_text_flag(cmd, "--agent-name", register.get("agent_name") or bind_options["profile_name"])
        append_text_flag(cmd, "--avatar-url", register.get("avatar_url"))
        append_text_flag(cmd, "--base-url", register.get("base_url"))
        append_text_flag(cmd, "--profile-name", bind_options["profile_name"])
        append_bool_flag(cmd, "--is-main", bind_options["is_main"] or register.get("is_main"))
        append_text_flag(cmd, "--clone-from", bind_options["clone_from"])
        append_text_flag(cmd, "--account-id", bind_options["account_id"])
        append_text_flag(cmd, "--skill-endpoint", bind_options["skill_endpoint"])
        append_text_flag(cmd, "--skill-agent-id", bind_options["skill_agent_id"])
        append_text_flag(cmd, "--skill-api-key", bind_options["skill_api_key"])
        append_text_flag(cmd, "--skill-account-id", bind_options["skill_account_id"])
        append_text_flag(cmd, "--allowed-users", bind_options["allowed_users"])
        append_bool_flag(cmd, "--allow-all-users", bind_options["allow_all_users"])
        append_text_flag(cmd, "--home-channel", bind_options["home_channel"])
        append_text_flag(cmd, "--home-channel-name", bind_options["home_channel_name"])
        cmd.append("--json")
        return {
            "kind": "register",
            "primary_cmd": cmd,
            "primary_input": None,
        }

    if admin:
        create_cmd = [args.node, args.admin_script, "--action", "create_grix"]
        append_text_flag(create_cmd, "--agent-name", admin.get("agent_name") or bind_options["profile_name"])
        append_text_flag(create_cmd, "--introduction", admin.get("introduction"))
        append_bool_flag(create_cmd, "--is-main", bind_options["is_main"] or admin.get("is_main"))
        append_text_flag(create_cmd, "--category-id", admin.get("category_id"))
        append_text_flag(create_cmd, "--category-name", admin.get("category_name"))
        append_text_flag(create_cmd, "--parent-category-id", admin.get("parent_category_id"))
        bind_cmd = [
            args.python,
            args.bind_json_script,
            "--profile-mode",
            bind_options["profile_mode"],
            "--install-dir",
            str(install_dir),
            "--hermes",
            args.hermes,
            "--node",
            args.node,
        ]
        append_text_flag(bind_cmd, "--profile-name", bind_options["profile_name"])
        append_bool_flag(bind_cmd, "--is-main", bind_options["is_main"])
        append_text_flag(bind_cmd, "--clone-from", bind_options["clone_from"])
        append_text_flag(bind_cmd, "--account-id", bind_options["account_id"])
        append_text_flag(bind_cmd, "--skill-endpoint", bind_options["skill_endpoint"])
        append_text_flag(bind_cmd, "--skill-agent-id", bind_options["skill_agent_id"])
        append_text_flag(bind_cmd, "--skill-api-key", bind_options["skill_api_key"])
        append_text_flag(bind_cmd, "--skill-account-id", bind_options["skill_account_id"])
        append_text_flag(bind_cmd, "--allowed-users", bind_options["allowed_users"])
        append_bool_flag(bind_cmd, "--allow-all-users", bind_options["allow_all_users"])
        append_text_flag(bind_cmd, "--home-channel", bind_options["home_channel"])
        append_text_flag(bind_cmd, "--home-channel-name", bind_options["home_channel_name"])
        bind_cmd.append("--json")
        return {
            "kind": "admin",
            "primary_cmd": create_cmd,
            "primary_input": None,
            "followup_cmd": bind_cmd,
        }

    bind_cmd = [
        args.python,
        args.bind_json_script,
        "--profile-mode",
        bind_options["profile_mode"],
        "--install-dir",
        str(install_dir),
        "--hermes",
        args.hermes,
        "--node",
        args.node,
    ]
    append_text_flag(bind_cmd, "--profile-name", bind_options["profile_name"])
    append_bool_flag(bind_cmd, "--is-main", bind_options["is_main"])
    append_text_flag(bind_cmd, "--clone-from", bind_options["clone_from"])
    append_text_flag(bind_cmd, "--account-id", bind_options["account_id"])
    append_text_flag(bind_cmd, "--skill-endpoint", bind_options["skill_endpoint"])
    append_text_flag(bind_cmd, "--skill-agent-id", bind_options["skill_agent_id"])
    append_text_flag(bind_cmd, "--skill-api-key", bind_options["skill_api_key"])
    append_text_flag(bind_cmd, "--skill-account-id", bind_options["skill_account_id"])
    append_text_flag(bind_cmd, "--allowed-users", bind_options["allowed_users"])
    append_bool_flag(bind_cmd, "--allow-all-users", bind_options["allow_all_users"])
    append_text_flag(bind_cmd, "--home-channel", bind_options["home_channel"])
    append_text_flag(bind_cmd, "--home-channel-name", bind_options["home_channel_name"])
    bind_cmd.append("--json")
    bind_payload = build_bind_input_payload(payload, bind_options)
    return {
        "kind": "bind",
        "primary_cmd": bind_cmd,
        "primary_input": json.dumps(bind_payload, ensure_ascii=False),
    }


def write_soul(profile_dir: Path, payload: dict[str, Any]) -> str:
    soul_file = clean_text(payload.get("soul_file"))
    soul_markdown = payload.get("soul_markdown")
    if soul_file:
        content = Path(soul_file).read_text(encoding="utf-8")
    elif isinstance(soul_markdown, str) and soul_markdown.strip():
        content = soul_markdown
    else:
        return ""
    target = profile_dir / "SOUL.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")
    return str(target)


def collect_backup_paths(profile_dir: Path, install_dir: Path) -> list[Path]:
    candidates = [profile_dir / ".env", profile_dir / "config.yaml", profile_dir / "SOUL.md", install_dir]
    return [candidate for candidate in candidates if candidate.exists()]


def backup_existing_state(hermes_home: Path, route: str, profile_dir: Path, install_dir: Path) -> str:
    if route != "hermes_existing":
        return ""
    sources = collect_backup_paths(profile_dir, install_dir)
    if not sources:
        return ""
    backup_root = hermes_home / "backups" / "grix-egg" / time.strftime("%Y%m%d-%H%M%S")
    backup_root.mkdir(parents=True, exist_ok=True)
    for source in sources:
        destination = backup_root / source.name
        if source.is_dir():
            shutil.copytree(source, destination, dirs_exist_ok=True)
        else:
            shutil.copy2(source, destination)
    return str(backup_root)


def build_install_command(args: argparse.Namespace, install_dir: Path) -> list[str]:
    return [args.node, str(repo_root() / "bin" / "grix-hermes.mjs"), "install", "--dest", str(install_dir), "--force"]


def build_start_command(args: argparse.Namespace, hermes_home: Path, profile_name: str) -> list[str]:
    return [
        args.python,
        args.start_script,
        "--profile-name",
        profile_name,
        "--hermes-home",
        str(hermes_home),
        "--hermes",
        args.hermes,
        "--json",
    ]


def build_card_command(args: argparse.Namespace, install_id: str, status: str, step: str, summary: str) -> list[str]:
    return [
        args.node,
        args.card_script,
        "egg-status",
        "--install-id",
        install_id,
        "--status",
        status,
        "--step",
        step,
        "--summary",
        summary,
    ]


def send_message(args: argparse.Namespace, target: str, message: str, env: dict[str, str]) -> dict[str, Any]:
    result = run_command(
        [args.node, args.send_script, "--to", target, "--message", message],
        env=env,
    )
    return parse_json_output(result)


def maybe_send_status_card(
    *,
    args: argparse.Namespace,
    install_id: str,
    status: str,
    step: str,
    summary: str,
    target: str,
    env: dict[str, str],
) -> dict[str, Any] | None:
    if not clean_text(target):
        return None
    card = run_command(build_card_command(args, install_id, status, step, summary), env=env)
    return send_message(args, target, clean_text(card.stdout), env)


def extract_session_id(payload: dict[str, Any]) -> str:
    for key in ["session_id", "sessionId"]:
        value = clean_text(payload.get(key))
        if value:
            return value
    for nested_key in ["data", "ack", "resolvedTarget"]:
        nested = as_record(payload.get(nested_key))
        if nested:
            session_id = extract_session_id(nested)
            if session_id:
                return session_id
    return ""


def create_acceptance_group(args: argparse.Namespace, acceptance: dict[str, Any], env: dict[str, str]) -> dict[str, Any]:
    member_ids = [clean_text(item) for item in acceptance.get("member_ids", []) if clean_text(item)]
    member_types = [clean_text(item) for item in acceptance.get("member_types", []) if clean_text(item)]
    cmd = [
        args.node,
        args.group_script,
        "--action",
        "create",
        "--name",
        clean_text(acceptance.get("group_name")) or "Grix Hermes Acceptance",
    ]
    if member_ids:
        cmd.extend(["--member-ids", ",".join(member_ids)])
    if member_types:
        cmd.extend(["--member-types", ",".join(member_types)])
    return parse_json_output(run_command(cmd, env=env))


def verify_acceptance(
    *,
    args: argparse.Namespace,
    env: dict[str, str],
    session_id: str,
    acceptance: dict[str, Any],
) -> dict[str, Any]:
    probe_message = clean_text(acceptance.get("probe_message"))
    expected_substring = clean_text(acceptance.get("expected_substring"))
    if not probe_message or not expected_substring:
        return {
            "verified": False,
            "pending_manual": True,
            "reason": "acceptance probe_message or expected_substring is missing",
        }

    send_payload = send_message(args, session_id, probe_message, env)
    timeout_seconds = int(clean_text(acceptance.get("timeout_seconds")) or "15")
    poll_interval = float(clean_text(acceptance.get("poll_interval_seconds")) or "1")
    expected_lower = expected_substring.lower()

    deadline = time.time() + max(timeout_seconds, 1)
    last_query: dict[str, Any] = {}
    while time.time() < deadline:
        query_result = run_command(
            [
                args.node,
                args.query_script,
                "--action",
                "message_history",
                "--session-id",
                session_id,
                "--limit",
                clean_text(acceptance.get("history_limit")) or "10",
            ],
            env=env,
        )
        last_query = parse_json_output(query_result)
        haystack = json.dumps(last_query, ensure_ascii=False).lower()
        if expected_lower in haystack:
            return {
                "verified": True,
                "pending_manual": False,
                "probe_send": send_payload,
                "query_result": last_query,
            }
        time.sleep(max(poll_interval, 0.1))

    raise RuntimeError(
        "Acceptance verification did not observe the expected identity text.\n"
        f"expected: {expected_substring}\n"
        f"last_query: {json.dumps(last_query, ensure_ascii=False)}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a Hermes-side Grix install flow.")
    parser.add_argument("--from-file", default="")
    parser.add_argument("--profile-name", default="")
    parser.add_argument("--install-dir", default="")
    parser.add_argument("--hermes-home", default="")
    parser.add_argument("--hermes", default="hermes")
    parser.add_argument("--node", default="node")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--bind-json-script", default=str(repo_root() / "grix-admin" / "scripts" / "bind_from_json.py"))
    parser.add_argument("--create-and-bind-script", default=str(repo_root() / "grix-register" / "scripts" / "create_api_agent_and_bind.py"))
    parser.add_argument("--admin-script", default=str(repo_root() / "grix-admin" / "scripts" / "admin.mjs"))
    parser.add_argument("--card-script", default=str(repo_root() / "grix-egg" / "scripts" / "card-link.mjs"))
    parser.add_argument("--send-script", default=str(repo_root() / "message-send" / "scripts" / "send.mjs"))
    parser.add_argument("--group-script", default=str(repo_root() / "grix-group" / "scripts" / "group.mjs"))
    parser.add_argument("--query-script", default=str(repo_root() / "grix-query" / "scripts" / "query.mjs"))
    parser.add_argument("--start-script", default=str(repo_root() / "grix-egg" / "scripts" / "start_gateway.py"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    payload: dict[str, Any] = {}
    install_id = ""
    status_target = ""
    env: dict[str, str] | None = None
    try:
        payload = load_payload(args)
        install = as_record(payload.get("install"))
        route = normalize_route(install.get("route") or payload.get("route") or payload.get("install_route"))
        missing = [key for key in required_for_route(route) if not clean_text(payload.get(key) or install.get(key))]
        if missing:
            raise RuntimeError(f"Missing install flow fields: {', '.join(missing)}")

        hermes_home = resolve_hermes_home(args.hermes_home)
        requested_profile_name = clean_text(args.profile_name) or infer_profile_name(payload, install)
        is_main_text = clean_bool_text(payload.get("is_main") or install.get("is_main"))
        bind_options = merge_bind_options(payload, requested_profile_name, is_main_text)
        install_dir = Path(clean_text(args.install_dir) or clean_text(payload.get("install_dir")) or str(default_install_dir(hermes_home))).resolve()

        install_id = clean_text(payload.get("install_id") or install.get("install_id"))
        status_target = clean_text(payload.get("status_target") or install.get("status_target"))
        conversation_card_target = clean_text(payload.get("conversation_card_target") or payload.get("card_target") or status_target)
        acceptance = as_record(payload.get("acceptance"))

        bind_step = build_bind_step(payload, args=args, install_dir=install_dir, bind_options=bind_options)
        install_cmd = build_install_command(args, install_dir)

        plan = {
            "route": route,
            "install_id": install_id,
            "install_dir": str(install_dir),
            "hermes_home": str(hermes_home),
            "profile_name": bind_options["profile_name"],
            "commands": {
                "install_bundle": install_cmd,
                "bind": bind_step,
                "start_gateway": build_start_command(args, hermes_home, bind_options["profile_name"] or clean_text(payload.get("profile_name"))),
            },
        }
        if args.dry_run:
            dry_run_payload = {"ok": True, "dry_run": True, **plan}
            if args.json:
                print(json.dumps(dry_run_payload, ensure_ascii=False, indent=2))
            else:
                print(json.dumps(dry_run_payload, ensure_ascii=False))
            return 0

        env = dict(os.environ)
        env["HERMES_HOME"] = str(hermes_home)
        execution_log: dict[str, Any] = {
            "route": route,
            "install_id": install_id,
            "install_dir": str(install_dir),
            "hermes_home": str(hermes_home),
        }

        maybe_send_status_card(
            args=args,
            install_id=install_id,
            status="running",
            step="preparing",
            summary="开始执行 Hermes Grix 安装",
            target=status_target,
            env=env,
        )

        profile_dir_for_backup = resolve_profile_dir(hermes_home, bind_options["profile_name"])
        backup_dir = backup_existing_state(hermes_home, route, profile_dir_for_backup, install_dir)
        if backup_dir:
            execution_log["backup_dir"] = backup_dir

        install_result_raw = run_command(install_cmd, env=env, cwd=str(repo_root()))
        execution_log["install_result"] = {
            "install_dir": clean_text(install_result_raw.stdout) or str(install_dir),
            "stderr": clean_text(install_result_raw.stderr),
        }

        bind_result_raw = run_command(
            bind_step["primary_cmd"],
            env=env,
            input_text=bind_step.get("primary_input"),
        )
        if bind_step["kind"] == "admin":
            created_payload = parse_json_output(bind_result_raw)
            bind_result_raw = run_command(
                bind_step["followup_cmd"],
                env=env,
                input_text=json.dumps(created_payload, ensure_ascii=False),
            )
        bind_payload = parse_json_output(bind_result_raw)
        if bind_payload.get("bind_result") and isinstance(bind_payload["bind_result"], dict):
            bind_result = bind_payload["bind_result"]
        else:
            bind_result = bind_payload
        execution_log["bind_result"] = bind_result

        resolved_profile_name = clean_text(bind_result.get("profile_name")) or bind_options["profile_name"]
        if not resolved_profile_name:
            raise RuntimeError("Bind flow did not resolve a Hermes profile name.")
        profile_dir = resolve_profile_dir(hermes_home, resolved_profile_name)
        execution_log["profile_name"] = resolved_profile_name
        execution_log["profile_dir"] = str(profile_dir)

        soul_path = write_soul(profile_dir, payload)
        if soul_path:
            execution_log["soul_path"] = soul_path

        start_result = parse_json_output(run_command(build_start_command(args, hermes_home, resolved_profile_name), env=env))
        execution_log["start_result"] = start_result

        acceptance_result: dict[str, Any] | None = None
        if acceptance:
            group_payload = create_acceptance_group(args, acceptance, env)
            acceptance_session_id = extract_session_id(group_payload)
            if not acceptance_session_id:
                raise RuntimeError(f"Acceptance group creation did not return a session_id: {group_payload}")

            conversation_card = run_command(
                [
                    args.node,
                    args.card_script,
                    "conversation",
                    "--session-id",
                    acceptance_session_id,
                    "--session-type",
                    clean_text(acceptance.get("session_type")) or "group",
                    "--title",
                    clean_text(acceptance.get("group_name")) or "验收测试群",
                ],
                env=env,
            )
            conversation_card_text = clean_text(conversation_card.stdout)

            card_delivery = None
            if conversation_card_target:
                card_delivery = send_message(args, conversation_card_target, conversation_card_text, env)

            verification = verify_acceptance(
                args=args,
                env=env,
                session_id=acceptance_session_id,
                acceptance=acceptance,
            )

            acceptance_result = {
                "group_create": group_payload,
                "session_id": acceptance_session_id,
                "conversation_card": conversation_card_text,
                "card_delivery": card_delivery,
                "verification": verification,
            }
            execution_log["acceptance"] = acceptance_result

        maybe_send_status_card(
            args=args,
            install_id=install_id,
            status="success",
            step="complete",
            summary="Hermes Grix 安装、绑定和启动完成",
            target=status_target,
            env=env,
        )

        payload_out = {"ok": True, "dry_run": False, **execution_log}
        if args.json:
            print(json.dumps(payload_out, ensure_ascii=False, indent=2))
        else:
            print(json.dumps(payload_out, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        if env and install_id and status_target:
            try:
                maybe_send_status_card(
                    args=args,
                    install_id=install_id,
                    status="failed",
                    step="error",
                    summary=clean_text(exc),
                    target=status_target,
                    env=env,
                )
            except Exception:
                pass
        payload_out = {"ok": False, "error": str(exc)}
        if args.json:
            print(json.dumps(payload_out, ensure_ascii=False, indent=2), file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
