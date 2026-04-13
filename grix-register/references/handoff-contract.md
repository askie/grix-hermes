# Handoff To grix-admin

`grix-register` 在完成注册、登录和首个 API agent 创建后，不再自己手工写本地 Hermes profile。

它应继续把下面这组字段交给 `grix-admin`：

- `profile_name`
- `agent_name`
- `agent_id`
- `api_endpoint`
- `api_key`
- 可选：`skill_endpoint`
- 可选：`skill_agent_id`
- 可选：`skill_api_key`
- 可选：`skill_account_id`

推荐后续命令：

```bash
python3 ../grix-admin/scripts/bind_local.py \
  --profile-name <PROFILE_NAME> \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --skill-endpoint <SKILL_WS_URL> \
  --skill-agent-id <SKILL_AGENT_ID> \
  --skill-api-key <SKILL_API_KEY>
```
