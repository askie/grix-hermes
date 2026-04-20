# Legacy: install_flow JSON Payload 文档

> 以下文档描述了 `install_flow.js` 的完整 JSON payload 结构。
> 新项目推荐使用 `bootstrap.js`（扁平 CLI 参数，无需构造 JSON）。
> 仅在需要精细控制（直接绑定已有凭证、自定义 acceptance 配置等）时参考本文档。

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

## JSON Payload 结构

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

### 绑定路径

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

## 验收流程

1. **创建测试群** — 用 `grix-group` 创建，拿到测试群的 `session_id`
2. **回当前私聊发卡片** — 用 `message-send` 向 `status_target`（当前私聊）发送测试群的会话卡片
3. **在测试群发 probe** — 用 `message-send` 向测试群 `session_id` 发送 probe 消息
4. **轮询测试群消息历史** — 用 `grix-query` 查消息历史，检查 agent 是否回复了包含 `expected_substring` 的内容

关键：会话卡片发到当前私聊（`status_target`），probe 消息发到测试群（测试群 `session_id`），两者不要混。

## 独立验收工具

```bash
node scripts/verify_acceptance.js --session-id <SESSION_ID> --probe-message "你是谁" --expected-substring "我是" --timeout 15 --json
```
