# 源码模式与编译安装模式兼容排查

适用场景：`grix-egg/bootstrap.js` 在真实仓库源码运行时找不到某个 `scripts/*.js`，但希望同时保持 npm 安装产物可用。

## 已验证根因

`bootstrap.ts` 会按固定路径调用这些脚本：

- `grix-admin/scripts/admin.js`
- `grix-group/scripts/group.js`
- `grix-query/scripts/query.js`
- `message-send/scripts/send.js`
- `message-unsend/scripts/unsend.js`
- `grix-egg/scripts/bind_local.js`
- `grix-egg/scripts/start_gateway.js`
- `grix-register/scripts/create_api_agent_and_bind.js`

如果源码树里缺少前几类 thin shim，即使测试通过，真实运行仍会在 create/accept 阶段因 `MODULE_NOT_FOUND` 失败。

## 推荐修法

采用“共享模块 + 技能级 thin shim”：

- 共享逻辑放在 `shared/cli/skill-wrapper.ts` 和 `shared/cli/actions.ts`
- 各技能下仅保留极薄入口脚本，例如：
  - `admin.ts` -> `runSharedCliAction("admin")`
  - `group.ts` -> `runSharedCliAction("group")`
  - `query.ts` -> `runSharedCliAction("query")`
  - `send.ts` -> `runSharedCliAction("send")`
  - `unsend.ts` -> `runSharedCliAction("unsend")`

## 验证顺序

1. `npm run build`
2. 检查源码树是否生成对应 `.js`
3. `npm test`
4. `npm pack --dry-run`
5. 确认 tarball 内也包含这些 `scripts/*.js`

## 重要判读

如果补齐脚本后，真实孵化从 `Cannot find module .../admin.js` 前进为：

- `grix error: code=4004 msg=unsupported cmd for hermes`

说明：

- 本地脚本链问题已解决
- 剩余问题是当前 Hermes/Grix runtime 不支持 admin invoke / agent create
- 后续应转向 capability probe 或 fallback 策略，而不是继续怀疑源码/打包布局
