# Handoff To grix-admin

`grix-register` 在完成注册、登录和首个 API agent 创建后，不再自己手工写本地 Hermes profile。

它应继续把下面这组字段交给 `grix-admin`：

- `profile_name`
- `agent_name`
- `agent_id`
- `api_endpoint`
- `api_key`
- `is_main`

推荐后续命令：

```bash
node ../grix-admin/scripts/bind_local.js \
  --profile-name <PROFILE_NAME> \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --is-main true|false
```
