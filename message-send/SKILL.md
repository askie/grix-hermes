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

支持 `session_id:thread_id` 格式，会自动拆分：

```bash
node scripts/send.js --to "<SESSION_ID>:<THREAD_ID>" --message "..."
```

或显式指定：

```bash
node scripts/send.js --to <SESSION_ID> --message "..." --thread-id <THREAD_ID>
```

完整参数：

```bash
node scripts/send.js \
  --to <SESSION_ID_OR_ROUTE_SESSION_KEY> \
  --message "..." \
  --thread-id <THREAD_ID> \
  --reply-to-message-id <MSG_ID> \
  --event-id <EVENT_ID>
```

- `--to`：目标 session_id 或 route_session_key（必填）
- `--message`：消息内容（必填）
- `--thread-id`：话题消息的 thread ID
- `--reply-to-message-id`：回复指定消息
- `--event-id`：关联的事件 ID

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
# 会话卡片
node scripts/card-link.js conversation --session-id <SESSION_ID> --session-type group --title 测试群
node scripts/card-link.js conversation --session-id <SESSION_ID> --session-type single --title 对话 --peer-id <PEER_ID>

# Agent 资料卡
node scripts/card-link.js user-profile --user-id <AGENT_ID> --nickname writer-hermes

# 安装状态卡
node scripts/card-link.js egg-status --install-id <INSTALL_ID> --status running --step installing --summary 已开始安装
node scripts/card-link.js egg-status --install-id <INSTALL_ID> --status failed --step error --summary 安装失败 --target-agent-id <AGENT_ID> --error-code ERR_001 --error-msg "连接超时"
```

卡片参数说明：

**conversation 卡片**
- `--session-id`：会话 ID（必填）
- `--session-type`：`group` / `single`（必填）
- `--title`：显示标题（必填）
- `--peer-id`：对方用户 ID（可选，用于单聊卡片）

**user-profile 卡片**
- `--user-id`：用户/agent ID（必填）
- `--nickname`：显示昵称（必填）
- `--peer-type`：默认 `2`（可选）
- `--avatar-url`：头像 URL（可选）

**egg-status 卡片**
- `--install-id`：安装实例 ID（必填）
- `--status`：`running` / `success` / `failed`（必填）
- `--step`：当前步骤名（必填）
- `--summary`：步骤摘要（必填）
- `--target-agent-id`：目标 agent ID（可选）
- `--error-code`：错误码（可选）
- `--error-msg`：错误消息（可选）

## 注意

- `grix://card` 链接不要混在普通说明文字里
- 如果还要补充说明，另发一条普通文本
