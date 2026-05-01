---
name: message-send
description: 在 Hermes 里发送 Grix 消息和卡片。支持当前会话回复、跨会话投递、话题回复、会话卡片、Agent 资料卡和安装状态卡。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, message, send, card, conversation]
    related_skills: [message-unsend, grix-query]
---

# Message Send

这个技能提供 Grix 消息投递和卡片链接生成能力。

## 能力

1. 当前会话文本回复
2. 跨会话文本发送
3. 话题消息发送
4. 指定消息回复
5. 会话卡片生成
6. Agent 资料卡生成
7. grix-egg 安装状态卡生成

## 当前会话回复

当前会话内普通回复可以直接用自然语言回复。

## 跨会话发送

优先使用 Hermes 原生 `send_message` 工具，通过已有 WebSocket 连接直接发送：

```json
{
  "action": "send",
  "target": "grix:<SESSION_ID_OR_ROUTE_SESSION_KEY>",
  "message": "..."
}
```

支持 `session_id:thread_id` 格式指定话题。

如果 `send_message` 不可用（非 Gateway 环境），回退到 CLI：

```bash
node scripts/send.js --to <SESSION_ID_OR_ROUTE_SESSION_KEY> --message "..."
```

完整参数（CLI 回退）：

```bash
node scripts/send.js \
  --to <SESSION_ID_OR_ROUTE_SESSION_KEY> \
  --message "..." \
  --thread-id <THREAD_ID> \
  --reply-to-message-id <MSG_ID> \
  --event-id <EVENT_ID>
```

## 目标会话

- 已知 `session_id` 时直接发送
- 已知 `route_session_key` 时直接发送
- 需要搜索会话时使用 [grix-query](../grix-query/SKILL.md)

## 卡片链接

卡片链接通过 CLI 生成（无需 WebSocket 连接）：

会话卡片：

```bash
node scripts/card-link.js conversation --session-id <SESSION_ID> --session-type group --title 测试群
node scripts/card-link.js conversation --session-id <SESSION_ID> --session-type single --title 对话 --peer-id <PEER_ID>
```

Agent 资料卡：

```bash
node scripts/card-link.js user-profile --user-id <AGENT_ID> --nickname writer-hermes
```

安装状态卡：

```bash
node scripts/card-link.js egg-status --install-id <INSTALL_ID> --status running --step installing --summary 已开始安装
node scripts/card-link.js egg-status --install-id <INSTALL_ID> --status failed --step error --summary 安装失败 --target-agent-id <AGENT_ID> --error-code ERR_001 --error-msg "连接超时"
```

## 卡片参数

**conversation**

- `--session-id`：会话 ID
- `--session-type`：`group` / `single`
- `--title`：显示标题
- `--peer-id`：单聊对方用户 ID

**user-profile**

- `--user-id`：用户或 agent ID
- `--nickname`：显示昵称
- `--peer-type`：默认 `2`
- `--avatar-url`：头像 URL

**egg-status**

- `--install-id`：安装实例 ID
- `--status`：`running` / `success` / `failed`
- `--step`：当前步骤名
- `--summary`：步骤摘要
- `--target-agent-id`：目标 agent ID
- `--error-code`：错误码
- `--error-msg`：错误消息

## 输出

- `send_message` 或 `send.js` 返回发送结果
- `card-link.js` 返回单行 Markdown 卡片链接

## 参考

- [Grix Card Links](../shared/references/grix-card-links.md)
