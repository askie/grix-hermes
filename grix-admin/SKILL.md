---
name: grix-admin
description: 底层 Grix WS 管理技能。提供远端 Grix API agent 创建、API key 轮换、分类管理、agent 状态查询和分类分配能力。
---

# Grix Admin

这个技能提供远端 Grix WS 管理能力。

## 能力

1. 创建远端 Grix API agent
2. 轮换远端 Grix API agent key
3. 查询远端 agent 在线状态和 key 状态
4. 管理分类：列表、创建、更新、分配

## 创建远端 Agent

```bash
node scripts/admin.js --action create_grix \
  --agent-name <NAME> \
  --introduction <TEXT> \
  --is-main true|false \
  --json
```

带分类创建：

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

`--category-id` 和 `--category-name` 二选一。传 `--category-name` 时，脚本会查找同名分类并按需创建。

## 查询 Agent 状态

```bash
node scripts/admin.js --action agent_status --agent-id <AGENT_ID> --json
```

返回：

- `agent_id`：查询的 agent ID
- `data`：服务端返回的状态信息

## 轮换 Agent API Key

```bash
node scripts/admin.js --action key_rotate \
  --agent-id <AGENT_ID> \
  --env-file ~/.hermes/profiles/<PROFILE>/.env \
  --json
```

参数：

- `--agent-id`：目标 agent ID
- `--env-file`：已有 `.env` 文件路径
- `--json`：JSON 输出

输出：

- `rotatedAgent`：轮换后的 agent 信息，`api_key` 字段脱敏
- `envFile`：已更新的 `.env` 文件路径
- `tempKeyFile`：临时密钥备份文件路径

## 分类管理

```bash
node scripts/admin.js --action list_categories --json
node scripts/admin.js --action create_category --name <NAME> --parent-id 0 --json
node scripts/admin.js --action update_category --category-id <ID> --name <NAME> --parent-id 0 --json
node scripts/admin.js --action assign_category --agent-id <AGENT_ID> --category-id <CATEGORY_ID> --json
```

## 输出

- 所有动作返回 JSON envelope
- `create_grix` 返回远端 agent 信息
- `key_rotate` 返回脱敏后的轮换结果
- 分类动作返回服务端分类结果
- 状态查询返回服务端状态结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
