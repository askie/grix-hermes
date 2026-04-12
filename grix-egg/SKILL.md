---
name: grix-egg
description: 在 Grix 安装私聊里处理 OpenClaw 或 Claude 侧安装工作流时使用。适用于收到 `install_id`、`egg/install`、`main_agent`、`install.route` 等上下文后，按安装路线完成安装、回报进度、发送卡片、拉群验收，并在身份不正确时继续修复。
---

# Grix Egg

这是安装总编排技能。

开始前，先用 helper 校验安装上下文：

```bash
node scripts/validate_install_context.mjs --from-file ./install-context.json
```

## 绝对规则

- 远端 Grix 查询走 [grix-query](../grix-query/SKILL.md)
- 远端群动作走 [grix-group](../grix-group/SKILL.md)
- 远端 agent / 分类动作走 [grix-admin](../grix-admin/SKILL.md)
- 消息卡片优先走 [message-send](../message-send/SKILL.md)
- 本地 OpenClaw 配置只能走官方 CLI
- 安装进行中不要主动改 `openclaw.json`

## 安装状态

开始、成功、失败都应发送独立状态卡。

格式参考：

- [Grix Card Links](../shared/references/grix-card-links.md)
- [Acceptance Checklist](references/acceptance-checklist.md)

需要生成卡片时，优先用：

```bash
node scripts/card-link.mjs egg-status --install-id <INSTALL_ID> --status running --step downloading --summary 已下载
node scripts/card-link.mjs conversation --session-id <SESSION_ID> --session-type group --title 验收测试群
```

## 推荐主线

### `openclaw_create_new` / `openclaw_existing`

1. 识别安装包和目标路线
2. 如需新建远端 agent，先走 `grix-admin create_agent`
3. 本地绑定继续走 `grix-admin bind-local`
4. 下载并落位安装内容
5. 写入并校验 OpenClaw 配置
6. 如需自动更新，补 `grix auto update` cron
7. 创建测试群并拿到准确 `session_id`
8. 回当前私聊单独发送测试群会话卡片
9. 在测试群里做身份验收
10. 回答不正确就继续修，直到身份正确

### `claude_existing`

1. 定位目标 Claude agent
2. 安装 `skill.zip`
3. 如需同步 OpenClaw 配置，继续用官方 CLI
4. 校验后再决定是否需要拉群验收

## 验收规则

- 验收群一旦创建成功，就保存准确 `session_id`
- 后续所有群测消息都发到这个 `session_id`
- 如果拿到了准确 `session_id`，必须补一张会话卡片
- 配置已确认正确但人格还是旧结果时，才把 `openclaw gateway restart` 当成定向补救

## 收尾

- 成功：状态卡 + Agent 资料卡 + 下一步说明
- 失败：失败状态卡 + 清楚说明停在哪一步
