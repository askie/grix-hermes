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
| `main_agent` | hermes_create_new/existing | 主 agent 标识 |
| `route` | 否 | 路由：`hermes_create_new` 或 `hermes_existing` |
| `install.route` | 否 | 路由也可放在 `install` 子对象内 |
| `profile_name` | 否 | 目标 profile 名称 |
| `is_main` | 否 | 是否主 agent |
| `install_dir` | 否 | 安装目录 |
| `status_target` | 否 | 状态卡片投递目标（session_id） |
| `soul_file` | 否 | SOUL.md 源文件路径 |
| `soul_markdown` | 否 | SOUL.md 直接内容 |

### 绑定路径（三选一）

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

验收流程：创建测试群 → 发送会话卡片到 `status_target` → 发送 probe 消息 → 轮询消息历史检查预期回复。

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

### `hermes_create_new`

1. 识别安装包和目标路线
2. 如需新建远端 API agent，先走 `grix-register` 或 `grix-admin create_grix`
3. 创建目标 Hermes profile
4. 下载或落位安装内容
5. 写入或替换目标 profile 的 `SOUL.md`
6. 调用 `grix-admin bind-hermes`
   - 目标就是主 agent 时，显式传 `--is-main true`
   - 其他 agent 默认传 `--is-main false`
7. 启动目标 Hermes gateway，并确认 `hermes --profile <name> gateway status` 已经是运行态
8. 如需自动更新，补 `grix-update` 的 Hermes cron
9. 创建测试群并拿到准确 `session_id`
10. 回当前私聊单独发送测试群会话卡片
11. 在测试群做身份验收，回答不正确就继续修到正确

### `hermes_existing`

1. 定位目标 Hermes profile
2. 先备份将被覆盖的 `.env`、`config.yaml`、`SOUL.md` 和安装目录（自动写入 `~/.hermes/backups/grix-egg/<timestamp>/`）
3. 下载或替换安装内容
4. 写入新的 `SOUL.md`
5. 调用 `grix-admin bind-hermes` 刷新凭证和技能映射
   - 主 agent 保留全部技能
   - 其他 agent 默认禁用 `grix-admin`、`grix-register`、`grix-update`、`grix-egg`
6. 启动目标 Hermes gateway，并确认状态正常
7. 如需自动更新，校验或更新 `grix-update` cron
8. 创建测试群并做身份验收

### 路由兼容

- 上游如果还在发 `openclaw_create_new` / `openclaw_existing`
- helper 会把它们归一成 `hermes_create_new` / `hermes_existing`
- 内部流程不要再继续按 OpenClaw 语义执行

## 独立验收工具

如果只想验证已有 agent 的身份回答是否正确：

```bash
node scripts/verify_acceptance.js --session-id <SESSION_ID> --probe-message "你是谁" --expected-substring "我是" --timeout 15 --json
```

## 验收规则

- 验收群一旦创建成功，就保存准确 `session_id`
- 后续所有群测消息都发到这个 `session_id`
- 如果拿到了准确 `session_id`，必须补一张会话卡片
- 目标 Hermes profile 已存在，且绑定值已经写入
- 目标 profile 的 `SOUL.md` 已落到位
- 目标 profile 的 gateway 已启动并通过状态检查
- 身份回答不正确时，不要提前宣布安装成功

## 收尾

- 成功：状态卡 + Agent 资料卡 + 下一步说明
- 失败：失败状态卡 + 清楚说明停在哪一步
