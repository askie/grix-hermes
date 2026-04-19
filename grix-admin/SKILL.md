---
name: grix-admin
description: 需要创建远端 Grix API agent、管理分类、并把结果绑定到本地 Hermes profile 时使用。适用于首个 agent 绑定、后续创建并绑定 agent、分类管理。远端步骤通过 `../shared/cli/grix-hermes.js admin`，本地步骤通过 Hermes profile 机制完成。
---

# Grix Admin

这个技能负责三件事：

1. 远端 Grix agent / 分类管理
2. 远端 agent 创建后自动将密钥写入 `.env`（不再输出明文密钥）
3. 本地 Hermes profile 绑定和校验

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
   - 如有需要，再补 `GRIX_HOME_CHANNEL` / `GRIX_HOME_CHANNEL_NAME`
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
  --profile-mode create-or-reuse \
  --install-dir ~/.hermes/skills/grix-hermes \
  --clone-from <SOURCE_PROFILE> \
  --inherit-keys global \
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

### 管理策略

bind_local 根据 profile 是否已存在和 `--is-main` 值决定技能可见性策略：

| 条件 | 策略 | 效果 |
|------|------|------|
| `--is-main true` | `main` | 移除 4 个管理类技能的禁用 |
| `--is-main false` | `restricted` | 禁用 4 个管理类技能 |
| 不传 `--is-main` + profile 已存在 | `preserve` | 保留原有技能禁用状态不变 |
| 不传 `--is-main` + profile 不存在 | `restricted` | 禁用 4 个管理类技能 |

策略只影响 `grix-admin`、`grix-register`、`grix-update`、`grix-egg`，不动其他自定义禁用项。

### --inherit-keys

在写入 GRIX 参数后，从源 profile 或全局 `.env` 继承 LLM provider 密钥到目标 profile 的 `.env`。

- `global`（或 `true`）：从全局 `~/.hermes/.env` 继承
- `<profile_name>`：从指定 profile 的 `.env` 继承
- 不传：不继承

继承范围：匹配 `*_API_KEY`、`*_BASE_URL`、`*_MODEL`、`*_URL` 模式的环境变量，排除 `GRIX_` 前缀和包含 `***` 的遮掩值。

**使用场景**：`hermes profile create --clone` 会把 `.env` 中的密钥以遮掩值写入新 profile。绑定完成后用 `--inherit-keys global` 把 LLM provider 密钥从全局 `.env` 正确写入目标 profile，确保 gateway 启动后 LLM 调用正常。

### --profile-mode

- `create-or-reuse`（默认）：不存在就创建，已存在就复用
- `create`：只创建新 profile，已存在时报错
- `reuse`：只复用已有 profile，不存在时报错

### --from-json

可以从 JSON 里提取绑定字段，支持 4 种 JSON 结构：

1. `grix_auth create-api-agent` 返回的 `handoff.bind_hermes` 结构
2. `handoff.bind_local` 结构
3. `admin create_grix` 返回的 `createdAgent` 结构
4. 扁平的 `agent_name` / `agent_id` / `api_endpoint` / `api_key` 结构

```bash
node scripts/bind_local.js \
  --from-json - \
  --profile-name <PROFILE_NAME> \
  --is-main true|false \
  --dry-run \
  --json < result.json
```

CLI 显式传入的参数优先于 JSON 中提取的字段。

### 边界

- `SOUL.md` 的安装或覆盖不在这里做，交给 `grix-egg`
- 不要手工拼接另一套本地 agent 结构
- 不要在这里顺手安装或升级整个技能包

## Mode B: create-and-bind

如果还没有远端 agent，就先创建。

### 远端创建

通过 `terminal` 执行：

```bash
node scripts/admin.js --action create_grix --agent-name <NAME> [--introduction ...] [--is-main true|false] --env-file ~/.hermes/profiles/<PROFILE>/config.env
```

如果需要分类：

```bash
node scripts/admin.js --action create_grix --agent-name <NAME> --category-id <ID> --env-file ~/.hermes/profiles/<PROFILE>/config.env
node scripts/admin.js --action create_grix --agent-name <NAME> --category-name <NAME> --parent-category-id 0 --env-file ~/.hermes/profiles/<PROFILE>/config.env
```

`--category-id` 和 `--category-name` 互斥，不能同时传。传 `--category-name` 时，如果分类不存在会自动创建。

**`--env-file` 是必填参数**，指定目标 profile 的 `.env` 绝对路径。创建成功后，密钥会直接写入该文件，**不会输出明文密钥到 stdout**。stdout 只返回：
- `createdAgent`（密钥已脱敏为 `***`）
- `configHermes`：包含 `envFile`（已写入的 .env 路径）、`tempKeyFile`（临时密钥备份文件路径）、`message`

临时密钥文件位于 `~/.hermes/tmp/grix-key-<timestamp>.tmp`，包含完整的连接参数，供排查问题使用。调用方应及时读取并清理。

如果不传 `--env-file`，行为与之前一致（密钥明文输出到 stdout），仅用于向后兼容。

创建成功后，密钥已写入 `.env`，继续走 Hermes 绑定 helper：

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

## Mode C: config-hermes

单独将密钥写入指定 `.env` 文件（不走远端创建，只做本地配置）。

```bash
node scripts/admin.js --action config_hermes --env-file ~/.hermes/profiles/<PROFILE>/config.env --agent-id <AGENT_ID> --to <API_ENDPOINT> --message <API_KEY>
```

必填参数：
- `--env-file`：目标 `.env` 文件绝对路径
- `--agent-id`：Grix agent ID
- `--to`：API endpoint（wss://...）
- `--message`：API key（明文，仅用于写入文件，不输出到 stdout）

写入后 stdout 返回：
- `envFile`：已写入的 .env 路径
- `tempKeyFile`：临时密钥备份文件路径
- `message`：配置成功提示文本

## Mode D: category-manage

分类相关动作统一走：

```bash
node scripts/admin.js --action list_categories
node scripts/admin.js --action create_category --name <NAME> --parent-id 0
node scripts/admin.js --action update_category --category-id <ID> --name <NAME> --parent-id 0
node scripts/admin.js --action assign_category --agent-id <AGENT_ID> --category-id <CATEGORY_ID>
```

## Guardrails

- 远端动作不要改走 HTTP
- `create_grix` 表示"创建远端 Grix API agent"，不要把它理解成创建本地 Hermes agent
- `create_grix` 传了 `--env-file` 时，密钥直接写入文件，不输出明文到 stdout；不传则向后兼容输出明文
- 不要将明文 API key 输出到聊天窗口或日志，密钥只应出现在 `.env` 文件和临时备份文件中
- 当前执行环境已有 Grix WS 运行时凭证（`GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY`）时，创建远端 agent **必须走 `grix-admin`**，不要走 `grix-register`。只有没有 WS 凭证的新环境才需要 `grix-register`
- 本地绑定只走 Hermes `profile`、`.env`、`config.yaml`
- 除非上层明确要求覆盖，不要破坏已存在的 profile 身份文件
- 安装私聊进行中时，不要主动重启 gateway
- 当前实现只维护一组 `GRIX_*` 凭证；一个 Hermes profile 只对应一组 Grix 身份
- `bind_local` 会校验 `--api-key` 格式：遮掩值（如 `ak_204...CUBH`）直接报错阻止执行，非标准格式发出警告但不阻止

## 参考

- [Hermes Grix Runtime](../shared/references/hermes-grix-config.md)
