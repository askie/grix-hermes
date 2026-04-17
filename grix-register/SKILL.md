---
name: grix-register
description: 用户需要注册 Grix 账号、发送邮箱验证码、登录、创建首个 API agent 并继续绑定到 Hermes 时使用。注册链路走 `scripts/grix_auth.py` 的 HTTP 组件，创建完 API agent 后继续交给 `grix-admin` 的 Hermes 绑定流程。
---

# Grix Register

这个技能负责 HTTP 注册链路，不依赖 Hermes 内核改造。

## 执行方式

统一通过 `terminal` 调用：

```bash
python3 scripts/grix_auth.py <subcommand> ...
```

## 常用子命令

```bash
python3 scripts/grix_auth.py send-email-code --email <EMAIL> --scene register
python3 scripts/grix_auth.py register --email <EMAIL> --password <PASSWORD> --email-code <CODE>
python3 scripts/grix_auth.py login --email <EMAIL> --password <PASSWORD>
python3 scripts/grix_auth.py create-api-agent --access-token <TOKEN> --agent-name <NAME>
```

## 主线

1. 发送邮箱验证码
2. 完成注册或登录
3. 创建首个 `provider_type=3` 的 API agent
4. 从脚本返回里拿：
   - `profile_name`
   - `agent_name`
   - `agent_id`
   - `api_endpoint`
   - `api_key`
   - `is_main`
5. 继续执行 [grix-admin](../grix-admin/SKILL.md) 的 `bind-hermes`

如果你想把“创建 API agent + Hermes 绑定”一次跑完，优先用：

```bash
python3 scripts/create_api_agent_and_bind.py \
  --access-token <TOKEN> \
  --agent-name <NAME> \
  --profile-name <PROFILE_NAME> \
  --is-main true \
  --json
```

如果已经有一份 `create-api-agent` 的 JSON 结果，也可以：

```bash
python3 scripts/create_api_agent_and_bind.py \
  --agent-json-file ./created-agent.json \
  --profile-name <PROFILE_NAME> \
  --dry-run \
  --json
```

## 规则

- 不要求用户自己开浏览器
- HTTP 只用于注册、登录、验证码、首个 API agent 创建
- `create-api-agent` 默认按主 agent 创建，也会把“主 agent 保留全部技能”这件事继续交给 `grix-admin`
- 本地 Hermes 绑定不在这个技能里手工拼，创建完就继续交给 `grix-admin`
- 如果要写 `SOUL.md` 或覆盖已有 Hermes agent，继续交给 `grix-egg`

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
- [Handoff To grix-admin](references/handoff-contract.md)
