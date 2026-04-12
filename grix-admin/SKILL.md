---
name: grix-admin
description: 需要创建远端 Grix API agent、管理分类、并把结果落地到本地 OpenClaw 配置时使用。适用于首个 agent 绑定、后续创建并绑定 agent、分类管理。远端步骤通过 `../shared/cli/grix-hermes.mjs admin`，本地步骤通过 `openclaw` 官方 CLI。
---

# Grix Admin

这个技能负责两件事：

1. 远端 Grix agent / 分类管理
2. 本地 OpenClaw 绑定和校验

不要手工改 `openclaw.json`。

## Mode A: bind-local

当上下文已经给出：

- `agent_name`
- `agent_id`
- `api_endpoint`
- `api_key`

就直接做本地绑定，不做远端创建。

### 本地绑定主线

1. 先用 `openclaw config get --json` 读取：
   - `channels.grix.accounts`
   - `agents.list`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
2. 准备目标值：
   - `channels.grix.accounts.<agent_name>`
   - `agents.list` 里目标 agent
   - `tools.profile="coding"`
   - `tools.alsoAllow` 至少包含 `message`、`grix_register`
3. 用官方命令写入：
   - `openclaw config set ... --strict-json`
   - `openclaw agents bind --agent <agent_name> --bind grix:<agent_name>`
4. 校验：
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw agents bindings --agent <agent_name> --json`

### model 规则

- 先复用该 agent 现有 `model`
- 没有则看 `agents.defaults.model.primary`
- 还没有就停止，不要猜

## Mode B: create-and-bind

如果还没有远端 agent，就先创建。

### 远端创建

通过 `terminal` 执行：

```bash
node scripts/admin.mjs --action create_agent --agent-name <NAME> [--introduction ...] [--is-main true|false]
```

如果需要分类：

```bash
node scripts/admin.mjs --action create_agent --agent-name <NAME> --category-id <ID>
node scripts/admin.mjs --action create_agent --agent-name <NAME> --category-name <NAME> --parent-category-id 0
```

创建成功后，拿返回里的 `id` / `agent_name` / `api_endpoint` / `api_key`，继续走本地绑定 helper：

```bash
python3 scripts/bind_local.py \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --model <MODEL>
```

如果你已经拿到一份远端创建结果 JSON，可以直接交给：

```bash
python3 scripts/bind_from_json.py --model <MODEL> --dry-run --json < result.json
```

## Mode C: category-manage

分类相关动作统一走：

```bash
node scripts/admin.mjs --action list_categories
node scripts/admin.mjs --action create_category --name <NAME> --parent-id 0
node scripts/admin.mjs --action update_category --category-id <ID> --name <NAME> --parent-id 0
node scripts/admin.mjs --action assign_category --agent-id <AGENT_ID> --category-id <CATEGORY_ID>
```

## Guardrails

- 远端动作不要改走 HTTP
- 本地配置不要手工编辑 JSON
- 安装私聊进行中时，不要主动重启 gateway
- 只有配置已确认正确但运行态明显是旧结果时，才把 `openclaw gateway restart` 当补救

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
