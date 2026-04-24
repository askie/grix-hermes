---
name: grix-register
description: 底层 HTTP 注册技能。提供邮箱验证码发送、账号注册、登录、access token 获取和首个 Grix API agent 创建能力。
---

# Grix Register

这个技能提供 Grix HTTP 注册链路。

## 能力

1. 发送邮箱验证码
2. 注册 Grix 账号
3. 邮箱或账号密码登录
4. 创建 `provider_type=3` 的 Grix API agent
5. 输出可交给 `grix-egg` 使用的 handoff JSON

## 执行方式

```bash
node scripts/grix_auth.js <subcommand> ...
```

## 发送邮箱验证码

```bash
node scripts/grix_auth.js send-email-code \
  --email <EMAIL> \
  --scene register \
  --base-url https://grix.dhf.pub
```

## 注册

```bash
node scripts/grix_auth.js register \
  --email <EMAIL> \
  --password <PASSWORD> \
  --email-code <CODE> \
  --base-url https://grix.dhf.pub
```

## 登录

```bash
node scripts/grix_auth.js login --email <EMAIL> --password <PASSWORD>
node scripts/grix_auth.js login --account <ACCOUNT> --password <PASSWORD>
```

## 创建 API Agent

```bash
node scripts/grix_auth.js create-api-agent \
  --access-token <TOKEN> \
  --agent-name <NAME> \
  --is-main true|false \
  --avatar-url <AVATAR_URL> \
  --base-url https://grix.dhf.pub
```

参数：

- `--access-token`：登录或注册后得到的 access token
- `--agent-name`：远端 agent 名称
- `--is-main`：是否主 agent，默认 `true`
- `--avatar-url`：agent 头像 URL
- `--base-url`：Grix 服务地址，默认 `https://grix.dhf.pub`
- `--no-reuse-existing-agent`：创建新的同名 `provider_type=3` agent
- `--no-rotate-key-on-reuse`：复用已有 agent 时保留当前 key

默认复用行为：脚本会查找同名 `provider_type=3` agent；找到后复用并轮换 API key；其余情况创建新 agent。

## grix-egg HTTP helper

`create_api_agent_and_bind.js` 提供 HTTP 创建并交给 `grix-egg` 绑定的辅助链路：

```bash
node scripts/create_api_agent_and_bind.js \
  --access-token <TOKEN> \
  --agent-name <NAME> \
  --profile-name <PROFILE_NAME> \
  --json
```

## 返回结构

`create-api-agent` 成功时返回：

```json
{
  "ok": true,
  "action": "create-api-agent",
  "agent_id": "...",
  "agent_name": "...",
  "is_main": true,
  "api_endpoint": "wss://...",
  "api_key": "...",
  "session_id": "...",
  "handoff": {
    "target_tool": "grix_egg",
    "task": "grix-egg route=existing\nprofile_name=...\n...",
    "bind_local": {
      "profile_name": "...",
      "agent_name": "...",
      "agent_id": "...",
      "api_endpoint": "...",
      "api_key": "...",
      "is_main": true
    }
  }
}
```

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
- [Handoff To grix-egg](references/handoff-contract.md)
