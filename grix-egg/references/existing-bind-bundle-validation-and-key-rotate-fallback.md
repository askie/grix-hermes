# Existing bind: bundle validation + key-rotate fallback

适用场景：
- 用户要求把一个已存在的 Grix agent 接管到本地 Hermes profile
- 需要走 `grix-egg --route existing`
- 现场环境里技能包/源码树可能是混合布局，导致默认 install dir 或 key rotate 路径不稳定

本次会话沉淀出的可复用结论：

## 1. 先把“已有 agent”分成两件事

- 远端对象是否已存在
- 本地是否已有可运行 profile

即使远端 agent 已存在，也通常仍需要：
1. 轮换 key 拿到新的明文 `api_key`
2. 准备一个 `bind_local` 可接受的有效 bundle
3. 再做本地绑定和 gateway 启动

## 2. `bind_local` 前先做 bundle 结构验证

`bind_local.js` 不只是要一个“看起来像 grix-hermes 的目录”，而是要一个满足校验的 bundle。最小应检查：

- `bin/grix-hermes.js`
- `lib/manifest.js`
- `grix-admin/SKILL.md`
- `shared/cli/skill-wrapper.js` 或 `shared/cli/grix-hermes.js` 至少一个存在

现场可能出现两种坏包：

- 全局安装包：有 `grix-admin/SKILL.md`，但缺 `shared/cli/*`
- profile 内部包：有 `shared/cli/*`，但缺 `grix-admin/SKILL.md`

这两种都可能让现成目录“看起来差不多”，但对 `bind_local` 都不够稳。

## 3. 最稳妥的修复：现场重新导出一个临时 bundle

如果默认 install dir 不通过校验，直接从当前源码树重新导出一个临时 bundle：

```bash
HOME=/Users/gcf node /Volumes/disk1/go/src/grix-hermes/bin/grix-hermes.js install \
  --dest /tmp/xuebi-grix-bundle \
  --force \
  --skip-cron
```

然后把这个目录作为 `bind_local` / `bootstrap --install-dir` 的输入。

## 4. 中文 agent 名不要直接当 profile 名

中文显示名例如 `雪碧` 仍需额外提供 ASCII-safe profile 名，例如：

```bash
--profile-name xuebi
```

## 5. 先 dry-run 再正式 bind

先验证计划：

```bash
HOME=/Users/gcf HERMES_HOME=/Users/gcf/.hermes \
node /Volumes/disk1/go/src/grix-hermes/grix-egg/scripts/bind_local.js \
  --agent-name 雪碧 \
  --profile-name xuebi \
  --agent-id 2050958189851574272 \
  --api-endpoint 'wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2050958189851574272' \
  --api-key '<PLAINTEXT_KEY>' \
  --is-main true \
  --install-dir /tmp/xuebi-grix-bundle \
  --inherit-keys global \
  --dry-run --json
```

通过后再去掉 `--dry-run`。

## 6. key rotate 的实战兜底

如果技能声明可用，但现场的包装脚本/导出名不一致，`grix_invoke(action="agent_api_key_rotate")` 或封装 CLI 可能不能直接走通。已遇到的具体模式：

- CLI 入口 `shared/cli/grix-hermes.js` 导入名写成 `runKeyRotate`
- 实际 `actions.js` 导出名是 `rotateAgentKey`
- 结果一跑就报 ESM import/export mismatch

处理方式：
1. 优先修正当前 live tree / source-linked tree 的导出名不一致
2. 再执行 key rotate
3. 从 `tempKeyFile` 读取新的明文 key，用于后续 existing bind

## 7. `start_gateway.js` 可能出现“假失败”

已遇到一种现象：
- `start_gateway.js` 返回 `ok:false`
- 但 `gateway.log` 已明确显示：
  - `Connected to ...`
  - `✓ grix connected`
  - `Gateway running with 1 platform(s)`
- 同时 `hermes --profile <name> gateway status` 显示 launchd service loaded 且有 PID

结论：
- 这类场景应以日志中的真实连接成功为准
- `start_gateway.js` 的 running-state 探测可能对 launchd / detached-run 路径存在假负例
- 不要因为脚本 envelope 是失败就立刻回滚绑定结果
