# 雪碧空 agent 创建失败的三层阻塞判读

本次真实执行补充了一个重要判读顺序：当用户要求“现在创建一个空 agent”时，不要只看最终 create 是否报 `unsupported cmd for hermes`，而要把阻塞拆成三层。

## 1. install 层先失败：源码树 / bundle 布局问题

真实命令：

```bash
HOME=/Users/gcf node /Volumes/disk1/go/src/grix-hermes/grix-egg/scripts/bootstrap.js \
  --install-id egg-eee65ef2 \
  --agent-name 雪碧 \
  --profile-name xuebi \
  --route create_new \
  --access-token "$GRIX_ACCESS_TOKEN" \
  --json
```

真实失败：

- `step=install`
- `ENOENT: no such file or directory, lstat '/Volumes/disk1/go/src/grix-hermes/grix-admin'`

要点：
- 这说明当前源码树直跑 `bootstrap.js` 时，install 阶段就可能因为 bundle/source 布局不完整而失败。
- 此时还不能把结论写成“create 阶段被宿主 Grix admin 能力阻塞”，因为流程根本还没走到 create。

状态文件现场：
- `/Users/gcf/.hermes/profiles/grix-online/tmp/grix-egg-egg-eee65ef2.json`

其中能看到：
- `steps.detect.status=done`
- `steps.install.status=failed`
- `state.path=host`
- 但 `create/bind/gateway` 都还未执行

## 2. host/create_new 层失败：宿主 admin/create capability 不可用

最小 capability probe：

```text
grix_invoke(action="agent_category_list", params={})
```

真实返回：
- `agent_invoke failed: grix error: code=4004 msg=unsupported cmd for hermes`

要点：
- 说明当前会话虽然可探测到 WS 凭证，但宿主 Hermes→Grix 运行时没有暴露可用的 admin/create invoke 能力。
- 因此 `create_new` 的 host 路径当前不能真正创建远端 agent。

## 3. HTTP fallback 层失败：当前没有可用 GRIX_ACCESS_TOKEN

本次还额外核查了三处 token 来源：

1. 当前进程环境变量
2. `/Users/gcf/.hermes/.env`
3. `/Users/gcf/.hermes/profiles/grix-online/.env`

真实结果：
- 当前进程环境里 `GRIX_ACCESS_TOKEN` 不存在
- 两个 `.env` 文件里也没有 `GRIX_ACCESS_TOKEN`

要点：
- 即使其他凭证（如 `GRIX_AGENT_ID` / `GRIX_API_KEY`）存在，也不能据此推断 HTTP 创建链路可用。
- 此时应明确告诉用户：不是“只差把 create_new 再试一次”，而是 **host 路径失败 + HTTP 路径也缺 token**。

## 4. 新证据：admin capability 已恢复时，仍可能被 install/source-tree 布局先拦住

后续复测里又拿到了一个重要反例：

- `grix_invoke(action="agent_category_list", params={})` 已成功返回分类列表
- 说明当前会话里 **宿主 admin invoke 能力本身是可用的**

但同一时段再次执行源码树直跑：

```bash
HOME=/Users/gcf node /Volumes/disk1/go/src/grix-hermes/grix-egg/scripts/bootstrap.js \
  --install-id egg-1e9d5a66 \
  --agent-name 雪碧 \
  --profile-name xuebi \
  --route create_new \
  --json
```

仍然在 `step=install` 失败：

- `ENOENT: no such file or directory, lstat '/Volumes/disk1/go/src/grix-hermes/grix-admin'`

对应状态文件：

- `/Users/gcf/.hermes/profiles/grix-online/tmp/grix-egg-egg-1e9d5a66.json`

其中可见：

- `steps.detect.status=done`
- `steps.install.status=failed`
- `steps.create.status=pending`
- `state.path=host`

这说明汇报时要避免把历史上出现过的 `unsupported cmd for hermes` 当成当前唯一根因。真实判断顺序应更新为：

1. 先看流程是否已经走到 `create`
2. 如果停在 `install`，优先判定为 **源码树 / install manifest / bundle 布局问题**
3. 只有在流程已经进入 `create` 且 admin probe 失败时，才归因为宿主 capability 阻塞

因此，对“雪碧空 agent 还没创建出来”的当前精确口径应是：

- 这次主阻塞是 install/source-tree 布局引用了缺失的 `grix-admin`
- 不是 create/admin capability 本身再次失败

推荐向用户直接归纳为：

- 已实际执行，不是纸面判断
- 当前有三层阻塞需分开看：
  1. 源码树 bootstrap install 先失败
  2. 宿主 admin/create capability 返回 `unsupported cmd for hermes`
  3. HTTP create-api-agent 需要的 `GRIX_ACCESS_TOKEN` 当前不存在
- 因此当前状态应表述为：
  - “两条创建路都不通”，而不是单一路径报错

## 额外细节

- 中文显示名 `雪碧` 不能直接作为 Hermes profile 名，需显式提供 ASCII-safe：`xuebi`
- 这次 install id 为：`egg-eee65ef2`
