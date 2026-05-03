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

当前 `bootstrap.js` 现在应收敛为两类语义：

- `--route create_new`：要求复用宿主 Hermes/Grix live bridge 完成远端创建
- `--route existing`：跳过创建，直接绑定已有凭证

其中 `create_new` 的设计目标是：**宿主 Grix 能力优先，不再把 `access_token` / HTTP create-and-bind 视为主路径依赖**。
## 第一步：创建远端 Agent

默认设计里，空蛋孵化的首选路径是：**复用当前 Grix WebSocket 通道完成远端创建**。也就是说：

- 如果当前 Hermes→Grix 连接已经具备可用的 WS admin create 能力，**不需要 `access_token`**
- `access_token` 只是 **HTTP fallback**，仅在当前运行时不能通过 WS admin create 时才需要

### 重要澄清：`WS 已连上` 不等于 `当前 bootstrap 一定能成功走 WS create`

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

- 当前会话是否具备 admin invoke 能力，或
- 当前 bootstrap 所依赖的 WS 脚本链是否完整可用

只有在 **WS create 路径不可用** 时，才需要退回到 `access_token` 的 HTTP fallback。

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

- 首选方案本来仍然应该是复用 WS 通道
- 只是当前运行时/实现没有把可用的 admin create 能力暴露出来，或者 bootstrap 的 WS 脚本链不完整

在这个前提下，再改走以下其一：

1. **HTTP fallback**：改用 `grix-register` 路径，需要 `access_token`
2. **已有凭证绑定**：让上游提供 `agent_id` / `api_endpoint` / `api_key`，然后走 `--route existing`
3. **环境排查**：检查当前 Hermes gateway / Grix adapter 的 capability 协商是否真的暴露了 admin invoke
4. **脚本链排查**：确认 bootstrap 依赖的 `scripts/*.js` 在源码树/安装包里真实存在

### WS admin create 路径

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

### 已实现的自动回退行为（新）

当 `detect` 判定当前路径是 `ws`，但真实执行 `create_grix` 时返回类似：

- `grix error: code=4004 msg=unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd for hermes`

且命令行同时提供了 `--access-token`，当前 `bootstrap.js` 应自动执行：

1. 将当前创建路径从 `ws` 回退到 `http`
2. 记录 checkpoint：
   - `steps.detect.result.path = "http"`
   - `steps.detect.result.ws_admin_fallback = "unsupported cmd for hermes"`
3. 继续走 HTTP create-and-bind

这意味着：

- `WS 已连上` 仍然是首选探测结果
- 但如果宿主运行时不支持 WS admin create，**不需要人工重跑另一条命令**；只要给了 `--access-token`，bootstrap 应自行切到 HTTP
- 如果没有 `--access-token`，才应把失败报告给用户，并建议补 token 或改走 `--route existing`

### 真实复验时的注意点（新）

当前环境里如果要做“真实 HTTP fallback 链路 smoke test”，不要假设 `~/.hermes/.env` 一定有 `GRIX_ACCESS_TOKEN`。先检查；如果缺失，则：

- 代码层面的 fallback 可通过测试验证
- 但真实线上复验仍会卡在“没有可用 HTTP fallback 凭证”这一层

因此汇报时要明确区分：

1. **代码是否已支持自动回退**
2. **当前环境是否真的具备跑通 HTTP fallback 的 access token**

不要把“环境里没有 token”误报成“fallback 代码仍未实现”。

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

## 第二步：本地绑定

拿到远端凭证后，调用本地脚本完成 profile 创建、凭证写入和 gateway 启动。

### create_new：让 bootstrap 自行判路创建

优先 WS，缺 WS 时可显式提供 `--access-token` 走 HTTP：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --json
```

HTTP fallback：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --route create_new \
  --access-token <ACCESS_TOKEN> \
  --json
```

### existing：绑定已有凭证

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
3. 写入 `.env` 绑定凭证并继承 LLM provider key
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
| `--access-token` | 当未检测到 WS 凭证时，走 HTTP create-and-bind |
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
   - 此时即使 `GRIX_ENDPOINT` / `GRIX_AGENT_ID` / `GRIX_API_KEY` 存在，bootstrap 的 `detect` 仍可能判成 `path=ws`；这只能说明“有 WS 凭证”，**不能证明** WS create 路径在当前运行时真的可用。

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

- `bootstrap.js` 的 `detect` 步骤判定 `path=ws`
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

### 修完脚本缺失后，下一层失败的判读

如果补齐 `scripts/*.js` 后，`MODULE_NOT_FOUND` 消失，但真实空蛋孵化仍在 `create` 阶段报：

- `grix error: code=4004 msg=unsupported cmd for hermes`

则应明确判定为：

- 本地源码/安装包脚本链问题已经修复
- 当前剩余阻塞点是 **宿主 Hermes/Grix 运行时并未暴露 WS admin create 能力**
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
npm test
npm run typecheck
```

判读要点：

- 如果 `npm test` 和 `npm run typecheck` 已经全绿，优先判断为“问题已被最近提交修复”，不要重复按旧报错方向继续改。
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

## 相关参考

- `references/host-live-bridge-state-alignment.md`：记录“hermes-agent 宿主 live bridge 已存在，但 grix-egg 仍需统一 state path 与测试 contract”的审查结论

## 相关参考

- `references/ws-fallback-and-bundle-compat.md`：记录 WS create 遇到 `unsupported cmd for hermes` 时的自动 HTTP fallback、真实验真对 `GRIX_ACCESS_TOKEN` 的依赖，以及 bind_local 对新旧 shared CLI bundle 布局的兼容要求

- `references/bootstrap-script-orchestration.md`：这次关于脚本编排回退、shared/cli 文件恢复、以及跨仓库影响面的记录

- `bind_local.js`：本地 Hermes profile 绑定 helper
- `patch_profile_config.js`：profile `config.yaml` 技能目录配置 helper
