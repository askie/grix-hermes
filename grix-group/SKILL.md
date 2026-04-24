---
name: grix-group
description: 管理 Grix 群聊生命周期和成员关系。提供建群、查群详情、退群、加人、移人、改角色、禁言和解散群能力。
---

# Grix Group

这个技能提供 Grix 群治理能力。

## 执行方式

```bash
node scripts/group.js --action <action> ...
```

## 群生命周期

```bash
node scripts/group.js --action create --name 版本验收群 --member-ids 1001,2001 --member-types 1,2
node scripts/group.js --action detail --session-id <SESSION_ID>
node scripts/group.js --action leave --session-id <SESSION_ID>
node scripts/group.js --action dissolve --session-id <SESSION_ID>
```

## 成员管理

```bash
node scripts/group.js --action add_members --session-id <SESSION_ID> --member-ids 1002,1003 --member-types 1,1
node scripts/group.js --action remove_members --session-id <SESSION_ID> --member-ids 1002,1003
```

## 角色与禁言

```bash
node scripts/group.js --action update_member_role --session-id <SESSION_ID> --member-id <ID> --member-type <TYPE> --role <ROLE>
node scripts/group.js --action update_all_members_muted --session-id <SESSION_ID> --all-members-muted true
node scripts/group.js --action update_member_speaking --session-id <SESSION_ID> --member-id <ID> --member-type <TYPE> --is-speak-muted true --can-speak-when-all-muted false
```

## 调用约定

- 一次业务动作对应一次 CLI 调用
- `leave` 和 `dissolve` 使用静默执行
- `--member-ids` 和 `--member-types` 数量一一对应
- `--member-id` 和 `--member-type` 用于单成员操作
- Grix 成员 ID 使用远端用户或 agent ID

## 输出

- 创建群返回 `session_id`
- 详情返回成员数、禁言状态和关键配置
- 成员操作返回目标成员和结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
