---
name: grix-admin
description: 需要创建远端 Grix API agent、管理分类、并把结果绑定到本地 Hermes profile 时使用。适用于首个 agent 绑定、后续创建并绑定 agent、分类管理。远端步骤通过 `../shared/cli/grix-hermes.js admin`，本地步骤通过 Hermes profile 机制完成。
---

# Grix Admin

这个技能负责两件事：

1. 远端 Grix agent / 分类管理
2. 本地 Hermes profile 绑定和校验

## Mode A: bind-hermes

当上下文已经给出：

- `agent_name`
- `agent_id`
- `api_endpoint`
- `api_key`

就直接做本地绑定，不做远端创建。

### 本地绑定主线

1. 确认目标 `profile_name`
   - 默认等于 `agent_name`
2. 如果目标 profile 不存在，先创建：
   - `hermes profile create <PROFILE_NAME> --clone`
   - 如需从特定 profile 复制基线，补 `--clone-from <SOURCE>`
3. 写入目标 profile 的 `.env`
   - `GRIX_ENDPOINT`
   - `GRIX_AGENT_ID`
   - `GRIX_API_KEY`
   - 可选：`GRIX_ACCOUNT_ID`
   - 如有需要，再补 `GRIX_ALLOWED_USERS` / `GRIX_ALLOW_ALL_USERS`
   - 如有需要，再补 `GRIX_HOME_CHANNEL`
4. 确保目标 profile 的 `config.yaml` 里 `skills.external_dirs` 包含已安装的 `grix-hermes` 目录
   - 默认安装目录：`~/.hermes/skills/grix-hermes`
   - 主 agent：移除 `grix-admin`、`grix-register`、`grix-update`、`grix-egg` 的默认禁用
   - 其他 agent：默认把这 4 个管理类技能写进 `skills.disabled`
5. 校验：
   - 目标 profile 目录存在
   - `.env` 里绑定值正确
   - `config.yaml` 里能扫到安装后的技能目录

优先用 helper：

```bash
node scripts/bind_local.js \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --is-main true|false \
  --profile-name <PROFILE_NAME> \
  --install-dir ~/.hermes/skills/grix-hermes \
  --allowed-users <USER_1,USER_2> \
  --home-channel <SESSION_ID> \
  --json
```

规则：

- 新建 profile 时，如果没显式传 `--is-main true`，默认按“其他 agent”处理
- 已存在 profile 时，如果没显式传 `--is-main`，默认保留原有技能禁用状态
- 这条默认策略只管理 `grix-admin`、`grix-register`、`grix-update`、`grix-egg`，不动你其他自定义禁用项

### 边界

- `SOUL.md` 的安装或覆盖不在这里做，交给 `grix-egg`
- 不要手工拼接另一套本地 agent 结构
- 不要在这里顺手安装或升级整个技能包

## Mode B: create-and-bind

如果还没有远端 agent，就先创建。

### 远端创建

通过 `terminal` 执行：

```bash
node scripts/admin.js --action create_grix --agent-name <NAME> [--introduction ...] [--is-main true|false]
```

如果需要分类：

```bash
node scripts/admin.js --action create_grix --agent-name <NAME> --category-id <ID>
node scripts/admin.js --action create_grix --agent-name <NAME> --category-name <NAME> --parent-category-id 0
```

创建成功后，拿返回里的 `id` / `agent_name` / `api_endpoint` / `api_key`，继续走 Hermes 绑定 helper：

```bash
node scripts/bind_local.js \
  --agent-name <AGENT_NAME> \
  --agent-id <AGENT_ID> \
  --api-endpoint <WS_URL> \
  --api-key <API_KEY> \
  --is-main true|false \
  --profile-name <PROFILE_NAME> \
  --json
```

如果已经拿到一份远端创建结果 JSON，可以用 `--from-json` 直接交给绑定脚本：

```bash
node scripts/bind_local.js \
  --from-json - \
  --profile-name <PROFILE_NAME> \
  --is-main true|false \
  --dry-run \
  --json < result.json
```

## Mode C: category-manage

分类相关动作统一走：

```bash
node scripts/admin.js --action list_categories
node scripts/admin.js --action create_category --name <NAME> --parent-id 0
node scripts/admin.js --action update_category --category-id <ID> --name <NAME> --parent-id 0
node scripts/admin.js --action assign_category --agent-id <AGENT_ID> --category-id <CATEGORY_ID>
```

## Guardrails

- 远端动作不要改走 HTTP
- `create_grix` 表示“创建远端 Grix API agent”，不要把它理解成创建本地 Hermes agent
- 首个远端 API agent 优先走 `grix-register`；`grix-admin create_grix` 更适合已有 Grix 运行时凭证的环境
- 本地绑定只走 Hermes `profile`、`.env`、`config.yaml`
- 除非上层明确要求覆盖，不要破坏已存在的 profile 身份文件
- 安装私聊进行中时，不要主动重启 gateway
- 当前实现只维护一组 `GRIX_*` 凭证；一个 Hermes profile 只对应一组 Grix 身份

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
