---
name: grix-egg
description: 在 Grix 安装私聊里处理 Hermes 侧安装工作流时使用。适用于收到 `install_id`、`egg/install`、`main_agent`、`install.route` 等上下文后，按 Hermes 路线完成 agent 创建或覆盖、包落位、绑定、回报进度、拉群验收，并在身份不正确时继续修复。
---

# Grix Egg

这是 Hermes 安装总编排技能。

开始前，先用 helper 校验安装上下文：

```bash
node scripts/validate_install_context.mjs --from-file ./install-context.json
```

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
node scripts/card-link.mjs egg-status --install-id <INSTALL_ID> --status running --step downloading --summary 已下载
node scripts/card-link.mjs conversation --session-id <SESSION_ID> --session-type group --title 验收测试群
```

## 推荐主线

### `hermes_create_new`

1. 识别安装包和目标路线
2. 如需新建远端 API agent，先走 `grix-register` 或 `grix-admin create_agent`
3. 创建目标 Hermes profile
4. 下载或落位安装内容
5. 写入或替换目标 profile 的 `SOUL.md`
6. 调用 `grix-admin bind-hermes`
7. 如需自动更新，补 `grix-update` 的 Hermes cron
8. 创建测试群并拿到准确 `session_id`
9. 回当前私聊单独发送测试群会话卡片
10. 在测试群做身份验收，回答不正确就继续修到正确

### `hermes_existing`

1. 定位目标 Hermes profile
2. 先备份将被覆盖的 `.env`、`config.yaml`、`SOUL.md` 和安装目录
3. 下载或替换安装内容
4. 写入新的 `SOUL.md`
5. 调用 `grix-admin bind-hermes` 刷新凭证和技能映射
6. 如需自动更新，校验或更新 `grix-update` cron
7. 创建测试群并做身份验收

### 路由兼容

- 上游如果还在发 `openclaw_create_new` / `openclaw_existing`
- helper 会把它们归一成 `hermes_create_new` / `hermes_existing`
- 内部流程不要再继续按 OpenClaw 语义执行

## 验收规则

- 验收群一旦创建成功，就保存准确 `session_id`
- 后续所有群测消息都发到这个 `session_id`
- 如果拿到了准确 `session_id`，必须补一张会话卡片
- 目标 Hermes profile 已存在，且绑定值已经写入
- 目标 profile 的 `SOUL.md` 已落到位
- 身份回答不正确时，不要提前宣布安装成功

## 收尾

- 成功：状态卡 + Agent 资料卡 + 下一步说明
- 失败：失败状态卡 + 清楚说明停在哪一步
