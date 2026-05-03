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

1. **检测路径**：优先探测当前 Hermes home / profile 是否已有完整 Grix WS 凭证
2. **安装技能**：本地安装 `grix-hermes`
3. **创建或接管远端 agent**
4. **本地绑定 profile**
5. **写入 SOUL / 启动 gateway**
6. **验收测试**（可选）

当前 `bootstrap.js` 支持三条路径：

- `--route create_new` + 检测到 WS 凭证：走 WS admin create
- `--route create_new` + 无 WS 但有 `--access-token`：走 HTTP create-and-bind
- `--route existing`：跳过创建，直接绑定已有凭证

## 第一步：创建远端 Agent

在默认假设里，这一步优先通过 Hermes 原生工具 `grix_invoke` 走当前 Grix WebSocket 连接完成远端创建；但真正执行前要先确认当前运行时是否真的支持 admin invoke。

### 前置检查：确认当前会话具备 Grix admin invoke 能力

不要只因为 `grix-egg` / `grix-admin` 技能已加载，就假设 `agent_api_create` 一定可用。还需要确认当前 Hermes→Grix 运行时支持对应能力。

如果调用类似下面的 admin action：

```
grix_invoke(action="agent_category_list", params={})
```

返回类似：

- `unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd ...`

则应判定为：**当前 Grix 连接不支持 admin invoke 路径**。这不是 `grix-egg` 技能目录格式错误，也不是单纯参数问题，而是当前运行时能力/协议不满足。

此时不要继续假设可以走 WS admin create；应立即改走以下其一：

1. **HTTP fallback**：改用 `grix-register` 路径，需要 `access_token`
2. **已有凭证绑定**：让上游提供 `agent_id` / `api_endpoint` / `api_key`，然后走 `--route existing`
3. **环境排查**：检查当前 Hermes gateway / Grix adapter 的 capability 协商是否真的暴露了 admin invoke

### WS admin create 路径

当前 bootstrap 的已验证实现是：**通过外部脚本链执行 WS 管理动作，而不是在 bootstrap 内直接 new WS client 做 create**。

具体调用链：

- 创建：`grix-admin/scripts/admin.js --action create_grix`
- 建群验收：`grix-group/scripts/group.js --action create`
- 发状态卡 / 探针：`message-send/scripts/send.js`
- 拉消息历史：`grix-query/scripts/query.js --action history`

这样可以复用既有 CLI 契约、环境解析和测试桩；对当前代码库来说，这是比在 bootstrap 内直连 shared/cli WS client 更稳定的实现边界。

使用 `grix_invoke` 创建远端 Grix API agent：

```
grix_invoke(action="agent_api_create", params={"agent_name": "<NAME>", "is_main": false, "introduction": "<INTRODUCTION>"})
```

返回结果包含 `agent_id`、`api_endpoint`、`api_key`。

如果需要指定分类：

```
grix_invoke(action="agent_api_create", params={"agent_name": "<NAME>", "is_main": true, "category_id": "<CATEGORY_ID>"})
```

### HTTP fallback 路径

如果当前会话不支持 WS admin invoke，则不要卡死在 `grix_invoke`；应改走 `grix-register` / HTTP 创建路径，或直接做已有凭证绑定。

## 第二步：本地绑定

拿到远端凭证后，调用本地脚本完成 profile 创建、凭证写入和 gateway 启动。

### create_new：让 bootstrap 自行判路创建

优先 WS，缺 WS 时可显式提供 `--access-token` 走 HTTP：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --json
```

HTTP fallback：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --access-token <ACCESS_TOKEN> \
  --json
```

### existing：绑定已有凭证

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

gateway 启动后，可通过 bootstrap 内置验收参数自动完成：建群、发探针、轮询消息历史、按目标 agent + 探针后消息判定是否通过。

推荐直接让脚本执行：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --probe-message "<PROBE_MESSAGE>" \
  --expected-substring "<EXPECTED_SUBSTRING>" \
  --member-ids <OPTIONAL_USER_IDS> \
  --member-types <OPTIONAL_USER_TYPES> \
  --status-target <OPTIONAL_STATUS_SESSION> \
  --json
```

验收判定规则：

- 必须是目标 agent 发出的消息
- 必须包含 `--expected-substring`
- 必须晚于 probe：优先比较 message id；拿不到可比较 id 时，再退回比较消息时间
- 旧消息命中或其他 sender 命中都不能算通过

**卡片和探针不要混用目标：**
- 卡片发 `status_target`
- probe 发测试群 `session_id`

下面这些 `grix_invoke` 例子仍适用于手工排障或理解底层动作：

```
grix_invoke(action="group_create", params={"name": "验收测试-<AGENT_NAME>", "member_ids": ["<TARGET_AGENT_ID>"], "member_types": [2]})
```

返回 `session_id`。

**发送探针消息：**

```
grix_invoke(action="send_msg", params={"session_id": "<SESSION_ID>", "content": "<PROBE_MESSAGE>"})
```

**轮询验证回复：**

```
grix_invoke(action="message_history", params={"session_id": "<SESSION_ID>", "limit": 10})
```

在消息历史中查找目标 agent 的回复，检查是否包含预期内容。

**发送状态卡片（可选）：**

如果需要向发起者报告孵化状态，用卡片链接格式：

`[安装状态](grix://card/egg_install_status?install_id=<ID>&status=running&step=installing&summary=开始安装)`

```
grix_invoke(action="send_msg", params={"session_id": "<STATUS_SESSION_ID>", "content": "[安装状态](grix://card/egg_install_status?...)"})
```

## 脚本参数

| 参数 | 说明 |
|------|------|
| `--install-id` | 安装实例 ID。可生成 `egg-` 加 8 位随机 hex |
| `--agent-name` | Agent 名称；默认也作为 profile 名 |
| `--access-token` | 当未检测到 WS 凭证时，走 HTTP create-and-bind |
| `--status-target` | 接收安装状态卡片的会话 |
| `--probe-message` | 验收探针消息；提供后启用验收 |
| `--expected-substring` | 目标 agent 回复中必须包含的子串 |
| `--member-ids` | 验收群附加成员 ID，逗号分隔；脚本会自动补入目标 agent |
| `--member-types` | 与 `--member-ids` 一一对应；省略时默认用户为 `1`，目标 agent 为 `2` |
| `--accept-timeout-seconds` | 验收超时，默认 `15` |
| `--accept-poll-interval-seconds` | 验收轮询间隔，默认 `1` |
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
  "step": "bind",
  "step_number": 2,
  "reason": "具体错误信息",
  "suggestion": "修复建议",
  "state_file": "~/.hermes/tmp/grix-egg-xxx.json",
  "resume_command": "node scripts/bootstrap.js --install-id xxx --agent-name 'X' --resume --json"
}
```

## 空蛋孵化

最小输入只需要 `--install-id` 和 `--agent-name`，但需要先通过 `grix_invoke` 创建远端 agent 拿到凭证，再传给脚本。

## 维护工具

- `bind_local.js`：本地 Hermes profile 绑定 helper
- `patch_profile_config.js`：profile `config.yaml` 技能目录配置 helper
