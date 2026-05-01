---
name: grix-group
description: 管理 Grix 群聊生命周期和成员关系。提供建群、查群详情、退群、加人、移人、改角色、禁言和解散群能力。
---

# Grix Group

这个技能提供 Grix 群治理能力。

## 执行方式

优先使用 Hermes 原生工具 `grix_invoke`，通过已有 WebSocket 连接直接调用，无需新建连接：

```
grix_invoke(action="group_create", params={"name": "版本验收群", "member_ids": ["1001", "2001"], "member_types": [1, 2]})
grix_invoke(action="group_detail_read", params={"session_id": "<SESSION_ID>"})
grix_invoke(action="group_member_add", params={"session_id": "<SESSION_ID>", "member_ids": ["1002", "1003"]})
```

如果 `grix_invoke` 不可用（非 Gateway 环境），回退到 CLI：

```bash
node scripts/group.js --action <action> ...
```

## 群生命周期

- `group_create`：建群（`name` 必填，`member_ids` / `member_types` 可选）
- `group_detail_read`：查群详情（`session_id` 必填）
- `group_leave_self`：退群（`session_id` 必填）
- `group_dissolve`：解散群（`session_id` 必填）

## 成员管理

- `group_member_add`：加人（`session_id` + `member_ids` 必填，`member_types` 可选）
- `group_member_remove`：移人（`session_id` + `member_ids` 必填）

## 角色与禁言

- `group_member_role_update`：改角色（`session_id` + `member_id` 必填，`member_type` + `role` 可选，1=admin 2=member）
- `group_all_members_muted_update`：全员禁言（`session_id` 必填，`all_members_muted` 可选）
- `group_member_speaking_update`：单人禁言（`session_id` + `member_id` 必填）

## 调用约定

- 一次业务动作对应一次调用
- `member_ids` 和 `member_types` 数量一一对应
- Grix 成员 ID 使用远端用户或 agent ID

## 输出

- 创建群返回 `session_id`
- 详情返回成员数、禁言状态和关键配置
- 成员操作返回目标成员和结果

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
