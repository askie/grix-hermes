---
name: grix-register
description: 用户需要注册 Grix 账号、发送邮箱验证码、登录、创建首个 API agent 并继续绑定到 Hermes 时使用。注册链路走 `scripts/grix_auth.js` 的 HTTP 组件，创建完 API agent 后继续交给 `grix-admin` 的 Hermes 绑定流程。
---

# Grix Register

这个技能负责 HTTP 注册链路，不依赖 Hermes 内核改造。

## 执行方式

统一通过 `terminal` 调用：

```bash
node scripts/grix_auth.js <subcommand> ...
```

## 常用子命令

### send-email-code

```bash
node scripts/grix_auth.js send-email-code --email <EMAIL> --scene register --base-url https://grix.dhf.pub
```

### register

```bash
node scripts/grix_auth.js register --email <EMAIL> --password <PASSWORD> --email-code <CODE> --base-url https://grix.dhf.pub
```

### login

```bash
node scripts/grix_auth.js login --email <EMAIL> --password <PASSWORD> --base-url https://grix.dhf.pub
```

也可以用 `--account` 代替 `--email`：

```bash
node scripts/grix_auth.js login --account <ACCOUNT> --password <PASSWORD>
```

### create-api-agent

```bash
node scripts/grix_auth.js create-api-agent --access-token <TOKEN> --agent-name <NAME> --base-url https://grix.dhf.pub
```

完整参数：

```bash
node scripts/grix_auth.js create-api-agent \
  --access-token <TOKEN> \
  --agent-name <NAME> \
  --is-main true|false \
  --avatar-url <AVATAR_URL> \
  --base-url https://grix.dhf.pub \
  --no-reuse-existing-agent \
  --no-rotate-key-on-reuse
```

- `--is-main`：默认 `true`
- `--avatar-url`：可选，设置 agent 头像
- `--base-url`：Grix 服务地址，默认 `https://grix.dhf.pub`，也可用环境变量 `GRIX_WEB_BASE_URL`
- `--no-reuse-existing-agent`：禁止复用已有的同名 `provider_type=3` agent，强制创建新的
- `--no-rotate-key-on-reuse`：复用已有 agent 时不轮换 API key

Agent 复用行为：默认先查找同名 `provider_type=3` agent，找到就复用并轮换 API key。找不到才创建新的。

## 一键创建并绑定

如果要把"创建 API agent + Hermes 绑定"一次跑完，优先用：

```bash
node scripts/create_api_agent_and_bind.js \
  --access-token <TOKEN> \
  --agent-name <NAME> \
  --avatar-url <AVATAR_URL> \
  --base-url https://grix.dhf.pub \
  --profile-name <PROFILE_NAME> \
  --profile-mode create-or-reuse \
  --is-main true \
  --clone-from <SOURCE_PROFILE> \
  --install-dir ~/.hermes/skills/grix-hermes \
  --account-id <ACCOUNT_ID> \
  --allowed-users <USER_1,USER_2> \
  --allow-all-users true|false \
  --home-channel <SESSION_ID> \
  --home-channel-name <CHANNEL_NAME> \
  --hermes hermes \
  --node node \
  --dry-run \
  --json
```

如果已经有一份 `create-api-agent` 的 JSON 结果，也可以：

```bash
node scripts/create_api_agent_and_bind.js \
  --agent-json-file ./created-agent.json \
  --profile-name <PROFILE_NAME> \
  --is-main true \
  --dry-run \
  --json
```

`create_api_agent_and_bind` 内部会先调 `grix_auth create-api-agent`（或读取已有 JSON），再把结果通过 stdin 传给 `grix-admin/scripts/bind_local.js --from-json -`。

## 主线

1. 发送邮箱验证码
2. 完成注册或登录
3. 创建首个 `provider_type=3` 的 API agent
4. 从脚本返回里拿：
   - `agent_name`
   - `agent_id`
   - `api_endpoint`
   - `api_key`
   - `is_main`
   - `session_id`（与远端 agent 的初始会话）
5. 继续执行 [grix-admin](../grix-admin/SKILL.md) 的 `bind-hermes`

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
    "target_tool": "grix_admin",
    "task": "bind-hermes\nprofile_name=...\n...",
    "bind_hermes": {
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

## 规则

- 不要求用户自己开浏览器
- 只有当前执行环境**没有** Grix WS 运行时凭证（`GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY`）时才走这个技能。如果当前已经是 Hermes agent 且有 WS 凭证，创建远端 agent 走 `grix-admin`
- HTTP 只用于注册、登录、验证码、首个 API agent 创建
- `create-api-agent` 默认按主 agent 创建，也会把"主 agent 保留全部技能"这件事继续交给 `grix-admin`
- 本地 Hermes 绑定不在这个技能里手工拼，创建完就继续交给 `grix-admin`
- 如果要写 `SOUL.md` 或覆盖已有 Hermes agent，继续交给 `grix-egg`

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
- [Handoff To grix-admin](references/handoff-contract.md)
