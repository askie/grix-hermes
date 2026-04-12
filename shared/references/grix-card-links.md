# Grix Card Links

当你已经拿到准确的 `session_id` 时：

- 会话卡片：

```md
[进入测试群](grix://card/conversation?session_id=<SESSION_ID>&session_type=group&title=<URI_ENCODED_TITLE>)
```

- Agent 资料卡：

```md
[查看 Agent 资料](grix://card/user_profile?user_id=<AGENT_ID>&peer_type=2&nickname=<URI_ENCODED_AGENT_NAME>&avatar_url=<URI_ENCODED_AVATAR_URL>)
```

- 安装状态卡：

```md
[安装进行中](grix://card/egg_install_status?install_id=<INSTALL_ID>&status=running&step=<STEP>&summary=<URI_ENCODED_SUMMARY>)
```

注意：

1. 这类链接要单行
2. 要单独作为一条消息发送
3. 在 Hermes 里应优先用 `send_message` 发送，不要依赖普通 Grix 回复
