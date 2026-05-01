---
name: message-unsend
description: 静默撤回 Grix 消息。支持按 session、route session key 或 topic 定位消息，并支持触发命令消息的双重撤回。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, message, unsend, delete, recall]
    related_skills: [message-send, grix-query]
---

# Message Unsend

这个技能提供 Grix 消息静默撤回能力。

## 执行方式

使用 Hermes 原生工具 `grix_unsend`，通过已有 WebSocket 连接直接调用：

```
grix_unsend(message_id="<MSG_ID>", session_id="<SESSION_ID>")
```

双重撤回（先撤回目标消息，再撤回触发命令消息）需要两次调用。

## 参数

- `message_id`：目标消息 ID，数字字符串
- `session_id`：目标会话 ID

## 输出

- 撤回目标消息的执行结果
- 双重撤回时包含触发命令消息的撤回结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
