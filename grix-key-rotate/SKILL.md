---
name: grix-key-rotate
description: 轮换 Grix agent 的 API 密钥。支持 --env-file 参数直接替换 .env 文件中的密钥，不输出明文。具有 agent.api.create 权限的 agent 可独立调用此技能轮换同 owner 下任意 agent 的密钥。
---

# Grix Key Rotate

轮换 Grix agent 的 API 密钥并更新本地配置。

## 用途

- 定期轮换 agent 的 API 密钥（安全最佳实践）
- 密钥泄露后立即更换
- 任何具有 `agent.api.create` 权限的 agent 可以独立调用此技能，轮换同一 owner 下任意 agent 的密钥

## 用法

### 基本用法（轮换并替换 .env 文件中的密钥）

```bash
node scripts/grix-key-rotate.js --agent-id <AGENT_ID> --env-file ~/.hermes/profiles/<PROFILE>/config.env
```

必填参数：
- `--agent-id`：要轮换密钥的目标 agent ID

可选参数：
- `--env-file`：目标 `.env` 文件的绝对路径。如果提供，新密钥会直接替换文件中的 `GRIX_API_KEY` 值，其他参数不变

### 输出

传了 `--env-file` 时：
- `rotatedAgent`：轮换后的 agent 信息（api_key 已脱敏为 `***`）
- `envFile`：已更新的 .env 文件路径
- `tempKeyFile`：临时密钥备份文件路径（位于 `~/.hermes/tmp/grix-key-<timestamp>.tmp`）

不传 `--env-file` 时：
- `rotatedAgent`：轮换后的 agent 信息（api_key 已脱敏为 `***`）

### 注意事项

1. **不会输出明文密钥到 stdout**——密钥只出现在 `.env` 文件和临时备份文件中
2. `--env-file` 只替换 `GRIX_API_KEY` 这一行，`GRIX_ENDPOINT` 和 `GRIX_AGENT_ID` 保持不变
3. 临时密钥文件位于 `~/.hermes/tmp/`，调用方应及时读取并清理
4. 轮换后旧密钥立即失效，使用该密钥的 agent 需要重启才能使用新密钥
5. 调用方 agent 自身需要有 `agent.api.create` 权限

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
