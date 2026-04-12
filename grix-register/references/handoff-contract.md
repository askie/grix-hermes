# Handoff To grix-admin

`grix-register` 在完成注册、登录和首个 API agent 创建后，不再自己手工写本地 OpenClaw 配置。

它应继续把下面这组字段交给 `grix-admin`：

- `agent_name`
- `agent_id`
- `api_endpoint`
- `api_key`

推荐后续命令：

```bash
python3 ../grix-admin/scripts/bind_local.py \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --model <MODEL>
```
