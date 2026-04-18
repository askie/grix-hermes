# Acceptance Checklist

`grix-egg` 安装成功前，分两段确认：

## 验收前确认（进入验收测试之前）

1. 目标内容已经落位
2. 目标 Hermes profile 已创建或准确定位
3. 必要的 Grix 绑定值已经写入目标 profile 的 `.env`
4. 目标 profile 能加载当前 `grix-hermes` 技能目录
5. 如需覆盖身份，目标 `SOUL.md` 已经写入
6. 目标 profile 的 gateway 已启动并通过状态检查

以上 6 条全部通过后，才进入验收测试。

## 验收结果确认

7. 测试群已创建，且保存了准确的 `session_id`
8. 已向当前私聊（`status_target`）发送测试群会话卡片（不是发到测试群里）
9. 已向测试群（`session_id`）发送 probe 消息（不是发到私聊）
10. 在测试群消息历史中确认目标 agent 回复了包含预期内容的消息
11. 回复不正确时，排查 SOUL.md 和 gateway 状态后重试（最多 3 次）
