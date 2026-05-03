# bootstrap 脚本编排回退与 shared/cli 恢复

本次会话确认了一个容易复发的坑：`grix-egg/scripts/bootstrap.ts` 虽然可以直接 import `shared/cli/*.js`，但当前仓库的测试夹具和构建链并不支持把 create/accept 全部改成 bootstrap 内直连 WS client。

## 根因

一次重构把以下步骤改成了 bootstrap 内直接使用 shared/cli WS client：

- create
- accept
- status card

但现有测试桩是通过 fake node 拦截外部脚本调用链来验证的：

- `grix-admin/scripts/admin.js`
- `grix-group/scripts/group.js`
- `grix-query/scripts/query.js`
- `message-send/scripts/send.js`

结果测试不再命中 fake 脚本，而是直接尝试连接假地址，出现：

- `getaddrinfo ENOTFOUND caller`
- `getaddrinfo ENOTFOUND profile-target`

## 已验证的正确修复方向

保留 bootstrap 新增能力：

- detect
- create_new / existing / http fallback
- accept
- checkpoint / resume

但关键执行路径必须回到外部脚本编排：

- WS create → `grix-admin/scripts/admin.js --action create_grix`
- 验收建群 → `grix-group/scripts/group.js --action create`
- 发送状态卡 / probe → `message-send/scripts/send.js`
- 拉历史消息 → `grix-query/scripts/query.js --action history`

这样既复用现有 CLI 契约，也兼容当前测试桩与环境解析逻辑。

## shared/cli 文件恢复坑

调试中如果删除以下 `.ts` 源文件：

- `shared/cli/actions.ts`
- `shared/cli/aibot-client.ts`
- `shared/cli/config.ts`
- `shared/cli/targets.ts`

即使目录里仍有对应 `.js` 文件，`tsc` / `npm test` 也可能报：

- `Could not find a declaration file for module '../../shared/cli/config.js'`
- shared/cli 相关 import 隐式 `any`

结论：这些 `.ts` 不能被当作可随意清理的调试残留。若为修复而从历史提交恢复，必须一并纳入最终 commit。

## 真实空蛋孵化补充验证：测试绿 ≠ 运行链可用

后续真实 smoke test 暴露了一个更具体的问题：即使 `npm test -- --test-name-pattern=grix-egg` 与 `npm pack --dry-run` 全绿，`bootstrap.js` 的真实空蛋孵化仍可能失败。

### 复现条件

- 当前 Hermes/Grix 运行时存在 `GRIX_ENDPOINT`、`GRIX_AGENT_ID`、`GRIX_API_KEY`
- `grix_invoke(action="agent_category_list", params={})` 返回：
  - `unsupported cmd for hermes`
- 这表示当前会话没有原生 admin invoke 能力，但 bootstrap 的 `detect` 仍会因为看到宿主会话凭证而判定 `path=host`

### 真实失败表现

真实执行：

```bash
HOME=/Users/gcf node grix-egg/scripts/bootstrap.js \
  --install-id egg-smoke-... \
  --agent-name egg-smoke-... \
  --profile-name egg-smoke-... \
  --install-dir /Users/gcf/.hermes/tmp/<bundle> \
  --hermes-home /Users/gcf/.hermes \
  --json
```

得到：

- `detect`: done, `path=host`
- `install`: done
- `create`: failed
- 错误：`Cannot find module '/.../grix-admin/scripts/admin.js'`

### 根因判读

这说明：

1. `detect=host` 仅说明“环境里存在可复用宿主会话凭证”，不说明当前运行时真的支持 host/admin create
2. 当前测试之所以能绿，是因为 `tests/grix-egg.test.ts` 用 fake node stub 掉了：
   - `grix-admin/scripts/admin.js`
   - `grix-group/scripts/group.js`
   - `grix-query/scripts/query.js`
   - `message-send/scripts/send.js`
3. 真实源码树或安装 bundle 中如果缺少这些脚本，bootstrap 会在真实执行时直接 `MODULE_NOT_FOUND`

### 实战结论

遇到“用户要求真实孵化 smoke test”时，必须把下面三件事分开判断：

- 测试契约是否通过
- 当前会话是否具备 admin invoke 能力
- bootstrap 依赖的脚本编排链是否完整落盘

只满足第一条，不足以宣布空蛋孵化可用。

```bash
npm test -- --test-name-pattern=grix-egg
npm pack --dry-run
git status --short
```

验收标准：

1. `npm test -- --test-name-pattern=grix-egg` 全绿
2. `npm pack --dry-run` 确认运行时 `.js` 脚本已进入发布产物
3. 工作区没有误删的 `shared/cli/*.ts`
4. 若构建依赖恢复出的 shared/cli 源文件，它们必须已被 `git add` 并进入最终提交

## 跨仓影响面

本次还静态检查了以下仓库：

- `/Volumes/disk1/go/src/grix-claude`
- `/Volumes/disk1/go/src/grix-codex`
- `/Volumes/disk1/go/src/grix-gemini`
- `/Volumes/disk1/go/src/grix-qwen`

未发现它们对 `grix-hermes/shared/cli/*` 的路径引用；删除或恢复这些文件的影响面限定在 `grix-hermes` 仓库自身。
