---
name: grix-query
description: 查询 Grix 联系人、会话和消息历史。提供联系人搜索、会话搜索、消息历史读取和消息关键词搜索能力。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, query, search, contacts, sessions, messages]
    related_skills: [grix-group, message-send, message-unsend]
---

# Grix Query

这个技能提供 Grix 只读查询能力。

## 执行方式

优先使用 Hermes 原生工具 `grix_invoke`，通过已有 WebSocket 连接直接调用，无需新建连接：

```
grix_invoke(action="contact_search", params={"keyword": "alice"})
grix_invoke(action="session_search", params={"keyword": "测试群"})
grix_invoke(action="message_history", params={"session_id": "<SESSION_ID>", "limit": 20})
grix_invoke(action="message_search", params={"session_id": "<SESSION_ID>", "keyword": "身份", "limit": 20})
```

如果 `grix_invoke` 不可用（非 Gateway 环境），回退到 CLI：

```bash
node scripts/query.js --action <action> ...
```

## 查询类型

- `contact_search`：搜索联系人
- `session_search`：搜索会话
- `message_history`：读取消息历史
- `message_search`：搜索消息

读取消息历史的常用流程是先用 `session_search` 定位 `session_id`，再用 `message_history` 或 `message_search` 查询消息。

## 参数

- `keyword`：搜索关键词（contact_search、session_search、message_search 使用）
- `session_id`：目标会话 ID（message_history、message_search 必填）
- `id`：精确查询的记录 ID
- `limit`：返回数量限制
- `offset`：偏移量，用于分页
- `before_id`：翻页游标，返回此 ID 之前的消息

## 分页规则

- 第一页先用一个合理 `limit`
- 继续翻页时复用同一个 `session_id`
- `message_history` / `message_search` 下一页要带 `before_id`
- 也可以用 `offset` 做偏移分页

## 输出要求

- 成功时明确返回关键 ID
- 联系人带 `peer_id` / `peer_type`
- 会话带 `session_id`
- 消息带 `msg_id` 和必要时间信息

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
