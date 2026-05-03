# 宿主 create 能力 vs 旧 HTTP fallback 心智模型

本次会话确认了一类高价值误判：技能/回答如果仍沿用“有 WS 凭证 -> WS；失败后补 `GRIX_ACCESS_TOKEN` 走 HTTP fallback”的旧模型，会把当前 `grix-egg` 实现说错。

## 当前实现应如何判断

对 `create_new`：
- 主路径是复用宿主 Hermes/Grix live bridge（host path）
- `GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY` 只能证明“检测到可复用宿主会话凭证”
- 这不等于当前运行时一定暴露了 admin/create 能力

如果真实创建时报：
- `unsupported cmd for hermes`
- 或等价的 `agent_invoke failed ... unsupported cmd ...`

应优先下结论：
- 当前宿主会话没有暴露可复用的 create/admin bridge
- 当前阻塞主因是宿主能力缺口，不是“少一个 access token 就能继续”

因此后续动作优先级应是：
1. 说明 `create_new` 主路径被宿主 create 能力卡住
2. 若用户有现成凭证，改走 `--route existing`
3. 若没有现成凭证，再讨论是否存在独立的旧 HTTP create 兼容链路
4. 不要默认把“请提供 `GRIX_ACCESS_TOKEN`”当成当前实现的第一建议

## 什么时候要怀疑是技能文案而不是代码逻辑

如果回答里同时出现这些说法：
- “当前实现会自动/应该 HTTP fallback”
- “没有 `GRIX_ACCESS_TOKEN` 所以现在只差 token”
- “WS 已连接但 create 失败，所以补 token 即可”

而代码/测试主线已经改成 host-first、existing-second，那么优先判定为：
- 技能文案残留旧心智模型
- 需要先修 skill，再继续给用户解释

## 源码树 / 编译产物不同步的额外陷阱

本次还遇到一类会混淆判断的仓库状态问题：
- TypeScript 源码和生成的 `.js` 产物不同步
- 测试运行时出现：
  - `config.js` 缺少预期 export
  - `grix-egg/scripts/bind_local.js` 不存在
  - 其他测试断言仍停留在旧的 `ws/http` 语义

这类情况下要明确区分三层问题：
1. 技能文案是否过时
2. 代码主线语义是否已改成 host-first
3. 当前工作树是否因为编译产物/测试桩不同步而不具备“可信复验”条件

不要把第 3 类问题误报成“只剩凭证问题”。
