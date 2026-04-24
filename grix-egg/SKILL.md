---
name: grix-egg
description: Hermes agent 孵化技能。一个命令完成远端 Grix agent 创建、本地 profile 绑定、SOUL 写入、gateway 启动和验收；支持空蛋孵化、已有凭证绑定和断点续传。
---

# Grix Egg

这个技能提供 Hermes agent 孵化全流程。

## 能力

1. 创建远端 Grix API agent
2. 创建或复用本地 Hermes profile
3. 写入 Grix 绑定凭证并继承 LLM provider key
4. 写入 `SOUL.md`
5. 启动 Hermes gateway
6. 创建验收群、加入目标 agent、发送探针并验证目标回复
7. 保存脱敏 checkpoint 并支持断点续传
8. 孵化空蛋：只提供 `--install-id` 和 `--agent-name` 即可创建一个空 Hermes agent profile 并启动 gateway

## 主入口

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --json
```

带人格内容：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --soul-content "人格文本内容" \
  --status-target <SESSION_ID> \
  --json
```

带验收：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --probe-message "你是谁" \
  --expected-substring "我是" \
  --json
```

已有凭证绑定：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --bind-json <BIND_JSON_FILE> \
  --json
```

## 空蛋孵化

空蛋孵化的最小输入：

- `--install-id`
- `--agent-name`

空蛋孵化会完成：

1. 安装 `grix-hermes` 技能包
2. 创建远端 Grix API agent
3. 创建本地 Hermes profile
4. 写入 `.env` 绑定凭证
5. 配置 `skills.external_dirs`
6. 启动 gateway

`SOUL.md` 和验收探针是可选增强项。提供 `--soul-content` 或 `--soul-file` 时写入 `SOUL.md`；提供 `--probe-message` 和 `--expected-substring` 时执行验收。

## 参数

| 参数 | 说明 |
|------|------|
| `--install-id` | 安装实例 ID。可使用上下文里的 install_id，也可生成 `egg-` 加 8 位随机 hex |
| `--agent-name` | Agent 名称；默认也作为 profile 名 |
| `--profile-name` | Hermes profile 名覆盖值，需符合 `[a-z0-9][a-z0-9_-]{0,63}` |
| `--soul-content` | `SOUL.md` 内容字符串 |
| `--soul-file` | `SOUL.md` 文件路径 |
| `--status-target` | 状态卡片投递 session_id |
| `--probe-message` | 验收探针消息 |
| `--expected-substring` | 验收期望回复子串 |
| `--member-ids` | 验收群额外成员 ID，逗号分隔 |
| `--member-types` | 与 `--member-ids` 一一对应的成员类型；目标 agent 自动追加类型 `2` |
| `--access-token` | Grix HTTP access token |
| `--is-main` | 是否主 agent，默认 `true` |
| `--route` | `create_new` 或 `existing` |
| `--agent-id` / `--api-endpoint` / `--api-key` | `existing` 路径的已有 agent 凭证 |
| `--bind-json` | `existing` 路径的凭证 JSON 文件 |
| `--accept-timeout-seconds` | 验收等待超时时间，默认 `15` |
| `--accept-poll-interval-seconds` | 验收轮询间隔，默认 `1` |
| `--resume` | 使用相同 `--install-id` 继续 checkpoint |
| `--dry-run` | 输出计划 |

## 路径自动检测

- 当前环境提供 `GRIX_ENDPOINT`、`GRIX_AGENT_ID`、`GRIX_API_KEY` 时走 WS 创建路径
- 提供 `--access-token` 时走 HTTP 创建路径
- `--route existing` 搭配已有凭证时走 existing 绑定路径

## 步骤

1. **detect** — 检测 WS / HTTP / existing 路径
2. **install** — 安装技能包
3. **create** — 创建或定位远端 Grix agent
4. **bind** — 创建本地 profile 并绑定凭证
5. **soul** — 写入 `SOUL.md`
6. **gateway** — 启动 Hermes gateway
7. **accept** — 创建测试群、加入目标 agent、发送探针并验证回复

`soul` 和 `accept` 会根据输入参数自动执行或标记为 `skipped`。

## Checkpoint

每完成一步都会保存 checkpoint：

```text
~/.hermes/tmp/grix-egg-<install_id>.json
```

checkpoint 保存脱敏状态；真实 `api_key` 只在当前进程内流转并写入目标 profile 的 `.env`。create 后 bind 前的续接方式是 `--route existing --bind-json <FILE>`。

## 成功输出

```json
{
  "ok": true,
  "install_id": "...",
  "agent_name": "...",
  "profile_name": "...",
  "route": "create_new",
  "steps": {
    "detect": { "status": "done" },
    "install": { "status": "done" },
    "create": { "status": "done" },
    "bind": { "status": "done" },
    "soul": { "status": "skipped" },
    "gateway": { "status": "done" },
    "accept": { "status": "skipped" }
  }
}
```

## 失败输出

```json
{
  "ok": false,
  "step": "create",
  "step_number": 3,
  "reason": "具体错误信息",
  "suggestion": "修复建议",
  "state_file": "~/.hermes/tmp/grix-egg-xxx.json",
  "resume_command": "node scripts/bootstrap.js --install-id xxx --agent-name 'X' --resume --json"
}
```

## 维护工具

- `bind_local.js`：本地 Hermes profile 绑定 helper
- `patch_profile_config.js`：profile `config.yaml` 技能目录配置 helper
- `install_flow.js`：旧 JSON payload 兼容入口
- `verify_acceptance.js`：独立验收工具
- [Legacy Skill 文档](references/legacy-skill.md)：旧 JSON payload 维护资料
