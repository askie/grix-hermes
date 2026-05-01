---
name: grix-admin
description: 底层 Grix WS 管理技能。提供远端 Grix API agent 创建、API key 轮换、分类管理、agent 状态查询和分类分配能力。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, admin, agent-management, api-key, category]
    related_skills: [grix-egg, grix-query, grix-group]
---

# Grix Admin

这个技能提供远端 Grix 管理能力。

## 执行方式

使用 Hermes 原生工具 `grix_invoke`，通过已有 WebSocket 连接直接调用：

```
grix_invoke(action="agent_api_create", params={"agent_name": "<NAME>", "is_main": false, "introduction": "<TEXT>"})
grix_invoke(action="agent_api_status", params={"agent_id": "<AGENT_ID>"})
grix_invoke(action="agent_api_key_rotate", params={"agent_id": "<AGENT_ID>"})
grix_invoke(action="agent_category_list", params={})
grix_invoke(action="agent_category_create", params={"name": "<NAME>", "parent_id": "0"})
grix_invoke(action="agent_category_update", params={"category_id": "<ID>", "name": "<NAME>", "parent_id": "0"})
grix_invoke(action="agent_category_assign", params={"agent_id": "<AGENT_ID>", "category_id": "<CATEGORY_ID>"})
```

## 能力

1. 创建远端 Grix API agent
2. 轮换远端 Grix API agent key
3. 查询远端 agent 在线状态和 key 状态
4. 管理分类：列表、创建、更新、分配

## 输出

- 所有动作返回 JSON envelope
- `agent_api_create` 返回远端 agent 信息
- `agent_api_key_rotate` 返回轮换结果
- 分类动作返回服务端分类结果
- 状态查询返回服务端状态结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
