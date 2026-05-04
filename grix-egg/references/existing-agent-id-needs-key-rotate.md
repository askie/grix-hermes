# Existing agent_id without plaintext api_key

适用场景：
- 用户要走 `grix-egg --route existing`
- 只提供了已存在的 `agent_id`
- 没有提供明文 `api_key`

结论：
- 不要尝试从脱敏输出、旧 checkpoint、或历史 env 片段里恢复 key
- `bind_local` 会拒绝 masked key
- 正确路径通常是先轮换 key，再继续 existing bind

推荐步骤：
1. 使用 `grix-key-rotate`
2. 或等价地调用 `grix_invoke(action="agent_api_key_rotate", params={"agent_id": "<AGENT_ID>"})`
3. 取得新的明文 `api_key`
4. 再执行 `grix-egg --route existing`，显式提供 `--agent-id --api-endpoint --api-key`

为什么：
- `existing` 绑定要求完整凭证，而不只是 `agent_id`
- 脱敏 key 不能直接用于绑定
- 轮换 key 是把“已有 agent_id”转成“可绑定明文凭证”的标准手段
