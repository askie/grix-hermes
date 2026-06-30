---
name: grix-query
description: 程序优先的 Grix 只读查询技能。AI 只负责把查询意图整理成标准动作和参数，再读取 JSON 结果。
version: 2.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, query, search, contacts, sessions, messages, egg, marketplace]
    related_skills: [grix-group, grix-egg, message-send, message-unsend]
---

# Grix Query

`grix-query` 的唯一入口是：

```bash
node scripts/query.js ... --json
```

这个技能只做只读查询，不发消息、不建群、不改远端状态。

## 1. 标准动作

- `--action contact_search`
- `--action session_search`
- `--action message_history`
- `--action message_search`
- `--action egg_search`
- `--action egg_get`
- `--action search_favorite_sessions`

只有这 7 个动作是有效的。不要写成旧的 `history` 之类别名。

## 2. 标准入参

### 2.1 联系人和会话

```bash
node scripts/query.js --action contact_search --keyword "alice"
node scripts/query.js --action session_search --keyword "测试群"
```

### 2.2 消息历史和关键词搜索

```bash
node scripts/query.js --action message_history --session-id "<SESSION_ID>" --limit 20
node scripts/query.js --action message_search --session-id "<SESSION_ID>" --keyword "身份" --limit 20
```

### 2.3 虾蛋市场

搜索虾蛋列表：

```bash
node scripts/query.js --action egg_search
node scripts/query.js --action egg_search --keyword "代码助手"
node scripts/query.js --action egg_search --category-id "<CATEGORY_ID>"
node scripts/query.js --action egg_search --page 2 --page-size 20
node scripts/query.js --action egg_search --locale "zh-CN"
```

### 2.4 已收藏的会话

列出当前 agent owner 收藏的所有会话（支持关键词过滤）：

```bash
node scripts/query.js --action search_favorite_sessions
node scripts/query.js --action search_favorite_sessions --keyword "项目"
node scripts/query.js --action search_favorite_sessions --limit 50 --offset 0
```

返回结果包含 `session_id`、`title`、`session_type`、`favorited_at` 等字段，可直接用 `session_id` 做后续操作。

获取单个虾蛋详情（`--id` 必填）：

```bash
node scripts/query.js --action egg_get --id "<EGG_ID>"
node scripts/query.js --action egg_get --id "<EGG_ID>" --version 2
node scripts/query.js --action egg_get --id "<EGG_ID>" --locale "zh-CN"
```

可选公共参数：

- `--id`（`egg_get` 必填）
- `--keyword`
- `--session-id`
- `--before-id`
- `--category-id`
- `--locale`
- `--page`（默认 1）
- `--page-size`（默认 20）
- `--version`（默认取最新版本）
- `--limit`
- `--offset`

## 3. 推荐查询顺序

- 先用 `session_search` 找到目标 `session_id`
- 再用 `message_history` 或 `message_search` 查消息
- 继续翻页时优先带 `--before-id`

## 4. 输出与边界

- 联系人结果里关注联系人 ID
- 会话结果里关注 `session_id`
- 消息结果里关注消息 ID、发送者和时间

这个技能只负责读数据：

- 发消息交给 `message-send`
- 管理群交给 `grix-group`
- 远端 agent 管理交给 `grix-admin`

## 5. AI 只参与什么

- 把“找某个群”“查最近 20 条消息”“搜关键词”这类自然语言整理成标准查询动作
- 读取 JSON 结果后提炼关键 ID 和结论
- 如果查询不到目标，再回头问用户更精确的关键词或上下文
