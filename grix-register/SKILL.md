---
name: grix-register
description: 底层 HTTP 注册技能。用于注册 Grix 账号、发送邮箱验证码、登录、创建首个 API agent；不负责本地 Hermes profile 绑定。完整新 Hermes agent 孵化必须使用 `grix-egg`。
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

## 内部工具

`create_api_agent_and_bind.js` 只作为 `grix-egg` HTTP 路径的内部工具使用。普通调用方不要直接用它做本地 Hermes profile 绑定；需要完整安装、绑定、写 `SOUL.md`、启动 gateway 或验收时，统一转到 `grix-egg`。

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
5. 如需绑定到本地 Hermes profile，继续执行 [grix-egg](../grix-egg/SKILL.md) 的 `--route existing` 路径

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

## 规则

- 不要求用户自己开浏览器
- 只有当前执行环境**没有** Grix WS 运行时凭证（`GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY`）且任务只是 HTTP 注册/创建时才走这个技能。完整 Hermes agent 孵化始终走 `grix-egg`
- HTTP 只用于注册、登录、验证码、首个 API agent 创建
- `create-api-agent` 默认按主 agent 创建，也会把"主 agent 保留全部技能"这件事继续交给 `grix-egg`
- 本地 Hermes 绑定不在这个技能里手工拼，创建完就继续交给 `grix-egg`
- 如果要写 `SOUL.md`、启动 gateway、覆盖已有 Hermes agent 或做验收，继续交给 `grix-egg`

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
- [Handoff To grix-egg](references/handoff-contract.md)
