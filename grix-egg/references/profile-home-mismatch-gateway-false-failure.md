# create_new 成功但 gateway 因 profile home 错位假失败

已验证一种真实现场模式：

- `bootstrap.js --route create_new --profile-name <ascii>` 成功完成 `create` 与 `bind`
- state file 中 `bind.result.profile_dir` 指向当前受保护 profile 下的嵌套路径，例如：
  - `~/.hermes/profiles/grix-online/profiles/fenda`
- 但 `hermes --profile fenda gateway status` 实际查看的是根 profile：
  - `~/.hermes/profiles/fenda`
- 结果 `start_gateway.js` 会报 gateway 未 running / bootstrap 在 `step=gateway` 失败
- 同时根 profile 日志里常见：
  - `No messaging platforms enabled.`

这不表示远端 agent 创建失败。通常说明：

1. `bind_local` 在当前会话的 `HERMES_HOME`（例如受保护 profile 的 home）下写入了 profile 配置
2. Hermes CLI 的 `--profile <name>` 解析到了默认根 profile 目录
3. gateway 检查看的不是刚刚写入凭证和 `channels.grix.wsUrl` 的那份 profile

现场判读顺序：

1. 先读 state file，确认 `create` 是否已经拿到 `agent_id / api_endpoint`
2. 检查 `bind.result.profile_dir` 是否是嵌套 profile 路径
3. 再检查根 profile `~/.hermes/profiles/<name>/logs/gateway.log`
4. 如果日志是 `No messaging platforms enabled.`，优先判定为 profile home 错位，而不是创建失败

现场修复：

1. 将嵌套 profile 中的 `config.yaml` 与 `.env` 同步到真实根 profile `~/.hermes/profiles/<name>/`
2. 确认根 profile `config.yaml` 包含：
   ```yaml
   channels:
     grix:
       wsUrl: <API_ENDPOINT>
   ```
3. 如 `.env` 中 `GRIX_API_KEY` 已是遮掩值（如 `ak_***` / `***` / hint 形式），立刻对目标 `agent_id` 执行 key rotate，并把新 key 写回根 profile `.env`
4. `hermes --profile <name> gateway restart`
5. 以日志中的以下信号验收：
   - `Connecting to grix...`
   - `[Grix] Connected to <WS_URL>`
   - `✓ grix connected`

补充：

- 这类故障的首层根因是“profile 写入位置”和“gateway 实际读取位置”不一致
- 第二层常见伴生问题是 `.env` 里只剩遮掩后的 `GRIX_API_KEY`，导致即使补到根 profile 后仍需先 rotate key 才能真正上线
- 若 state file 已显示 `create.status=done` 且含目标 `agent_id`，对用户汇报应按“agent 已创建，gateway 验收假失败，已修复上线”处理，不应误报为创建失败
