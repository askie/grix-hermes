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

如果只是内部 helper 调用、不需要完整 bootstrap，可以使用：

```bash
node ../grix-egg/scripts/bind_local.js \
  --profile-name <PROFILE_NAME> \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --is-main true|false
```
