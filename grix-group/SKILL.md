---
name: grix-group
description: 管理 Grix 群聊生命周期和成员关系时使用。适用于建群、查群详情、退群、加人、移人、改角色、全员禁言、成员禁言、解散群等场景。通过 `terminal` 执行 `../shared/cli/grix-hermes.mjs group`。
---

# Grix Group

群治理动作统一走共享 CLI，不假设 Hermes 内核里存在 `grix_group` tool。

## 执行方式

统一用：

```bash
node scripts/group.mjs --action <action> ...
```

常用例子：

```bash
node scripts/group.mjs --action create --name 版本验收群 --member-ids 1001,2001 --member-types 1,2
node scripts/group.mjs --action detail --session-id <SESSION_ID>
node scripts/group.mjs --action leave --session-id <SESSION_ID>
node scripts/group.mjs --action add_members --session-id <SESSION_ID> --member-ids 1002,1003 --member-types 1,1
```

## 规则

- 一次业务动作只做一次 CLI 调用
- `leave` 静默执行，不要先去群里发告别消息
- `memberIds` 和 `memberTypes` 数量要对应
- 不要把本地 agent 名、本地 `main_agent`、Hermes profile 名直接当成 Grix 成员 ID

## 输出要求

- 成功时返回 `session_id`
- 如果是详情，返回成员数、禁言状态、关键配置
- 如果是加人/移人/角色更新，说明目标成员和结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
