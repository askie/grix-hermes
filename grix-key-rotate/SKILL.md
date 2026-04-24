---
name: grix-key-rotate
description: 轮换 Grix agent API 密钥。支持更新已有 `.env` 中的 `GRIX_API_KEY`，stdout 输出脱敏结果。
---

# Grix Key Rotate

这个技能提供 Grix agent API key 轮换能力。

## 能力

1. 为指定 Grix agent 轮换 API key
2. 更新已有 `.env` 文件中的 `GRIX_API_KEY`
3. 输出脱敏后的轮换结果
4. 写入临时密钥备份文件

## 用法

```bash
node scripts/grix-key-rotate.js \
  --agent-id <AGENT_ID> \
  --env-file ~/.hermes/profiles/<PROFILE>/.env \
  --json
```

参数：

- `--agent-id`：目标 agent ID
- `--env-file`：已有 `.env` 文件路径
- `--json`：JSON 输出

## 输出

传 `--env-file` 时：

- `rotatedAgent`：轮换后的 agent 信息，`api_key` 字段脱敏
- `envFile`：已更新的 `.env` 文件路径
- `tempKeyFile`：临时密钥备份文件路径

省略 `--env-file` 时：

- `rotatedAgent`：轮换后的 agent 信息，`api_key` 字段脱敏

## 文件写入

- `.env` 中的 `GRIX_API_KEY` 会替换为新密钥
- `GRIX_ENDPOINT` 和 `GRIX_AGENT_ID` 保持原值
- 临时备份文件写入 `~/.hermes/tmp/grix-key-<timestamp>.tmp`

## 权限

调用方 agent 使用 `agent.api.create` 权限轮换同 owner 下的 agent key。

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
