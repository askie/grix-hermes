# create_new：host 优先 + login 驱动的 HTTP fallback

本轮会话确认并修正了 `grix-egg create_new` 的精确语义：

1. 检测阶段
- 若当前 Hermes home / profile 可复用宿主 Grix 会话凭证，则 `detect.path = host`
- 若没有可复用宿主会话，但 CLI 已显式提供 `--access-token`，则 `detect.path = http`
- 若两者都没有，应明确报错，并提示先通过 `grix-register login/register` 现场拿 token

2. 创建阶段
- `detect=host` 时，优先走宿主 create
- 若 host create 报 `unsupported cmd for hermes`，应保持 `state.path = host` 并把 create 标记 failed
- 这时不能因为同时给了 `--access-token` 就静默改写成 HTTP 成功

3. HTTP fallback 的正确触发方式
- 不是假设环境里早就有 `GRIX_ACCESS_TOKEN`
- 而是先向用户获取邮箱/账号与密码
- 必要时 `send-email-code -> register`
- 再 `login` 现场拿到 access token
- 再把 token 传给 `create_new` / `create_api_agent_and_bind`

4. 测试收口
- 原测试“无 host 会话时即使给 token 也失败”已改为“无 host 会话但给 token 时走 HTTP fallback 成功”
- 另一条测试仍保留：若已 detect=host，而 host create 返回 `unsupported cmd for hermes`，则 fail fast，不静默切 HTTP

适用场景：
- 回答“grix-egg 是否卡在 token 前置”
- 修正 create_new 的产品语义
- 审核 bootstrap detect/create 状态与测试是否一致
