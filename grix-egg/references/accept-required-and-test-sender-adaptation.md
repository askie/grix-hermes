# accept 必做化与测试适配

本轮把 `grix-egg/scripts/bootstrap.ts` 的验收语义从“缺参数时 skipped”改成“必做”。

关键收口：

1. bootstrap 默认补齐：
   - `--probe-message` 默认 `probe`
   - `--expected-substring` 默认 `identity-ok`
2. `stepAccept()` 不再在缺参时 `markStepSkipped(state, "accept")`；应直接失败或依赖默认值继续执行。
3. 文档必须同步更新，不能继续写“验收测试（可选）”。
4. 既有测试若依赖假消息历史，需要让 fake `query.js` 的 `sender_id` 可配置；否则像 HTTP create / `createdAgent` 包装场景下，目标 agent id 变了，严格验收会误判超时。

本轮为测试桩增加了一个实用模式：
- 环境变量 `FAKE_ACCEPTANCE_SENDER`
- fake `query.js` 读取该变量，生成与目标 agent 一致的 sender_id

这样可以同时覆盖：
- 默认 host/create 场景：`agent-target`
- HTTP fallback 场景：`http-agent`
- `createdAgent` 包装返回场景：`agent-created`

回归验证：
- `npm test -- --test-name-pattern=grix-egg`
- 结果：21 passed, 0 failed
