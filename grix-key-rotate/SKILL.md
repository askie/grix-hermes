---
name: grix-key-rotate
description: 程序优先的 Grix API key 轮换技能。AI 只负责整理参数并读取结果，不直接处理明文密钥。
version: 2.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, key-rotate, api-key, security]
    related_skills: [grix-admin, grix-egg]
---

# Grix Key Rotate

`grix-key-rotate` 的唯一入口是：

```bash
node scripts/grix-key-rotate.js ... --json
```

这个技能只做一件事：轮换目标 agent 的 API key。需要把新 key 写回本地配置时，由程序直接改 `.env`，不要让 AI 暴露明文。

## 1. 标准入参

最小调用：

```bash
node scripts/grix-key-rotate.js \
  --agent-id "<AGENT_ID>" \
  --json
```

带本地配置回写：

```bash
node scripts/grix-key-rotate.js \
  --agent-id "<AGENT_ID>" \
  --env-file "~/.hermes/profiles/<PROFILE>/.env" \
  --json
```

规则：

- `--agent-id` 必填
- `--env-file` 可选；传了就只替换 `GRIX_API_KEY`

## 2. 程序输出

- `rotatedAgent`
  - `api_key` 在 stdout 中会被脱敏
- `envFile`
  - 只有传 `--env-file` 时才有
- `tempKeyFile`
  - 只有传 `--env-file` 时才有
  - 位于 `~/.hermes/tmp/`

## 3. 使用边界

- 不传 `--env-file` 时，程序只负责远端轮换
- 传了 `--env-file` 时，程序会：
  - 轮换远端 key
  - 更新本地 `.env`
  - 生成临时密钥备份文件

注意：

- 旧 key 会立即失效
- 使用该 key 的 agent 通常需要重启后才会拿到新配置
- AI 不应在聊天输出里传播明文 key

## 4. AI 只参与什么

- 从自然语言里确定目标 `agent-id` 和是否需要改本地 `.env`
- 读取结果后告诉用户轮换是否成功、是否已回写本地配置
- 如果用户后续要绑定到新 profile，再交给 `grix-egg`
