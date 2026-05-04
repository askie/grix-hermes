# Hermes host admin/create capability mismatch triage

本次排查补充了一个比“缺 token”更精确的根因分层：当前环境里出现

- `grix error: code=4004 msg=unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd for hermes`

时，优先怀疑的是 **宿主类型 / capability 代际不一致或服务端策略禁用**，而不是先要求 `GRIX_ACCESS_TOKEN`。

## 已核对到的实现事实

### Hermes-agent 侧（当前 gateway）

`hermes-agent` 当前公开的 AIBOT v1 语义是：

- command: `agent_invoke`
- capability: `agent_invoke_v1`
- auth payload 还会携带：
  - `host_type: hermes`
  - `client_type: hermes`

相关代码位置：
- `gateway/platforms/aibot_contract.py`
- `gateway/platforms/grix_protocol.py`
- `gateway/platforms/grix_transport.py`
- `tools/grix_invoke_tool.py`

### grix-hermes shared CLI 侧

`shared/cli/config.ts` 当前默认 runtime capability 仍是：

- `session_route`
- `thread_v1`
- `inbound_media_v1`
- `local_action_v1`
- `agent_invoke`

注意这里是 `agent_invoke`，不是 `agent_invoke_v1`。

### grix-egg / tests 已覆盖的行为

`tests/grix-egg.test.js` 已明确验证：

- 当 host/create 返回 `unsupported cmd for hermes`
- `bootstrap` 应保持 `state.path = "host"`
- `steps.create.status = failed`
- 即使命令行里同时给了 `--access-token`，也 **不自动 HTTP fallback**

## 因此如何解释这个错误

看到 `unsupported cmd for hermes` 时，不要只下“当前没有 token”的结论。更准确的候选根因有三类：

1. **服务端对 `host_type=hermes` 根本没开 admin/create**
2. **服务端 capability/协议仍认旧名字，而当前 Hermes 声明的是 v1 名字**
   - 例如客户端认为能力叫 `agent_invoke_v1`
   - 某些旧 CLI/旧服务端思路仍按 `agent_invoke` 协商或分流
3. **服务端只允许普通 invoke，不允许 `agent_api_create` / `agent_category_*` 这类 admin action**

## 实战排障顺序

真实环境里碰到这个报错时，先这样分层：

1. 确认 WS 本身已连接、已认证
   - 这只能证明 transport 正常
   - 不能证明 admin/create 对 hermes host 开放

2. 直接跑最小 admin invoke 证据
   - `agent_category_list`
   - `agent_api_create`
   - `grix-admin --action create_grix`

3. 若统一报 `unsupported cmd for hermes`，优先汇报：
   - 当前链路“能连、能聊，但不能以 hermes host 身份做 admin/create”

4. 再决定后续方向：
   - 查服务端/桥接实现是否按 `host_type` 或 capability 分流
   - 查是否存在 `agent_invoke` vs `agent_invoke_v1` 代际不一致
   - 或改走 `existing` / 独立 HTTP 工具链

## 对用户的汇报口径

推荐直接说：

- 不是 grix-egg 没走 WS
- 也不是 Hermes 本地没发 agent_invoke
- 而是当前远端宿主对 `hermes` 这类 host 的 admin/create 不支持，或协议能力名存在代际不一致

避免误导性说法：

- “现在只差一个 `GRIX_ACCESS_TOKEN`”
- “grix-egg 还是默认需要 token”
- “WS 连上了就代表 create_new 一定能建”