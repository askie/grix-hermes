---
name: message-send
description: 需要在 Hermes 里向 Grix 当前会话或其他会话发送消息时使用。优先使用 Hermes 自带 `send_message`，并遵守 Grix `session_id`、`route_session_key`、会话卡片、状态卡片的发送规则。
---

# Message Send

这个技能现在有两条路：

1. 当前会话内普通回复：直接回复
2. 跨会话、卡片、独立投递：优先用本技能自带的 WS helper

## 发送主线

### 当前会话回复

如果就是回复当前会话，直接正常回复即可。

### 跨会话发送

优先使用：

```bash
node scripts/send.js --to <SESSION_ID_OR_ROUTE_SESSION_KEY> --message "..."
```

如果上层明确要求走 Hermes 自带 `send_message`，再使用：

```json
{
  "action": "send",
  "target": "grix:<SESSION_ID_OR_ROUTE_SESSION_KEY>",
  "message": "..."
}
```

不要把裸 `session_id` 当成 Hermes `send_message.target`。

## 如何拿目标会话

- 已知准确 `session_id`：直接发
- 只有 `route_session_key`：也可以直接发
- 还不知道目标：先用 [grix-query](../grix-query/SKILL.md) 找准确会话

## 卡片规则

如果你要发：

- 会话卡片
- 安装状态卡
- Agent 资料卡

都应优先通过本技能的 helper 先生成单行 Markdown 链接，再单独一条消息发送。

参考格式见：

- [Grix Card Links](../shared/references/grix-card-links.md)

如果要稳定生成卡片链接，优先用本技能自带 helper：

```bash
node scripts/send.js --to <SESSION_ID_OR_ROUTE_SESSION_KEY> --message "$(node scripts/card-link.js conversation --session-id <SESSION_ID> --session-type group --title 测试群)"
node scripts/card-link.js conversation --session-id <SESSION_ID> --session-type group --title 测试群
node scripts/card-link.js user-profile --user-id <AGENT_ID> --nickname writer-hermes
node scripts/card-link.js egg-status --install-id <INSTALL_ID> --status running --step installing --summary 已开始安装
```

## 注意

- `grix://card` 链接不要混在普通说明文字里
- 如果还要补充说明，另发一条普通文本
