---
name: grix-admin
description: 底层 Grix WS 管理技能。用于远端 Grix API agent 创建、分类管理、agent 状态查询和分类分配；不负责本地 Hermes profile 绑定。完整新 Hermes agent 孵化必须使用 `grix-egg`。
---

# Grix Admin

这个技能只负责远端 Grix WS 管理动作，不创建、不绑定、不修改本地 Hermes profile。

## 职责边界

1. 创建远端 Grix API agent
2. 查询远端 agent 在线状态和 key 状态
3. 管理分类：列表、创建、更新、分配

如果用户要“建立 / 孵化 / 安装 / 绑定 / 验收一个新的 Hermes agent”，不要使用本技能串流程，直接使用 `grix-egg` 的 `node scripts/bootstrap.js ... --json` 主入口。

## Mode A: ws-agent-create

只创建远端 Grix API agent。不要把这个模式当成本地 Hermes agent 孵化流程。

```bash
node scripts/admin.js --action create_grix \
  --agent-name <NAME> \
  --introduction <TEXT> \
  --is-main true|false \
  --json
```

如果需要分类：

```bash
node scripts/admin.js --action create_grix \
  --agent-name <NAME> \
  --category-id <ID> \
  --json

node scripts/admin.js --action create_grix \
  --agent-name <NAME> \
  --category-name <NAME> \
  --parent-category-id 0 \
  --json
```

`--category-id` 和 `--category-name` 互斥，不能同时传。传 `--category-name` 时，如果分类不存在会自动创建。

返回里可能包含远端创建得到的 `api_key`。不要把它写入聊天窗口、日志或 checkpoint；如需绑定到本地 profile，交给 `grix-egg` 的 existing 路径。

## Mode B: agent-status

查询指定远端 agent 的在线状态和 key 有效性。

```bash
node scripts/admin.js --action agent_status --agent-id <AGENT_ID> --json
```

必填参数：

- `--agent-id`：目标 agent ID

返回：

- `agent_id`：查询的 agent ID
- `data`：服务端返回的状态信息（online、status 等）

前置条件：服务端需提供 `agent_api_status` 接口。

## Mode C: category-manage

分类相关动作统一走：

```bash
node scripts/admin.js --action list_categories --json
node scripts/admin.js --action create_category --name <NAME> --parent-id 0 --json
node scripts/admin.js --action update_category --category-id <ID> --name <NAME> --parent-id 0 --json
node scripts/admin.js --action assign_category --agent-id <AGENT_ID> --category-id <CATEGORY_ID> --json
```

## Guardrails

- 远端动作不要改走 HTTP
- 本技能不做本地 Hermes profile 绑定，不写 `.env`，不改 `config.yaml`
- 用户要求建立、孵化、安装、绑定或验收新的 Hermes agent 时，必须转用 `grix-egg`
- `create_grix` 表示“创建远端 Grix API agent”，不要把它理解成创建本地 Hermes agent
- 不要将明文 API key 输出到聊天窗口或日志

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
