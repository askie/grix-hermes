---
name: grix-egg
description: Hermes agent 孵化技能。AI agent 用原生工具创建远端 agent，本地脚本完成 profile 绑定和 gateway 启动。支持空蛋孵化和已有凭证绑定。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, egg, bootstrap, agent-creation, profile-binding]
    related_skills: [grix-admin, grix-register, message-send]
---

# Grix Egg

这个技能提供 Hermes agent 孵化能力。分为远程操作和本地操作两部分。

## 流程概览

1. **创建远端 agent**（AI agent 用原生工具）
2. **本地绑定**（调用 bootstrap 脚本）
3. **验收测试**（AI agent 用原生工具，可选）

## Claude Code 工具映射

在 Claude Code（grix-claude MCP）环境中，`grix_invoke` 不存在，需使用以下 MCP 工具替代：

| grix_invoke action | Claude Code MCP 工具 | 关键参数 |
|---|---|---|
| `agent_api_create` | `grix_admin(action="create_agent")` | `agentName`, `introduction`, `isMain`(bool), `categoryId` |
| `group_create` | `grix_group(action="create")` | `name`, `memberIds`(string[]), `memberTypes`(int[], 1=用户 2=agent) |
| `send_msg` | `grix_message_send` | `sessionId`, `content` |
| `message_history` | `grix_query(action="message_history")` | `sessionId`, `limit` |

返回值字段名不变，均为 `agent_id`、`api_endpoint`、`api_key`、`session_id` 等。

## 第一步：创建远端 Agent

使用 `grix_admin` 创建远端 Grix API agent：

```
grix_admin(action="create_agent", agentName="<NAME>", isMain=false, introduction="<INTRODUCTION>")
```

返回结果包含 `agent_id`、`api_endpoint`、`api_key`。

如果需要指定分类：

```
grix_admin(action="create_agent", agentName="<NAME>", isMain=true, categoryId="<CATEGORY_ID>")
```

## 第二步：本地绑定

拿到远端凭证后，调用本地脚本完成 profile 创建、凭证写入和 gateway 启动：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --agent-id <AGENT_ID> \
  --api-endpoint <API_ENDPOINT> \
  --api-key <API_KEY> \
  --json
```

带人格内容：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --agent-id <AGENT_ID> \
  --api-endpoint <API_ENDPOINT> \
  --api-key <API_KEY> \
  --soul-content "人格文本内容" \
  --json
```

已有凭证绑定（跳过创建步骤）：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --bind-json <BIND_JSON_FILE> \
  --json
```

脚本完成的本地操作：
1. 安装 `grix-hermes` 技能包
2. 创建本地 Hermes profile
3. 写入 `.env` 绑定凭证并继承 LLM provider key
4. 写入 `SOUL.md`（如提供）
5. 启动 Hermes gateway

## 第三步：验收测试（可选）

gateway 启动后，AI agent 用原生工具验证新 agent 是否正常工作。

**创建验收群：**

```
grix_group(action="create", name="验收测试-<AGENT_NAME>", memberIds=["<TARGET_AGENT_ID>"], memberTypes=[2])
```

返回 `session_id`。

**发送探针消息：**

```
grix_message_send(sessionId="<SESSION_ID>", content="<PROBE_MESSAGE>")
```

**轮询验证回复：**

```
grix_query(action="message_history", sessionId="<SESSION_ID>", limit=10)
```

在消息历史中查找目标 agent 的回复，检查是否包含预期内容。

**发送状态卡片（可选）：**

如果需要向发起者报告孵化状态，用卡片链接格式：

`[安装状态](grix://card/egg_install_status?install_id=<ID>&status=running&step=installing&summary=开始安装)`

```
grix_message_send(sessionId="<STATUS_SESSION_ID>", content="[安装状态](grix://card/egg_install_status?...)")
```

## 脚本参数

| 参数 | 说明 |
|------|------|
| `--install-id` | 安装实例 ID。可生成 `egg-` 加 8 位随机 hex |
| `--agent-name` | Agent 名称；默认也作为 profile 名 |
| `--profile-name` | Hermes profile 名覆盖值，需符合 `[a-z0-9][a-z0-9_-]{0,63}` |
| `--soul-content` | `SOUL.md` 内容字符串 |
| `--soul-file` | `SOUL.md` 文件路径 |
| `--is-main` | 是否主 agent，默认 `true` |
| `--route` | 固定为 `existing` |
| `--agent-id` | 已有 agent ID |
| `--api-endpoint` | 已有 agent WS endpoint |
| `--api-key` | 已有 agent API key |
| `--bind-json` | 凭证 JSON 文件路径 |
| `--resume` | 使用相同 `--install-id` 继续 checkpoint |
| `--dry-run` | 输出计划 |

## 成功输出

```json
{
  "ok": true,
  "install_id": "...",
  "agent_name": "...",
  "profile_name": "...",
  "steps": {
    "install": { "status": "done" },
    "bind": { "status": "done" },
    "soul": { "status": "skipped" },
    "gateway": { "status": "done" }
  }
}
```

## 失败输出

```json
{
  "ok": false,
  "step": "bind",
  "step_number": 2,
  "reason": "具体错误信息",
  "suggestion": "修复建议",
  "state_file": "~/.hermes/tmp/grix-egg-xxx.json",
  "resume_command": "node scripts/bootstrap.js --install-id xxx --agent-name 'X' --resume --json"
}
```

## 空蛋孵化

最小输入只需要 `--install-id` 和 `--agent-name`，但需要先通过 `grix_admin` 创建远端 agent 拿到凭证，再传给脚本。

## 维护工具

- `bind_local.js`：本地 Hermes profile 绑定 helper
- `patch_profile_config.js`：profile `config.yaml` 技能目录配置 helper
