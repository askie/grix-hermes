---
name: message-unsend
description: 需要在 Hermes 里静默撤回 Grix 消息时使用。适用于撤回 agent 自己刚发出的错误消息、状态消息或卡片消息。通过 `terminal` 执行 `../shared/cli/grix-hermes.mjs unsend`，按静默双重撤回规则处理。
---

# Message Unsend

这个技能只做静默撤回。

## 执行方式

统一用：

```bash
node scripts/unsend.mjs --message-id <MSG_ID> --session-id <SESSION_ID>
```

如果目标不是直接 `session_id`，也可以传：

```bash
node scripts/unsend.mjs --message-id <MSG_ID> --to <ROUTE_SESSION_KEY_OR_SESSION_ID>
```

如果你还知道当前命令消息所在通道和消息 ID，就一起传，让它做静默双重撤回：

```bash
node scripts/unsend.mjs --message-id <TARGET_MSG_ID> --session-id <SESSION_ID> --current-channel-id <CURRENT_CHANNEL_ID> --current-message-id <CURRENT_MSG_ID>
```

## 规则

- `messageId` 必须是数字字符串
- 优先用于撤回 agent 自己刚发的消息
- 默认静默执行，不要先发“我来撤回一下”
- 如果消息不存在或不可撤回，不要额外制造噪音

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
