---
name: grix-egg
description: 程序优先的 Hermes agent 孵化技能。AI 只负责把自然语言整理成标准参数，再调用 bootstrap 程序完成整条链路。
version: 2.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, egg, bootstrap, agent-creation, profile-binding]
    related_skills: [grix-admin, grix-register, message-send]
---

# Grix Egg

`grix-egg` 的唯一执行主线是：

```bash
node scripts/bootstrap.js ... --json
```

这个技能现在按“程序为主，AI 为辅”使用：

- 程序负责完整执行：探测、安装、创建或接管、绑定、写 SOUL、启动 gateway、验收、落 checkpoint
- AI 只负责两件事：
  - 把用户自然语言整理成标准参数
  - 读取程序 JSON 结果，决定如何向用户汇报或补问缺失的外部信息

不要让 AI 在中途手动接管 create / bind / gateway / accept。除非你是在修 `grix-egg` 本身，否则不要把中间步骤拆开跑。

## 1. 程序主线

`bootstrap.js` 固定按这条顺序推进：

1. `detect`
   - `--route existing` 时直接走已有凭证绑定
   - 否则先尝试复用当前 Hermes / Grix 宿主会话
   - 宿主会话不存在时，若提供 `--access-token`，再走 HTTP 创建
2. `install`
   - 安装或刷新本地 `grix-hermes` bundle
3. `create`
   - `host`：调用宿主 Grix create 能力
   - `http`：调用 HTTP create-and-bind
   - `existing`：跳过创建，直接读取已有凭证
4. `bind`
   - 把远端 agent 绑定到本地 Hermes profile
5. `soul`
   - 有 `--soul-content` 或 `--soul-file` 时写入 `SOUL.md`
6. `gateway`
   - 启动并确认 Hermes gateway 在线
7. `accept`
   - 必做
   - 默认验收参数：
     - `--probe-message probe`
     - `--expected-substring identity-ok`
8. 输出 JSON
   - 成功：stdout
   - 失败：stderr，并带 `step / reason / suggestion / state_file / resume_command`

## 2. 首次入参数

这里的“首次入参”指 AI 从用户自然语言里整理出来、第一次交给程序的标准参数。

### 2.1 新建 agent：`create_new`

默认 `--route create_new`，可以省略。

必填：

- `--agent-name`

可选业务参数：

- `--soul-content`
- `--soul-file`
- `--category-name`
- `--is-main true|false`
- `--allowed-users`
- `--allow-all-users true|false`
- `--home-channel`
- `--home-channel-name`
- `--status-target`
- `--probe-message`
- `--expected-substring`
- `--member-ids`
- `--member-types`

可选环境参数：

- `--access-token`
  - 只有当前 Hermes / Grix 宿主会话不可复用时才需要
- `--profile-name`
  - 只有调用方想固定本地 profile 名时才需要
  - 省略时程序自动处理：
    - agent 名合法时直接复用 agent 名
    - agent 名不合法时自动生成 ASCII-safe profile 名
- `--install-dir`
- `--hermes-home`
- `--hermes`
- `--node`

不再作为 fresh run 首次入参：

- `--install-id`
  - fresh run 省略即可
  - 程序自动生成
  - 只有 `--resume` 时才需要显式传入

### 2.2 绑定已有 agent：`existing`

必填：

- `--route existing`
- `--agent-name`
- 以下二选一：
  - `--bind-json <FILE>`
  - `--agent-id <ID> --api-endpoint <URL> --api-key <KEY>`

可选：

- 与 `create_new` 相同的 SOUL、验收、权限、runtime override 参数

### 2.3 继续上次失败任务：`resume`

必填：

- `--resume`
- `--install-id`
- `--agent-name`

可选：

- `--profile-name`
- 其他需要覆盖的首次入参

## 3. 过程参数

下面这些是程序内部推进时自己生成、自己传递、或作为结果产出的参数。AI 不应该在 fresh run 前先向用户索要它们：

- `install_id`
- `route` 的实际落点：`host` / `http` / `existing`
- create 步返回的远端凭证：
  - `agent_id`
  - `api_endpoint`
  - `api_key`
- 本地路径：
  - `profile_dir`
  - `env_path`
  - `config_path`
  - `state_file`
- 验收过程数据：
  - `session_id`
  - `probe_message_id`
  - `reply_msg_id`
  - `reply_sender_id`
- 故障恢复信息：
  - `resume_command`
  - `backup_dir`

这些都应由 `bootstrap.js` 负责生成、持有和传递，而不是让 AI 在中途接手拼装。

## 4. AI 只参与哪些环节

### 4.1 参数整理

AI 可以把自然语言转换为标准参数，例如：

- “创建一个叫雪碧的 agent，用这段人格，启动后做一次自测”
  - `--agent-name 雪碧`
  - `--soul-content ...`
  - 其余保持默认
- “没有宿主会话，用这个 token 创建”
  - 在上面基础上补 `--access-token`
- “把这个已有 agent 接到本地”
  - `--route existing`
  - `--bind-json` 或显式凭证

### 4.2 结果判读

程序跑完后，AI 可以读取 JSON 结果并判断如何对用户表达：

- `ok: true`
  - 汇报成功
  - 告知 `agent_name`、`profile_name`
  - 需要恢复任务时再补充 `install_id`
- `ok: false`
  - 读取 `step / reason / suggestion`
  - 只围绕程序明确缺失的外部条件继续追问

### 4.3 语义验收

如果用户要的不是简单字符串命中，而是“回复质量是否像某种风格”这类语义判断：

- 程序仍先完成标准验收
- AI 再基于程序返回的消息历史或回复内容做补充判断

## 5. 哪些场景必须有人参与

只有下面这些场景，程序本身无法闭环，需要 AI 或用户继续参与：

- 用户还没提供必要外部信息：
  - 邮箱 / 密码
  - `access_token`
  - 已有 agent 凭证
- 当前环境没有可用宿主 create 能力，且 HTTP 条件也不满足
- 用户要做非程序默认的业务判断：
  - 是否复用现有 profile
  - 是否替换已有 agent
  - 是否接受语义上“差不多”的回复

除此之外，默认都应直接调用程序，不要把中间过程变成人工接力。

## 6. 标准调用模板

### 6.1 fresh run 最小调用

```bash
node scripts/bootstrap.js \
  --agent-name "<AGENT_NAME>" \
  --json
```

### 6.2 fresh run + SOUL

```bash
node scripts/bootstrap.js \
  --agent-name "<AGENT_NAME>" \
  --soul-file "<SOUL_FILE>" \
  --json
```

### 6.3 fresh run + HTTP token

```bash
node scripts/bootstrap.js \
  --agent-name "<AGENT_NAME>" \
  --access-token "<ACCESS_TOKEN>" \
  --json
```

### 6.4 existing bind

```bash
node scripts/bootstrap.js \
  --route existing \
  --agent-name "<AGENT_NAME>" \
  --bind-json "<BIND_JSON_FILE>" \
  --json
```

### 6.5 resume

```bash
node scripts/bootstrap.js \
  --install-id "<INSTALL_ID>" \
  --agent-name "<AGENT_NAME>" \
  --resume \
  --json
```

## 7. 调试边界

下面这些脚本是 `bootstrap.js` 的子步骤，不是正常主入口：

- `scripts/bind_local.js`
- `scripts/start_gateway.js`
- `../grix-admin/scripts/admin.js`
- `../grix-register/scripts/create_api_agent_and_bind.js`

只有在修技能本身时，才单独运行它们。正常使用只走 `bootstrap.js`。
