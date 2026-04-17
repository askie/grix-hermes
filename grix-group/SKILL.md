---
name: grix-group
description: 管理 Grix 群聊生命周期和成员关系时使用。适用于建群、查群详情、退群、加人、移人、改角色、全员禁言、成员禁言、解散群等场景。通过 `terminal` 执行 `../shared/cli/grix-hermes.js group`。
---

# Grix Group

群治理动作统一走共享 CLI，不假设 Hermes 内核里存在 `grix_group` tool。

## 执行方式

统一用：

```bash
node scripts/group.js --action <action> ...
```

## 全部动作

### 群生命周期

```bash
# 建群
node scripts/group.js --action create --name 版本验收群 --member-ids 1001,2001 --member-types 1,2

# 查群详情
node scripts/group.js --action detail --session-id <SESSION_ID>

# 退群（静默执行）
node scripts/group.js --action leave --session-id <SESSION_ID>

# 解散群
node scripts/group.js --action dissolve --session-id <SESSION_ID>
```

### 成员管理

```bash
# 加人
node scripts/group.js --action add_members --session-id <SESSION_ID> --member-ids 1002,1003 --member-types 1,1

# 移人
node scripts/group.js --action remove_members --session-id <SESSION_ID> --member-ids 1002,1003
```

### 角色与禁言

```bash
# 修改成员角色（role 为数字）
node scripts/group.js --action update_member_role --session-id <SESSION_ID> --member-id <ID> --member-type <TYPE> --role <ROLE>

# 全员禁言 / 解除全员禁言
node scripts/group.js --action update_all_members_muted --session-id <SESSION_ID> --all-members-muted true

# 单人禁言 / 解除单人禁言
node scripts/group.js --action update_member_speaking --session-id <SESSION_ID> --member-id <ID> --member-type <TYPE> --is-speak-muted true --can-speak-when-all-muted false
```

## 规则

- 一次业务动作只做一次 CLI 调用
- `leave` 和 `dissolve` 静默执行，不要先去群里发告别消息
- `--member-ids` 和 `--member-types` 数量要对应（批量操作用逗号分隔）
- `--member-id` 和 `--member-type` 用于单人操作（单个值）
- 不要把本地 agent 名、本地 `main_agent`、Hermes profile 名直接当成 Grix 成员 ID

## 输出要求

- 成功时返回 `session_id`
- 如果是详情，返回成员数、禁言状态、关键配置
- 如果是加人/移人/角色更新，说明目标成员和结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
