---
name: grix-query
description: 查询 Grix 联系人、会话、消息历史时使用。适用于 Hermes 里需要查联系人、找会话、读某个会话历史、按关键词搜消息，但又不能改 Hermes 内核的场景。通过 `terminal` 执行 `../shared/cli/grix-hermes.mjs query`，走 Hermes 已配置的 Grix websocket 凭证。
---

# Grix Query

只做只读查询。

## 入口

先判断用户要的是哪一类：

- `contact_search`
- `session_search`
- `message_history`
- `message_search`

如果用户要读消息，但没有准确 `session_id`，先做一次 `session_search`。

## 执行方式

统一用 `terminal` 执行：

```bash
node scripts/query.mjs --action <action> ...
```

常用例子：

```bash
node scripts/query.mjs --action contact_search --keyword alice
node scripts/query.mjs --action session_search --keyword 测试群
node scripts/query.mjs --action message_history --session-id <SESSION_ID> --limit 20
node scripts/query.mjs --action message_search --session-id <SESSION_ID> --keyword 身份 --limit 20
```

## 分页规则

- 第一页先用一个合理 `limit`
- 继续翻页时复用同一个 `session_id`
- `message_history` / `message_search` 下一页要带 `before_id`

## 输出要求

- 成功时明确返回关键 ID
- 联系人带 `peer_id` / `peer_type`
- 会话带 `session_id`
- 消息带 `msg_id` 和必要时间信息

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
