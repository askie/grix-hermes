---
name: grix-egg
description: 在 Grix 安装私聊里处理 Hermes 侧安装工作流时使用。适用于收到 `install_id`、`egg/install`、`main_agent`、`install.route` 等上下文后，按 Hermes 路线完成 agent 创建或覆盖、包落位、绑定、回报进度、拉群验收，并在身份不正确时继续修复。
---

# Grix Egg

这是 Hermes 安装总编排技能。

开始前，先用 helper 校验安装上下文：

```bash
node scripts/validate_install_context.js --from-file ./install-context.json
```

真正执行安装闭环时，优先用：

```bash
node scripts/install_flow.js --from-file ./install-context.json --json
```

## install_flow 完整参数

```bash
node scripts/install_flow.js \
  --from-file ./install-context.json \
  --profile-name <PROFILE_NAME> \
  --install-dir ~/.hermes/skills/grix-hermes \
  --hermes-home ~/.hermes \
  --hermes hermes \
  --node node \
  --dry-run \
  --json
```

- `--from-file`：JSON 文件路径（必填，不从 stdin 读）
- `--profile-name`：覆盖 JSON 中的 profile 名称
- `--install-dir`：覆盖默认安装目录 `~/.hermes/skills/grix-hermes`
- `--hermes-home`：覆盖 `HERMES_HOME`（默认 `~/.hermes` 或环境变量）
- `--hermes`：hermes 可执行文件路径（默认 `hermes`）
- `--node`：node 可执行文件路径（默认 `node`）
- `--dry-run`：只输出计划不执行
- `--json`：JSON 格式输出

## JSON Payload 结构

install_flow 接收的 JSON 需要包含：

### 顶层字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `install_id` | 是 | 安装实例 ID |
| `main_agent` | create_new/existing | 主 agent 标识 |
| `route` | 否 | 路由：`create_new` 或 `existing` |
| `install.route` | 否 | 路由也可放在 `install` 子对象内 |
| `profile_name` | 否 | 目标 profile 名称 |
| `is_main` | 否 | 是否主 agent |
| `install_dir` | 否 | 安装目录 |
| `status_target` | 否 | 状态卡片投递目标（session_id） |
| `soul_file` | 否 | SOUL.md 源文件路径 |
| `soul_markdown` | 否 | SOUL.md 直接内容 |

### 路由判断

创建远端 API agent 时，按以下优先级判断走哪条路：

1. payload 显式包含 `grix_register` → 走 HTTP（需要 `access_token`）
2. payload 显式包含 `grix_admin` → 走 WS
3. 都没有 → 自动探测当前环境是否已配置 Grix WS 运行时凭证
   - 有（`GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY`）→ 自动走 `grix_admin`（WS）
   - 没有 → 报错，需要上层提供 `grix_register` + `access_token`

**核心原则：当前执行环境是 Hermes agent 且有 Grix WS 凭证时，永远走 `grix_admin`（WS），不要走 `grix_register`（HTTP）。只有没有 WS 凭证的新环境才需要走 HTTP 注册。**

### 绑定路径

install_flow 根据以下字段决定绑定路径：

**路径 1：grix_register（HTTP 创建）**

```json
{
  "grix_register": {
    "access_token": "...",
    "agent_name": "...",
    "base_url": "https://grix.dhf.pub",
    "avatar_url": "..."
  }
}
```

**路径 2：grix_admin（WS 创建）**

```json
{
  "grix_admin": {
    "agent_name": "...",
    "introduction": "...",
    "category_id": "...",
    "category_name": "...",
    "parent_category_id": "0"
  }
}
```

`category_id` 和 `category_name` 互斥。传 `category_name` 时不存在会自动创建。

**路径 3：直接绑定（已有凭证）**

```json
{
  "bind_hermes": {
    "profile_name": "...",
    "agent_name": "...",
    "agent_id": "...",
    "api_endpoint": "wss://...",
    "api_key": "...",
    "is_main": true
  }
}
```

或

```json
{
  "remote_agent": {
    "profile_name": "...",
    "agent_name": "...",
    "agent_id": "...",
    "api_endpoint": "wss://...",
    "api_key": "..."
  }
}
```

### bind 子对象（可选覆盖）

```json
{
  "bind": {
    "profile_name": "...",
    "profile_mode": "create-or-reuse",
    "clone_from": "...",
    "account_id": "...",
    "allowed_users": "...",
    "allow_all_users": "true",
    "home_channel": "...",
    "home_channel_name": "...",
    "is_main": "true"
  }
}
```

### acceptance 子对象（可选验收）

```json
{
  "acceptance": {
    "group_name": "验收测试群",
    "member_ids": ["1001", "2001"],
    "member_types": ["1", "2"],
    "session_type": "group",
    "probe_message": "你是谁？",
    "expected_substring": "我是",
    "timeout_seconds": "15",
    "poll_interval_seconds": "1",
    "history_limit": "10"
  }
}
```

验收流程（注意区分两个不同的目标）：

1. **创建测试群** — 用 `grix-group` 创建，拿到测试群的 `session_id`
2. **回当前私聊发卡片** — 用 `message-send` 向 `status_target`（当前私聊）发送测试群的会话卡片，方便用户点击进入
3. **在测试群发 probe** — 用 `message-send` 向测试群 `session_id` 发送 probe 消息
4. **轮询测试群消息历史** — 用 `grix-query` 查测试群 `session_id` 的消息历史，检查目标 agent 是否回复了包含 `expected_substring` 的内容

关键：会话卡片发到当前私聊（`status_target`），probe 消息发到测试群（测试群 `session_id`），两者不要混。

## 绝对规则

- 远端 Grix 查询走 [grix-query](../grix-query/SKILL.md)
- 远端群动作走 [grix-group](../grix-group/SKILL.md)
- 远端 agent / 分类动作走 [grix-admin](../grix-admin/SKILL.md)
- 账号注册和首个 API agent 走 [grix-register](../grix-register/SKILL.md)
- 消息卡片优先走 [message-send](../message-send/SKILL.md)
- 本地 agent 机制只走 Hermes `profile`、`.env`、`config.yaml`、`SOUL.md`
- 安装进行中不要手工改随机文件，优先走这组 helper

## 安装状态

开始、成功、失败都应发送独立状态卡。

格式参考：

- [Grix Card Links](../shared/references/grix-card-links.md)
- [Acceptance Checklist](references/acceptance-checklist.md)

需要生成卡片时，优先用：

```bash
node ../message-send/scripts/card-link.js egg-status --install-id <INSTALL_ID> --status running --step downloading --summary 已下载
node ../message-send/scripts/card-link.js conversation --session-id <SESSION_ID> --session-type group --title 验收测试群
```

## 推荐主线

### `create_new`

1. 识别安装包和目标路线
2. 如需新建远端 API agent，当前环境有 WS 凭证时走 `grix-admin create_grix`；没有时走 `grix-register`
3. 创建目标 Hermes profile
4. 下载或落位安装内容
5. 写入或替换目标 profile 的 `SOUL.md`
6. 调用 `grix-admin bind-hermes`
   - 目标就是主 agent 时，显式传 `--is-main true`
   - 其他 agent 默认传 `--is-main false`
   - **必须传 `--inherit-keys global`**，从全局 `.env` 继承 LLM provider 密钥
7. 启动目标 Hermes gateway，并确认 `hermes --profile <name> gateway status` 已经是运行态
8. 如需自动更新，补 `grix-update` 的 Hermes cron
9. 创建测试群并拿到准确 `session_id`
10. 回当前私聊（`status_target`）发送测试群会话卡片
11. 在测试群（`session_id`）发 probe 做身份验收，回答不正确就排查重试

### `existing`

1. 定位目标 Hermes profile
2. 先备份将被覆盖的 `.env`、`config.yaml`、`SOUL.md` 和安装目录（自动写入 `~/.hermes/backups/grix-egg/<timestamp>/`）
3. 下载或替换安装内容
4. 写入新的 `SOUL.md`
5. 调用 `grix-admin bind-hermes` 刷新凭证和技能映射
   - 主 agent 保留全部技能
   - 其他 agent 默认禁用 `grix-admin`、`grix-register`、`grix-update`、`grix-egg`
   - **传 `--inherit-keys global`**，确保 LLM provider 密钥没被覆盖损坏
6. 启动目标 Hermes gateway，并确认状态正常
7. 如需自动更新，校验或更新 `grix-update` cron
8. 创建测试群并在测试群做身份验收

### 路由说明

- 路由值只有 `create_new` 和 `existing` 两种
- `create_new`：新建 agent 并安装
- `existing`：安装到已有 agent

## 验收失败处理

如果 probe 后目标 agent 回复不包含预期内容：

1. 检查目标 profile 的 `SOUL.md` 内容是否正确
2. 检查 `hermes --profile <name> gateway status` 是否在线
3. 排查后重新发 probe（最多重试 3 次）
4. 3 次仍失败，向 `status_target` 发送失败状态卡，说明停在哪一步，不要宣布安装成功

## 独立验收工具

如果只想验证已有 agent 的身份回答是否正确：

```bash
node scripts/verify_acceptance.js --session-id <SESSION_ID> --probe-message "你是谁" --expected-substring "我是" --timeout 15 --json
```

## 验收规则

验收涉及两个消息目标，绝不能混：

| 动作 | 目标 | 用什么 |
|------|------|--------|
| 发送测试群会话卡片 | 当前私聊（`status_target`） | `message-send` |
| 发送 probe 消息 | 测试群（`session_id`） | `message-send` |
| 查消息历史 | 测试群（`session_id`） | `grix-query` |

- 验收群一旦创建成功，立即保存准确的 `session_id`
- 所有 probe 消息和消息历史查询都发到这个测试群 `session_id`，不要发到私聊
- 会话卡片只发到 `status_target`（当前私聊），不要发到测试群
- 身份回答不正确时，不要提前宣布安装成功

## 收尾

- 成功：状态卡 + Agent 资料卡 + 下一步说明
- 失败：失败状态卡 + 清楚说明停在哪一步
