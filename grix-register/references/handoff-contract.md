# Handoff To grix-egg

`grix-register` 在完成注册、登录和首个 API agent 创建后，不自己手工写本地 Hermes profile，也不交给 `grix-admin`。

本地绑定统一交给 `grix-egg`。需要传递的字段：

- `profile_name`
- `agent_name`
- `agent_id`
- `api_endpoint`
- `api_key`
- `is_main`

推荐后续命令：

```bash
node ../grix-egg/scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --profile-name <PROFILE_NAME> \
  --route existing \
  --bind-json <BIND_JSON_FILE> \
  --json
```

内部实现可以调用 `grix-egg/scripts/bind_local.js`，但公开技能调用不要直接走这个 helper。
