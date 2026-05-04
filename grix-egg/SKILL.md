---
name: grix-egg
description: Hermes agent 孵化技能。AI agent 用原生工具创建远端 agent，本地脚本完成 profile 绑定和 gateway 启动。支持空蛋孵化和已有凭证绑定。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, egg, bootstrap, agent-creation, profile-binding]
    related_skills: [grix-admin, grix-register, message-send]
---

# Grix Egg

这个技能提供 Hermes agent 孵化能力。分为远程操作和本地操作两部分。

## 流程概览

1. **检测路径**：优先探测当前 Hermes home / profile 是否已有完整 Grix WS 凭证
2. **安装技能**：本地安装 `grix-hermes`
3. **创建或接管远端 agent**
4. **本地绑定 profile**
5. **写入 SOUL / 启动 gateway**
6. **验收测试**（可选）

## 面向普通用户的执行与汇报（新）

当用户只是想“帮我创建一个 agent / 让它上线”，且任务语义已经足够明确时：

- 直接执行，不要先停下来做确认式追问
- 不要默认抛一大段技术细节、预检细节、路径细节
- 正常汇报应尽量只给：
  - 是否创建成功
  - agent 名称
  - profile 名
  - 如有需要再给 agent_id
- 只有失败、卡住、或用户追问“为什么”时，再展开技术原因

也就是说，这类任务的默认外显风格应是：**先把事做完，再用最短结果式语言回报**，而不是把排障过程当成主输出。

当前 `bootstrap.js` 现在应收敛为两类主语义：

- `--route create_new`：优先复用宿主 Hermes/Grix live bridge 完成远端创建；当宿主 WS/create 能力不存在或不可用时，可改走独立 HTTP create-and-bind fallback
- `--route existing`：跳过创建，直接绑定已有凭证

其中 `create_new` 的设计目标是：**宿主 Grix 能力优先；但如果宿主 create 能力不存在，允许走 `access_token` / HTTP create-and-bind fallback。只有当 host 与 HTTP 两条链路都不可用时，才应把能力缺口直接暴露出来。**
## 第一步：创建远端 Agent

默认设计里，空蛋孵化的首选路径是：**复用当前 Grix WebSocket/host live bridge 完成远端创建**。也就是说：

- 如果当前 Hermes→Grix 连接已经具备可用的宿主 create 能力，**不需要 `access_token`**
- `GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY` 只能证明“检测到可复用宿主会话凭证”
- 这不等于当前运行时一定暴露了 admin/create 能力
- 当宿主 create 能力不可用时，当前实现的推荐分流是：
  1. 改走 `--route existing` 绑定已有凭证
  2. 排查宿主 Hermes/Grix create bridge 能力
  3. 如确有独立 HTTP 链路需求，再单独走 `grix-register` / `create_api_agent_and_bind.js`

### 重要澄清：`WS 已连上` 不等于 `当前 bootstrap 一定能成功走宿主 create`


这里要区分三件事：

1. **有 WS 凭证 / 通道在线**
   - 例如当前环境里已经有 `GRIX_ENDPOINT`、`GRIX_AGENT_ID`、`GRIX_API_KEY`
   - 这说明可以复用 Grix WS 通道做一部分事情

2. **当前 Hermes 运行时暴露了 admin invoke 能力**
   - 例如 `grix_invoke(action="agent_category_list", params={})` 能成功
   - 如果返回 `unsupported cmd for hermes`，说明**当前会话虽然连着 Grix，但并没有暴露 admin invoke 能力**

3. **当前 bootstrap 依赖的本地脚本链真实存在且可执行**
   - 例如 `grix-admin/scripts/admin.js`、`grix-group/scripts/group.js`、`message-send/scripts/send.js`、`grix-query/scripts/query.js`
   - 这些缺任何一个，真实 bootstrap 也会失败

因此，**不要把“WS 已连接/已有 WS 凭证”直接等同于“空蛋孵化一定不需要别的前置检查”**。真正需要验证的是：

- 当前会话是否具备 admin invoke / create 能力，或
- 当前 bootstrap 所依赖的 WS 脚本链是否完整可用

如果宿主 create 能力不可用，当前实现应优先判断是否具备可用的 HTTP create-and-bind 条件；若已通过 `grix-register login/register` 现场拿到可用 access token，则允许 `create_new` 改走 HTTP fallback。只有 host 与 HTTP 两条创建链都不可用时，才应明确暴露能力缺口。

### 前置检查：确认当前会话具备 Grix admin invoke 能力

不要只因为 `grix-egg` / `grix-admin` 技能已加载，就假设 `agent_api_create` 一定可用。还需要确认当前 Hermes→Grix 运行时支持对应能力。

如果调用类似下面的 admin action：

```
grix_invoke(action="agent_category_list", params={})
```

返回类似：

- `unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd ...`

则应判定为：**当前 Grix 连接不支持 admin invoke 路径**。这不是 `grix-egg` 技能目录格式错误，也不是单纯参数问题，而是当前运行时能力/协议不满足。

此时不要把 `access_token` 当成默认前提；应先明确说明：

- 首选方案本来仍然应该是复用宿主/WS 通道
- 只是当前运行时/实现没有把可用的 admin create 能力暴露出来，或者 bootstrap 的 WS 脚本链不完整

在这个前提下，再改走以下其一：

1. **已有凭证绑定**：让上游提供 `agent_id` / `api_endpoint` / `api_key`，然后走 `--route existing`
2. **环境排查**：检查当前 Hermes gateway / Grix adapter 的 capability 协商是否真的暴露了 admin invoke / create
3. **脚本链排查**：确认 bootstrap 依赖的 `scripts/*.js` 在源码树/安装包里真实存在
4. **HTTP 链路**：如果宿主 create 不可用，允许改走 `grix-register` / `create_api_agent_and_bind.js`；但 token 不应假设已预置在环境变量里，优先应向用户获取邮箱和密码，通过登录实时换取 access token，再继续后续创建/绑定

补充参考：
- `references/create-new-failure-triage.md`：区分 install/source-tree 阻塞、host capability 阻塞、HTTP token 阻塞
- `references/hermes-host-admin-capability-mismatch.md`：`unsupported cmd for hermes` 的 capability/host-type 判读
- `references/source-vs-installed-layout.md`：源码树与安装包布局兼容排查

### 宿主 create 路径

当前 bootstrap 的实现是：**通过外部脚本链执行 WS 管理动作，而不是在 bootstrap 内直接 new WS client 做 create**。

具体调用链：

- 创建：`grix-admin/scripts/admin.js --action create_grix`
- 建群验收：`grix-group/scripts/group.js --action create`
- 发状态卡 / 探针：`message-send/scripts/send.js`
- 拉消息历史：`grix-query/scripts/query.js --action history`

这样可以复用既有 CLI 契约、环境解析和测试桩；但要注意：**真实运行前必须确认这些脚本文件确实存在于当前源码树或安装包中**。如果测试里只是 fake stub 了这些脚本，而真实目录中并不存在，那么 `bootstrap.js` 仍会在 create/accept 阶段因为 `MODULE_NOT_FOUND` 失败。

使用 `grix_invoke` 创建远端 Grix API agent：

```
grix_invoke(action="agent_api_create", params={"agent_name": "<NAME>", "is_main": false, "introduction": "<INTRODUCTION>"})
```

返回结果包含 `agent_id`、`api_endpoint`、`api_key`。

如果需要指定分类：

```
grix_invoke(action="agent_api_create", params={"agent_name": "<NAME>", "is_main": true, "category_id": "<CATEGORY_ID>"})
```

### 当前实现的 host / HTTP 分流说明

当 `detect` 判定当前路径是 `host`，但真实执行 `create_grix` 时返回类似：

- `grix error: code=4004 msg=unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd for hermes`

应分两层理解：

1. `detect` 仍可先判定“当前环境存在可复用宿主会话凭证”
2. 但真实 host create/admin capability 仍可能不可用

在这种情况下，当前推荐语义应是：

- 若同时具备有效的 HTTP create-and-bind 条件（例如已通过登录现场拿到 access token），则允许 `create_new` 自动改走 HTTP fallback
- 若 HTTP 前置也不满足，再把失败直接暴露给用户

这意味着：

- `WS 已连上` 仍然是首选探测结果
- 但 host create 能力失败并不一定意味着整次 `create_new` 必须终止
- 是否继续，取决于 HTTP fallback 所需前置是否真实存在
- 汇报时应明确区分：宿主 create bridge 失败，与 HTTP fallback 不可用，是两个层级的问题

### 真实复验时的注意点（新）

如果当前环境还保留旧的 `grix-register` / `create_api_agent_and_bind.js` 独立链路，不要把它与 `create_new` 的主路径语义混为一谈。汇报时要明确区分：

1. **当前 `create_new` 是否依赖宿主 create bridge**
2. **当前仓库是否另外保留了独立 HTTP 创建工具**
3. **当前是否真的具备跑通独立 HTTP 链路所需的登录前置**
   - 例如是否已经向用户获取邮箱/账号与密码，并能现场登录换取 access token

不要把“环境里没有 token”误报成“`create_new` 仍未修好”；二者是不同层级的问题。

### bind_local 安装目录校验兼容性（新）

`bind_local.ts` 的 bundle 校验应兼容两种 shared CLI 布局：

- `shared/cli/skill-wrapper.js`
- `shared/cli/grix-hermes.js`

其中前者对应新的共享 wrapper 结构，后者对应旧测试/旧 bundle 结构。校验逻辑应要求：

- `bin/grix-hermes.js`
- `lib/manifest.js`
- `grix-admin/SKILL.md`

始终存在；并且上面两个 shared CLI 入口中**至少一个**存在。

否则会出现一种假红：

- 真实代码已兼容新 wrapper
- 但测试桩或旧 bundle 仍只创建 `shared/cli/grix-hermes.js`
- 结果 `bind_local` 被错误判定为“不是有效 bundle”

### create_new 成功创建但脚本误判失败（新）

已验证一种真实现场模式：

- `bootstrap.js --route create_new` 在 `step=create` 失败
- 表面报错：`WS 创建 agent 未返回有效凭证`
- 但 `raw_error` / stdout 里其实已经有：
  - `ok: true`
  - `action: create_grix`
  - `createdAgent.id`
  - `createdAgent.api_endpoint`
  - `createdAgent.api_key`

这类情况应判定为：

- 远端 agent 实际已经创建成功
- 当前阻塞是 `bootstrap` 对 host create 返回结构解析不兼容，而不是真创建失败

现场处理应立刻改为：

1. 从 `createdAgent` 提取 `id / api_endpoint / api_key`
2. 保留原显示名
3. 中文名仍显式提供 ASCII-safe `--profile-name`
4. 直接改走 `--route existing` 完成本地绑定和 gateway 启动

如果同时遇到 `Install dir points to a git checkout`，不要把源码树直接传给 `--install-dir`；先从源码树导出一个临时 bundle，再把该 bundle 用于 existing bind。

详细现场记录见：
- `references/create-new-createdagent-false-failure.md`

### create_new 成功但 gateway 因 profile home 错位假失败（新）

已验证一种真实现场模式：

- `create` 与 `bind` 已成功，state file 里已有目标 `agent_id / api_endpoint`
- `bind.result.profile_dir` 写在当前受保护 profile 的嵌套路径下（如 `~/.hermes/profiles/grix-online/profiles/<name>`）
- 但 `hermes --profile <name> gateway status` / `restart` 实际查看的是根 profile `~/.hermes/profiles/<name>`
- 根 profile 因缺少 `.env` 与 `channels.grix.wsUrl`，日志会出现 `No messaging platforms enabled.`
- 于是 `bootstrap` 在 `step=gateway` 假失败，容易被误判成整次创建失败

现场处理顺序应是：

1. 先读 state file，确认 `create.status=done` 且已有 `agent_id / api_endpoint`
2. 再比对 `bind.result.profile_dir` 与 `hermes --profile <name> profile show <name>` 指向的真实 profile 路径是否一致
3. 若根 profile 日志是 `No messaging platforms enabled.`，优先判定为 profile home 错位
4. 将嵌套 profile 中的 `config.yaml` / `.env` 同步到真实根 profile
5. 若 `.env` 内 `GRIX_API_KEY` 已是遮掩值（如 `ak_***` / `***` / hint 形式），先对目标 agent 做 key rotate，再写回根 profile `.env`
6. `hermes --profile <name> gateway restart`，并以日志中的 `Connecting to grix...`、`[Grix] Connected to ...`、`✓ grix connected` 验收

详细现场记录见：
- `references/profile-home-mismatch-gateway-false-failure.md`

### create_new 后 profile 路径漂移、gateway 假失败与验收脚本假通过（新）

又确认了一组真实现场坑，三者可能连续出现：

1. `bind` 步在 state 里记录的 `profile_dir` 落在“当前 profile 的子目录”里，例如：
   - `~/.hermes/profiles/grix-online/profiles/fenda`
2. 但真实 Hermes `profile show fenda` 解析到的 live profile 却是：
   - `~/.hermes/profiles/fenda`
3. 结果是：创建链把 `.env` / `config.yaml` 写进了嵌套错目录，真正运行的 live profile 反而没有 Grix 配置，于是 gateway 日志先出现：
   - `No messaging platforms enabled.`

这类场景下，不要仅根据 state 里的 `bind.profile_dir` 判定“本地绑定已完成可用”；必须额外核对：

- `hermes --profile <name> profile show <name>` 返回的真实 profile 路径
- 该 live profile 下是否真的存在：
  ```yaml
  channels:
    grix:
      wsUrl: <API_ENDPOINT>
  ```
- 以及 live profile `.env` 是否真的包含可用的 `GRIX_ENDPOINT` / `GRIX_AGENT_ID` / `GRIX_API_KEY`

如果 state 路径与 live profile 路径不一致，应以 **live profile** 为准修复配置，不要只修错写进去的嵌套目录。

同时又确认：`start_gateway.js` 在 macOS launchd 场景可能出现 **状态检测假失败**：

- `bootstrap` 在 `step=gateway` 报：
  - `Hermes gateway did not report a running state after startup`
- 但 `gateway status` 只是返回 launchd plist / PID 元数据，没有显式 `running` 字样
- 实际 gateway 日志随后已经出现：
  - `Connecting to grix...`
  - `[Grix] Connected to ...`
  - `✓ grix connected`
  - `Gateway running with 1 platform(s)`

因此，对这类报错应判定为：
- **`start_gateway.js` 的 status string matcher 假红**，
- 而不是真正的 gateway 启动失败。

现场处理顺序应改为：
1. 先看 gateway 日志是否已真实连上 Grix
2. 若日志已连上，则继续后续可用性检查，不要被 `step=gateway` 误导停住
3. 若同时存在 profile 路径漂移，先修 live profile，再重启 gateway

另外，这轮还确认 `grix-egg/scripts/verify_acceptance.js` 目前不能作为权威验收：

- 它只是在整段 `message_history` JSON 文本里查 `expectedSubstring`
- 不校验 `sender_id`
- 不校验命中的消息是否晚于 probe

因此，如果 probe 自己就包含 `expectedSubstring`，脚本会 **假通过**。

对真正的验收，必须满足三条件：
1. 命中消息的发送者是目标 agent
2. 内容包含 `expectedSubstring`
3. 消息晚于 probe（优先比 `msg_id`，拿不到再比时间）

必要时应直接复用 `bootstrap.ts` 里的严格验收逻辑，或手工按上面三条复核；不要仅凭 `verify_acceptance.js` 的 `ok=true` 宣布通过。

针对“普通用户让我直接创建一个 agent”这类任务，还要补一条：

- 创建完成并上线后，不能把新 agent 默认锁成只允许发起人一个人访问，否则会干扰群聊验收与代测
- 验收阶段优先保证 agent 可被实际测试：
  - 优先使用 `GRIX_ALLOW_ALL_USERS=true`，或
  - 至少不要只把 `GRIX_ALLOWED_USERS` 写成发起人个人 user id
- 只有当用户明确要求收紧访问范围，或验收完成后再做权限收口时，才改成精确 allowlist

这轮真实现象里，如果把 `.env` 直接写成仅允许单一用户，会让“别人代测 / 群里验收 / 多账号探针”都变得不可靠，容易把权限问题误判成 agent 不回复。

因此对普通用户交付，验收前至少确认其一：
- `GRIX_ALLOW_ALL_USERS=true`，或
- `GRIX_ALLOWED_USERS` 已按测试方案显式配置为覆盖实际验收参与者，而不是只写发起人一个 id

### 手工修 `.env` 时不要把脱敏值写回（新）)

这轮又确认一个高风险坑：

- `read_file` / 对外展示里的 `.env` 可能把 `GRIX_API_KEY` 显示成脱敏形式（如 `***`、`ak_205...xxxx`）
- 如果直接拿这个展示值去 `patch` 原文件，相当于把真实 key 覆盖成假值
- 结果重启后会报：
  - `grix auth failed: code=10001 msg=auth failed`

处理原则：

1. 修改 `.env` 里访问控制项（如 `GRIX_ALLOWED_USERS` / `GRIX_ALLOW_ALL_USERS`）前，先意识到工具展示的 `GRIX_API_KEY` 可能已脱敏
2. 不要用脱敏展示文本做整段替换，避免把真实 key 一起覆盖掉
3. 更安全的做法：
   - 只做最小行级修改；或
   - 修改后立刻用脚本/二进制方式校验落盘的 `GRIX_API_KEY` 不是 `***` / `...` 掩码；或
   - 一旦怀疑已覆盖，立刻对目标 agent 做 key rotate 并回写 `.env`
4. 重启前至少确认：
   - `GRIX_API_KEY` 落盘是真值
   - `GRIX_ALLOW_ALL_USERS=true` 或 `GRIX_ALLOWED_USERS` 符合当前验收方案

### 手工补做群验收后的收口动作（新）

如果 bootstrap 初始 state 里 `gateway` 假失败、`accept` 仍是 `pending`，但你后来已经手工修好 profile、放通访问控制，并在测试群里验证了目标 agent 真正回复，则后续不要只口头宣布通过；还要做这两个收口动作：

1. 向测试群补发一条明确结果消息，例如：
   - `群测试通过：<AGENT_NAME> 已完成当前群回复验证。`
2. 回填 state file，把这次人工复核的最终状态补齐：
   - 顶层 `updated_at` / `completed_at`
   - `steps.gateway.status=done`，并记录最小验证信号（如 `✓ grix connected`）
   - `steps.accept.status=done`
   - `steps.accept.result` 至少记录：
     - `session_id`
     - `probe_msg_id`
     - `reply_msg_id`
     - `reply_sender_id`
     - `reply_content`

这样后续再看 install state，就不会停留在“gateway failed / accept pending”的假失败状态。

详细现场记录见：
- `references/manual-acceptance-closeout.md`

### 面向该用户的创建类交付风格（新）

当用户只是要求“创建一个 agent”时：

- 默认直接执行，不做执行前确认
- 成功后只简短回报结果（名称 / profile / agent_id 或等价最小结果）
- 除非失败或用户追问，否则不要主动展开技术细节、预检过程、脚本路径或中间状态

仅在真实失败、存在副作用分叉、或用户明确要求解释时，再补充技术说明。

## 第二步：本地绑定


拿到远端凭证后，调用本地脚本完成 profile 创建、凭证写入和 gateway 启动。

### create_new：让 bootstrap 按当前语义创建

`create_new` 现在的语义是：优先复用宿主 Grix live bridge；如果没有可复用宿主会话、但已经通过 `grix-register login/register` 现场拿到 access token，则允许走 HTTP fallback；如果已经 detect 到 `host`，但 host create 返回 `unsupported cmd for hermes`，则保持 host 语义并直出该能力缺口，而不是因为顺手传了 `--access-token` 就静默切路。只有两条链路都不可用时，才直接失败并暴露阻塞点。

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --json
```

如果你已经拿到了远端 agent 的完整凭证（`agent_id` / `api_endpoint` / `api_key`），优先直接用 `--route existing`。只有在“没有可复用 host 会话，但已通过 `grix-register login/register` 拿到 access token”这类场景下，才应给 `create_new` 传 `--access-token` 走 HTTP fallback。

### existing bind 的现场排障顺序（新）

当用户要求“接管一个已存在 agent 并让它在 Grix 上线”时，优先按下面顺序排障，而不是直接假设只差一条绑定命令：

1. 先确认远端 agent 已存在
2. 若只有 `agent_id`，先轮换 key，拿到新的明文 `api_key`
3. 在 `bind_local` 前验证 `install_dir` 是否真的是有效 bundle
4. 若默认 bundle 结构残缺，直接从当前源码树导出一个临时 bundle 再绑定
5. 中文 agent 名必须显式给 ASCII-safe `--profile-name`
6. 先跑 `bind_local --dry-run --json`，确认 profile 路径、env 路径、install_dir、management_policy 都正确
7. 正式绑定完成后，必须检查生成出来的 profile `config.yaml` 是否真的包含：
   ```yaml
   channels:
     grix:
       wsUrl: <API_ENDPOINT>
   ```
   如果没有这段，gateway 虽然可能会启动，但日志会出现 `No messaging platforms enabled.`，远端 Grix agent 也会保持离线。
8. 同时检查 profile `.env` 是否包含可用的 `GRIX_API_KEY` 真值；如果 `.env` 里落盘成了 `ak_***` / `***` 这类遮掩值，真实启动会在连接 Grix 时出现 `grix auth failed: code=10001 msg=auth failed`。
9. 若补齐 `channels.grix.wsUrl` 或修正 `.env` 后，需要重启该 profile 的 gateway，再以日志中的 `Connected to ...` / `✓ grix connected` 作为上线验证。

详细现场模式见：
- `references/existing-bind-bundle-validation-and-key-rotate-fallback.md`
- `references/created-agent-offline-missing-channel-or-masked-key.md`


如果用户给的是“已存在 agent 的 id”，但没有提供明文 `api_key`，不要尝试从脱敏输出或旧 checkpoint 里恢复 key。当前推荐路径是：

1. 先用 `grix-key-rotate` 或等价的 admin invoke 对该 `agent_id` 轮换密钥
2. 取得新的明文 `api_key`
3. 再继续执行 `--route existing`

也就是说，`existing` 场景里“只有 agent_id”并不等于“已经有可绑定凭证”；通常还需要一次 key rotate 才能拿到新的明文 key。

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --agent-id <AGENT_ID> \
  --api-endpoint <API_ENDPOINT> \
  --api-key <API_KEY> \
  --json
```

带人格内容：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --agent-id <AGENT_ID> \
  --api-endpoint <API_ENDPOINT> \
  --api-key <API_KEY> \
  --soul-content "人格文本内容" \
  --json
```

已有凭证绑定（跳过创建步骤）：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route existing \
  --bind-json <BIND_JSON_FILE> \
  --json
```

脚本完成的本地操作：
1. 安装 `grix-hermes` 技能包
2. 创建本地 Hermes profile
   - 重要更新：当前 `bind_local.js` 新建 profile 时已不再默认执行 `hermes profile create <name> --clone`，而是直接创建空白 profile。
   - 创建后脚本会显式清空 `SOUL.md`、`memories/USER.md`、`memories/MEMORY.md`，避免继承当前 active profile 的身份、人设、用户称呼和长期记忆。
   - 因此“创建空白 agent / 接管后保持空白身份”现在可以直接走默认 create 路径，不必先手工建空 profile 再 `--profile-mode reuse`。
   - `--clone-from` 仍只应用于你明确想继承某个干净源 profile 的场景。
3. 写入 `.env` 绑定凭证并继承 LLM provider key
   - 重要澄清：profile `.env` 中写入的 `GRIX_API_KEY` 必须保留真实值，供 gateway/agent 运行时使用；不要把落盘 `.env` 改成 `ak_***` 或 `***`。
   - 只有对外输出（`--json` 结果、stdout/stderr、checkpoint/plan 展示）需要做脱敏；测试也应分别断言“落盘是真值、输出是脱敏值”。
4. 写入 `SOUL.md`（如提供）
5. 启动 Hermes gateway

## 第三步：验收测试（可选）

gateway 启动后，可通过 bootstrap 内置验收参数自动完成：建群、发探针、轮询消息历史、按目标 agent + 探针后消息判定是否通过。

推荐直接让脚本执行：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --probe-message "<PROBE_MESSAGE>" \
  --expected-substring "<EXPECTED_SUBSTRING>" \
  --member-ids <OPTIONAL_USER_IDS> \
  --member-types <OPTIONAL_USER_TYPES> \
  --status-target <OPTIONAL_STATUS_SESSION> \
  --json
```

验收判定规则：

- 必须是目标 agent 发出的消息
- 必须包含 `--expected-substring`
- 必须晚于 probe：优先比较 message id；拿不到可比较 id 时，再退回比较消息时间
- 旧消息命中或其他 sender 命中都不能算通过

**卡片和探针不要混用目标：**
- 卡片发 `status_target`
- probe 发测试群 `session_id`

下面这些 `grix_invoke` 例子仍适用于手工排障或理解底层动作：

```
grix_invoke(action="group_create", params={"name": "验收测试-<AGENT_NAME>", "member_ids": ["<TARGET_AGENT_ID>"], "member_types": [2]})
```

返回 `session_id`。

**发送探针消息：**

```
grix_invoke(action="send_msg", params={"session_id": "<SESSION_ID>", "content": "<PROBE_MESSAGE>"})
```

**轮询验证回复：**

```
grix_invoke(action="message_history", params={"session_id": "<SESSION_ID>", "limit": 10})
```

在消息历史中查找目标 agent 的回复，检查是否包含预期内容。

**发送状态卡片（可选）：**

如果需要向发起者报告孵化状态，用卡片链接格式：

`[安装状态](grix://card/egg_install_status?install_id=<ID>&status=running&step=installing&summary=开始安装)`

```
grix_invoke(action="send_msg", params={"session_id": "<STATUS_SESSION_ID>", "content": "[安装状态](grix://card/egg_install_status?...)"})
```

## 脚本参数

| 参数 | 说明 |
|------|------|
| `--install-id` | 安装实例 ID。可生成 `egg-` 加 8 位随机 hex |
| `--agent-name` | Agent 名称；默认也作为 profile 名 |
| `--access-token` | 用于独立 HTTP 工具链；通常应先通过 `grix-register login/register` 现场获取，再在 `create_new` 的 HTTP fallback 中传入 |
| `--status-target` | 接收安装状态卡片的会话 |
| `--probe-message` | 验收探针消息；提供后启用验收 |
| `--expected-substring` | 目标 agent 回复中必须包含的子串 |
| `--member-ids` | 验收群附加成员 ID，逗号分隔；脚本会自动补入目标 agent |
| `--member-types` | 与 `--member-ids` 一一对应；省略时默认用户为 `1`，目标 agent 为 `2` |
| `--accept-timeout-seconds` | 验收超时，默认 `15` |
| `--accept-poll-interval-seconds` | 验收轮询间隔，默认 `1` |
| `--api-endpoint` | 已有 agent WS endpoint |
| `--api-key` | 已有 agent API key |
| `--bind-json` | 凭证 JSON 文件路径 |
| `--resume` | 使用相同 `--install-id` 继续 checkpoint |
| `--dry-run` | 输出计划 |

## 成功输出

```json
{
  "ok": true,
  "install_id": "...",
  "agent_name": "...",
  "profile_name": "...",
  "route": "create_new",
  "steps": {
    "detect": { "status": "done" },
    "install": { "status": "done" },
    "create": { "status": "done" },
    "bind": { "status": "done" },
    "soul": { "status": "skipped" },
    "gateway": { "status": "done" },
    "accept": { "status": "skipped" }
  }
}
```

## 失败输出

```json
{
  "ok": false,
  "step": "bind",
  "step_number": 2,
  "reason": "具体错误信息",
  "suggestion": "修复建议",
  "state_file": "~/.hermes/tmp/grix-egg-xxx.json",
  "resume_command": "node scripts/bootstrap.js --install-id xxx --agent-name 'X' --resume --json"
}
```

## 空蛋孵化

最小输入只需要 `--install-id` 和 `--agent-name`，但需要先通过 `grix_invoke` 创建远端 agent 拿到凭证，再传给脚本。

### 真实空蛋孵化前的运行时预检

如果用户要求“真实跑一次空 agent 孵化”，不要因为 `npm test` 全绿就默认 bootstrap 运行链可用。当前测试可以通过 fake node stub 掉外部脚本，但真实执行仍可能在运行时找不到脚本文件。

先做两层预检：

1. **能力预检：不要把 WS 凭证存在误判成 admin create 可用**
   - 先试一条最小 admin invoke，例如：
   ```bash
   grix_invoke(action="agent_category_list", params={})
   ```
   - 如果返回 `unsupported cmd for hermes`，说明当前会话不支持原生 admin invoke。
   - 此时即使 `GRIX_ENDPOINT` / `GRIX_AGENT_ID` / `GRIX_API_KEY` 存在，bootstrap 的 `detect` 仍可能判成 `path=host`；这只能说明“有可复用宿主会话凭证”，**不能证明** host create 路径在当前运行时真的可用。

2. **脚本链预检：确认 bootstrap 依赖的外部脚本真的存在**
   - 真实 `create_new` / `accept` 链至少会用到：
     - `grix-admin/scripts/admin.js`
     - `grix-group/scripts/group.js`
     - `grix-query/scripts/query.js`
     - `message-send/scripts/send.js`
     - `grix-egg/scripts/bind_local.js`
     - `grix-egg/scripts/start_gateway.js`
     - `grix-register/scripts/create_api_agent_and_bind.js`
   - 在源码仓库里可先检查：
   ```bash
   find grix-admin grix-group grix-query message-send grix-egg grix-register -path '*/scripts/*.js' | sort
   ```
   - 对真实 bootstrap 安装产物，也要检查 `--install-dir` 或默认 bundle 下是否包含预期脚本，不要只看 `SKILL.md` 和 `agents/openai.yaml`。

已验证的真实故障模式：

- `bootstrap.js` 的 `detect` 步骤判定 `path=host`
- `install` 步骤成功
- `create` 步骤失败，报错类似：
  - `Cannot find module '/.../grix-admin/scripts/admin.js'`

这说明问题不在远端认证，而在 **bootstrap 运行时脚本编排链缺失**。此时应先修运行时依赖链，再继续真实孵化验收。

### 源码模式与编译安装模式同时支持的修复原则

如果用户明确要求：**源码目录直接运行要可用，同时 npm/编译安装后也要可用**，优先采用“共享逻辑 + 极薄 shim”的结构，而不是把 bootstrap 改成只兼容其中一种布局。

已验证有效的做法：

1. 把真实逻辑继续集中在 `shared/cli/` 这类共享模块
2. 在各技能下补齐运行时脚本入口（thin shim），例如：
   - `grix-admin/scripts/admin.ts`
   - `grix-group/scripts/group.ts`
   - `grix-query/scripts/query.ts`
   - `message-send/scripts/send.ts`
   - `message-unsend/scripts/unsend.ts`
3. 每个 shim 只做一件事：导入共享 wrapper，并声明自己对应的 action kind
4. 重新 build，确认源码树生成对应 `.js`
5. 再用 `npm pack --dry-run` 检查这些 `.js` 是否被真正打进发布包

这样可以同时满足：

- **源码模式**：仓库内直接 `node .../scripts/*.js` 可执行
- **编译/安装模式**：npm 包里也会带上同名 `scripts/*.js`

不要把问题收敛成“源码模式走不通就只能发 npm”。如果 bootstrap 依赖的是固定脚本路径，那么更稳妥的修法通常是：**把这些路径在源码树和发布产物里都补齐**。

### 绑定链路参数透传与源码 checkout installDir（新）

这轮又确认了一个真实坑：`bootstrap.ts` 即使已经拿到远端凭证，如果在调用 `bind_local.js` 时没有把下面这些绑定期语义继续透传下去，最终 profile 仍可能表现为“能创建、但默认不可用”或“权限/归属不对”：

- `--account-id`
- `--allowed-users`
- `--allow-all-users`
- `--home-channel`
- `--home-channel-name`

修复原则应是：

1. `stepCreateHttp()` 走 HTTP create-and-bind 时，这些参数要直接透传给 `create_api_agent_and_bind.js`
2. `stepBind()` 走 host/existing bind 时，也要继续传给 `bind_local.js`
3. 如果是 host 路径且用户没显式给 `--allowed-users`，可默认回落到当前宿主 `GRIX_AGENT_ID`
4. 若既没有 `allowed_users` 也没有显式限制用户，默认应允许 `--allow-all-users true`，避免新 profile 因默认访问控制而表现为“已绑定但不可用”

同时，`bind_local.ts` 对 `--install-dir` 的校验不能只按“git checkout 一律拒绝”处理。正确语义应是：

- 若 `installDir` 是 git checkout，**但本身已包含可用的 grix-hermes bundle 结构**，则允许直接绑定
- 只有当它是源码 checkout 且缺少运行时所需 bundle 入口时，才应报错要求改用发布包或先导出 bundle

另外，`patch_profile_config.ts` 在绑定时应把当前 agent 的 `api_endpoint` 同步写入：

```yaml
channels:
  grix:
    wsUrl: <API_ENDPOINT>
```

否则 profile 虽然 `.env` 已有 `GRIX_*`，Hermes 启动后仍可能出现 `No messaging platforms enabled.`，表现为 agent 离线。

### 这类修复的回归测试点（新）

补测试时至少覆盖：

1. host create 返回 `createdAgent` 包装结构时，`bootstrap` 能正确提取 `id/api_endpoint/api_key`
2. `bind_local` 接受“带 `.git` 的源码 checkout installDir”，前提是该目录已具备可用 bundle 结构
3. 绑定后 `config.yaml` 包含：
   ```yaml
   channels:
     grix:
       wsUrl: <API_ENDPOINT>
   ```
4. 绑定时传入 `--allow-all-users true` 后，profile `.env` 中能看到 `GRIX_ALLOW_ALL_USERS=true`

- `references/bind-chain-createdagent-and-source-checkout.md`：记录 `createdAgent` 包装误判、bind 参数透传遗漏、源码 checkout installDir 兼容、以及缺少 `channels.grix.wsUrl` 导致离线的组合问题

### create_new 失败后的二次分流检查（新）

当用户明确要求“现在就创建一个空 agent”，且你已经实际执行过一次 `bootstrap.js` 或等价创建链路后，不要只停留在“host 路径失败”这一层结论；还要立刻补做下面两项二次分流检查，并把结果一起汇报：

1. **源码树 install 步是否先坏掉**
   - 真实现象可能是：
     - `step=install`
     - `ENOENT: no such file or directory, lstat '/.../grix-admin'`
   - 这属于 **source tree / install bundle 布局问题**，和远端 create capability 不是同一个层级。
   - 结论应写成：
     - `bootstrap` 甚至还没进入 create，就先在 install 步失败；
     - 这不能被误报成“只是 Grix admin 不支持”。

2. **HTTP fallback 事实上是否可用**
   - 即使用户或运行摘要里看起来“曾经有 token”，也要再做一次真实校验：
     - 当前进程环境里是否有 `GRIX_ACCESS_TOKEN`
     - `~/.hermes/.env`
     - `~/.hermes/profiles/<profile>/.env`
   - 如果这些地方都没有有效 token，就应明确汇报：
     - host/create_new 路径失败；
     - HTTP create-api-agent 也因为缺少 `GRIX_ACCESS_TOKEN` 目前不可走；
     - 所以当前阻塞是“两条创建路都不通”，而不是单一路径问题。

这一步的价值是防止把问题错误收敛成：
- “只差一个 access token”
- 或“只是宿主 bridge 有问题”

正确汇报应把三层问题拆开：
- install 布局是否已阻塞
- host admin/create capability 是否已阻塞
- HTTP fallback 所需 `GRIX_ACCESS_TOKEN` 是否真实存在

### 修完脚本缺失后，下一层失败的判读

如果补齐 `scripts/*.js` 后，`MODULE_NOT_FOUND` 消失，但真实空蛋孵化仍在 `create` 阶段报：

- `grix error: code=4004 msg=unsupported cmd for hermes`

则应明确判定为：

- 本地源码/安装包脚本链问题已经修复
- 当前剩余阻塞点是 **宿主 Hermes/Grix 运行时并未暴露 host/admin create 能力**
- 这已经不是“源码模式 vs npm 模式”的差异，而是运行时 capability 边界

此时应把后续动作转向：

1. capability probe
2. 运行时/adapter 协议排查
3. 或显式 HTTP fallback / existing bind

- 测试文件通过 fake node / stub 拦截 `admin.js`、`group.js`、`send.js`、`query.js`
- 真实源码树或安装 bundle 中并没有这些脚本
- 真实执行在 `step=create` 或 `step=accept` 报 `MODULE_NOT_FOUND`

这类情况下应明确给出结论：

- 单元/集成测试覆盖的是“脚本调用契约”
- 但真实运行时依赖未完整落盘
- 问题属于“真实编排链断裂”，不是简单的凭证、网络、或 admin capability 故障

## 维护工具

### 继续处理“上次 grix-egg 测试失败”时的先验检查

如果用户只说“继续查 grix-egg / tests”，不要直接假设之前那批构建错误仍然存在。先做最小核实，再决定是否需要修代码。

推荐顺序：

```bash
git status --short
git log --oneline -5
npm test -- --test-name-pattern=grix-egg
npm pack --dry-run
```

判读要点：

- 如果 `npm test -- --test-name-pattern=grix-egg` 和 `npm pack --dry-run` 已经全绿，优先判断为“当前源码树与发布产物已对齐”，不要重复按旧报错方向继续改。
- 对这类仓库，`grix-egg/scripts/bootstrap.ts` 的问题经常和 `shared/cli/*.ts` 源文件是否完整一起出现；若最近提交已经恢复这些文件，就先把“当前是否仍失败”查实。
- 当前已验证的一类修复信号是：最近提交同时恢复/修改了
  - `shared/cli/actions.ts`
  - `shared/cli/aibot-client.ts`
  - `shared/cli/config.ts`
  - `shared/cli/targets.ts`
  - `grix-egg/scripts/bootstrap.ts`
- 只有在复测仍失败时，才继续按具体报错做根因分析。

### shared/cli 源文件完整性检查


`bootstrap.ts` 当前会 import `../../shared/cli/config.js`、`card-links.js` 等 JS 路径，但 TypeScript 构建阶段仍依赖同目录下对应的 `.ts` 源文件参与编译与类型检查。

已验证的坑：

- 如果误删 `shared/cli/actions.ts`
- `shared/cli/aibot-client.ts`
- `shared/cli/config.ts`
- `shared/cli/targets.ts`

即使运行时目录里还残留 `.js`，`npm test` / `tsc` 仍可能失败，报错类似：

- `Could not find a declaration file for module '../../shared/cli/config.js'`
- 或 shared/cli 相关模块隐式 `any`

因此，修复或重构 `grix-egg/bootstrap.ts` 时：

1. 不要把这些 `shared/cli/*.ts` 当成可随手清理的调试残留
2. 若从历史提交恢复它们用于通过构建，应一并纳入最终提交
3. 提交前必须重新跑 `npm test`，确认不仅 grix-egg 子测试通过，而且全仓 `tsc` 也通过

### 重要更新：先区分“宿主 live bridge 已存在”与“grix-egg 还没完全收口”

最新代码审查确认：

- hermes-agent 侧已经具备可复用的宿主 Grix live bridge 基础能力，不是“完全没有桥”
  - `tools/grix_invoke_tool.py` 已提供统一 `grix_invoke`
  - `gateway/platforms/grix.py` 已实现 `adapter.agent_invoke(...)`
  - send / edit / delete / typing 也都已经走 live adapter
- 因此，`grix-egg` 当前真正缺的通常不是“底层没有 host bridge”，而是：
  1. `bootstrap.ts` 还残留旧的 HTTP fallback / access-token 心智模型
  2. 状态文件 path 语义没有完全统一
  3. 测试仍在验证旧 fallback，而不是验证“host 优先、existing 兜底”

这类场景下，正确动作顺序是：

1. 先承认 hermes-agent live bridge 已经存在
2. 再检查 `grix-egg` 是否还在把 `create_new` 的主路径写成 `ws/http` 旧模型
3. 优先收口测试与状态语义，不要继续把“缺 access token”当根因

### 当前已确认的状态语义坑（新）

`bootstrap.ts` 里常见一个假一致问题：

- `stepDetect()` 发现宿主可复用能力时，把 `steps.detect.result.path` 记为 `host`
- 但 `stepCreateWs()` 成功后，`steps.create.result.path` 仍可能写成旧名字 `ws`

这会导致 checkpoint / state file 语义不一致：

- detect 说当前走的是 host/live bridge
- create 却回写成旧名字 `ws`

后续排查和测试断言会因此摇摆。修复时应统一：

- 如果 `create_new` 的主路径是复用宿主 live bridge，就在 detect/create 两处都使用同一语义（通常保持 `host`）
- 不要出现 detect=host、create=ws 的混写
- 顶层 state/output 最好同时暴露统一的 `path` 字段，便于 checkpoint 与黑盒测试直接断言
- 当宿主 create capability 失败（例如 `unsupported cmd for hermes`）时，若 detect 已判定为 `host`，则应保持 `state.path = "host"`；此时 create 步骤应标记 failed，测试不应再假定 `steps.create.result.path` 一定存在

### bind_local 新布局 bundle 回归点（新）

除了兼容性校验逻辑本身外，测试也应显式覆盖新布局：

- `bin/grix-hermes.js`
- `lib/manifest.js`
- `shared/cli/skill-wrapper.js`
- `grix-admin/SKILL.md`
- `grix-egg/SKILL.md`

也就是说，不要只保留旧的 `shared/cli/grix-hermes.js` 测试桩；否则真实代码已经兼容新 wrapper，但回归测试仍可能漏掉新布局。

- `references/hermes-host-admin-capability-mismatch.md`：记录 `unsupported cmd for hermes` 下更精确的根因分层——优先怀疑 host_type / capability 代际不一致或服务端未对 hermes 开放 admin/create，而不是先把问题收敛成缺 `GRIX_ACCESS_TOKEN`

- `references/create-new-failure-triage.md`：真实创建请求下，如何把 install 布局失败、host capability 缺口、HTTP token 缺失这三层阻塞拆开判读

## 相关参考

- `references/host-live-bridge-state-alignment.md`：记录这轮 host-path / 测试 contract 收口前的审查结论，以及后来如何统一到当前实现

## 相关参考

- `references/create-new-host-first-http-login-fallback.md`：本轮收口后的精确语义——detect 可落到 `host` 或 `http`；HTTP fallback 需要先经 `grix-register login/register` 现场取 token；若已 detect=host 且 host create 返回 `unsupported cmd for hermes`，则保持 host 失败语义，不静默切 HTTP

- `references/ws-fallback-and-bundle-compat.md`：记录旧讨论里关于 WS create / fallback / bundle 兼容性的历史背景；若与当前 `bootstrap.ts` / tests 不一致，以当前 host-first、失败直出能力缺口的实现与测试为准

- `references/bootstrap-script-orchestration.md`：这次关于脚本编排回退、shared/cli 文件恢复、以及跨仓库影响面的记录

- `references/host-create-vs-http-fallback.md`：说明为什么“补一个 access token 就能继续”的旧心智模型会把当前 `create_new` 语义说错

- `references/chinese-agent-name-and-source-vs-bundle.md`：记录中文显示名、ASCII-safe profile 名，以及源码树/安装 bundle 分开判读的真实会话结论
- `references/install-symlink-and-duplicate-name.md`：记录 install 目标经 symlink 指向源码树时应 no-op，以及 create_new 前进到“同名 Agent 已存在”后的正确分流

- `references/blank-profile-clone-contamination.md`：记录 bind_local 曾因默认 `--clone` 污染新 profile 身份/记忆的根因、修复方式与验证探针
- `references/existing-bind-bundle-validation-and-key-rotate-fallback.md`：记录 existing bind 场景下，先验证 bundle 结构、必要时导出临时 bundle、修 key-rotate 包装层不一致、以及 `start_gateway.js` 假失败的判读方法
- `references/existing-agent-id-needs-key-rotate.md`：已有 agent 只有 `agent_id`、缺少明文 `api_key` 时，先轮换 key 再做 existing bind

- `../grix-key-rotate/SKILL.md`：已有 agent 只有 `agent_id`、缺少明文 `api_key` 时，先轮换 key 再做 existing bind

- `bind_local.js`：本地 Hermes profile 绑定 helper
- `patch_profile_config.js`：profile `config.yaml` 技能目录配置 helper
