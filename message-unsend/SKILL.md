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

### 优先：使用原生工具

如果 hermes-agent 提供了 `grix_unsend` 工具，直接调用：

```
grix_unsend(message_id="<MSG_ID>", session_id="<SESSION_ID>")
```

原生工具通过已有的 WebSocket 连接发送 `delete_msg` 命令，无需额外建立连接，效率更高。

### 备选：使用 CLI 脚本

仅在 `grix_unsend` 工具不可用时使用。

按 session 定位：

```bash
node scripts/unsend.js --message-id <MSG_ID> --session-id <SESSION_ID>
```

按 route session key 定位：

```bash
node scripts/unsend.js --message-id <MSG_ID> --to <ROUTE_SESSION_KEY_OR_SESSION_ID>
```

按 topic 定位：

```bash
node scripts/unsend.js --message-id <MSG_ID> --topic <ROUTE_SESSION_KEY_OR_SESSION_ID>
```

双重撤回：

```bash
node scripts/unsend.js \
  --message-id <TARGET_MSG_ID> \
  --session-id <SESSION_ID> \
  --current-channel-id <CURRENT_CHANNEL_ID> \
  --current-message-id <CURRENT_MSG_ID>
```

## 参数

- `--message-id`：目标消息 ID，数字字符串
- `--session-id`：目标会话 ID
- `--to`：route session key 或 session ID
- `--topic`：topic route session key 或 session ID
- `--current-channel-id`：触发命令消息所在通道
- `--current-message-id`：触发命令消息 ID

## 输出

- 撤回目标消息的执行结果
- 双重撤回时包含触发命令消息的撤回结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
