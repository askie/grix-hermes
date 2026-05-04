# 手工收口 grix-egg 验收：权限修复、密钥踩坑与状态回填

适用场景：
- `create_new` 已把远端 agent 创建出来
- live profile 后续经手工修复才真正可用
- bootstrap state 仍停留在 `gateway failed` / `accept pending`
- 需要人工完成群验收并把安装状态收口

## 1. 访问控制不要默认锁成单用户

本轮确认：对“普通用户让我直接创建 agent”的默认交付，不应把新 profile 直接写成：

- `GRIX_ALLOWED_USERS=<发起人个人 user id>`

这样会影响：
- 代测
- 群验收
- 多账号探针

更稳妥的验收期默认：
- `GRIX_ALLOW_ALL_USERS=true`
- 或 allowlist 至少覆盖所有实际验收参与者

## 2. read_file 展示值可能是脱敏的，不能直接写回 `.env`

现场踩坑：
- 从 `read_file` 看到的 `.env` 里，`GRIX_API_KEY` 显示成 `ak_205...xxxx`
- 随后用整段文本 `patch` `.env`
- 结果真实文件被写成脱敏 key
- gateway 重启后报：
  - `grix auth failed: code=10001 msg=auth failed`

修复方式：
1. 轮换目标 agent 的 API key
2. 直接写回目标 profile `.env`
3. 用脚本读取真实文件，确认 `GRIX_API_KEY` 长度正常且不含 `***` / `...`
4. 再重启 gateway

## 3. 群验收通过后要补发结果消息

当目标 agent 已经在测试群真实回复后，补发一条明确收口消息，避免群里只有 probe 和 agent 回复，没有最终结论。

示例：
- `群测试通过：芬达已完成当前群回复验证。`

本轮补发目标：
- 测试群 `session_id=f37e6491-1bdf-4b2d-867d-db128b1ba221`

## 4. state file 需要人工回填最终状态

如果 bootstrap 自身没把状态收口，人工验证完成后至少回填：

- 顶层：
  - `updated_at`
  - `completed_at`
- `steps.gateway`:
  - `status=done`
  - `result.verified=true`
  - `result.log_signal="✓ grix connected"`
- `steps.accept`:
  - `status=done`
  - `result.session_id`
  - `result.probe_msg_id`
  - `result.reply_msg_id`
  - `result.reply_sender_id`
  - `result.reply_content`

本轮样例：
- state file: `/Users/gcf/.hermes/profiles/grix-online/tmp/grix-egg-egg-f9c1fe05.json`
- probe message: `2051181666676248576`
- reply message: `2051181721416105984`
- reply sender: `2051165696108793856`
- reply content: `群测通过`

## 5. 结论

这类 case 里，最终是否交付完成，应以“真实 live profile 可连接 + 测试群消息历史里目标 agent 已回复 + state 已回填”为准，而不是以 bootstrap 初始报错为准。
