---
name: grix-egg
description: 在 Grix 安装私聊里孵化新 agent 时使用。运行一个命令完成从创建远端 agent 到验收测试的全流程，支持断点续传。
---

# Grix Egg

一行命令完成 agent 孵化：

```bash
node scripts/bootstrap.js \
  --install-id <INSTALL_ID> \
  --agent-name <AGENT_NAME> \
  --soul-content "人格文本内容" \
  --status-target <SESSION_ID> \
  --json
```

## 入口说明

- **`bootstrap.js`** — 唯一推荐入口，扁平 CLI 参数，自动检测路径，内置断点续传
- `install_flow.js`、`validate_install_context.js`、`verify_acceptance.js` — 内部工具，由 bootstrap 内部调用，不需要直接使用
- 如需精细控制（直接绑定已有凭证、自定义验收配置），详见 [Legacy Skill 文档](references/legacy-skill.md)

## 必填参数

| 参数 | 说明 |
|------|------|
| `--install-id` | 安装实例 ID。使用当前安装上下文中的唯一标识符（如对话中收到的 install_id 值）。如果上下文中没有提供，生成一个随机唯一字符串即可（如 `egg-` + 随机 8 位 hex） |
| `--agent-name` | Agent 名称（同时用作 profile 名，除非通过 `--profile-name` 覆盖） |

## 常用可选参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--soul-content` | - | SOUL.md 内容字符串。内容包含引号、换行、特殊字符时，优先改用 `--soul-file`（先将内容写入临时文件再引用） |
| `--soul-file` | - | SOUL.md 文件路径（与 `--soul-content` 二选一） |
| `--status-target` | - | 状态卡片投递的目标 session_id，即当前安装私聊的 session_id。从安装上下文或对话环境中获取 |
| `--probe-message` | - | 验收探针消息（如 "你是谁"）。**同时需要提供 `--expected-substring`**，两者都提供才触发验收；都不提供则跳过验收 |
| `--expected-substring` | - | 验收预期回复子串（如 "我是"）。与 `--probe-message` 配合使用 |
| `--member-ids` | - | 验收群成员 ID，逗号分隔 |
| `--access-token` | 自动检测 | Grix HTTP access token（无 WS 凭证时必填） |
| `--is-main` | `true` | 是否主 agent |
| `--route` | `create_new` | `create_new`（从零新建 agent）或 `existing`（安装到已有 agent，覆盖 SOUL.md 和配置，自动备份旧文件到 `~/.hermes/backups/grix-egg/`） |
| `--profile-name` | = agent-name | 覆盖 profile 名 |
| `--resume` | - | 从上次断点继续（使用相同的 `--install-id` 即可恢复） |
| `--dry-run` | - | 只输出计划不执行 |

## 路径自动检测

脚本自动检测运行环境：
- 当前有 Grix WS 凭证（`GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY`）→ 自动走 WS 路径
- 没有 WS 凭证但提供了 `--access-token` → 走 HTTP 路径
- 都没有 → 输出错误，告诉你要提供什么

**你不需要关心走哪条路径。**

## 执行的 7 个步骤

1. **detect** — 检测环境（WS / HTTP）
2. **install** — 安装技能包
3. **create** — 创建远端 Grix agent
4. **bind** — 创建本地 profile 并绑定凭证
5. **soul** — 写入 SOUL.md（如未提供 soul 参数则跳过）
6. **gateway** — 启动 Hermes 网关
7. **accept** — 创建测试群 + 发送探针验收（需要 `--probe-message` + `--expected-substring` 都提供才执行）

每完成一步自动保存断点到 `~/.hermes/tmp/grix-egg-<install_id>.json`。

## 失败处理

失败时输出结构化 JSON：

```json
{
  "ok": false,
  "step": "create",
  "step_number": 3,
  "reason": "具体错误信息",
  "suggestion": "修复建议",
  "state_file": "~/.hermes/tmp/grix-egg-xxx.json",
  "resume_command": "node scripts/bootstrap.js --install-id xxx --agent-name 'X' --resume --json"
}
```

从断点继续：

```bash
node scripts/bootstrap.js --install-id <INSTALL_ID> --agent-name <AGENT_NAME> --resume --json
```

**处理方式**：读取 `suggestion` 字段，按建议修复后使用 `resume_command` 继续。不需要从头重跑。

## 成功后的输出

成功时输出：

```json
{
  "ok": true,
  "install_id": "...",
  "agent_name": "...",
  "profile_name": "...",
  "route": "create_new",
  "steps": {
    "detect": { "status": "done" },
    "install": { "status": "done" },
    "create": { "status": "done" },
    "bind": { "status": "done" },
    "soul": { "status": "done" },
    "gateway": { "status": "done" },
    "accept": { "status": "done" }
  }
}
```

收到 `ok: true` 后，向用户确认：agent 名称、profile 名称、验收是否通过（或有步骤显示 `skipped`）。

## 错误排查指南

| 步骤 | 可能原因 | 检查方向 |
|------|----------|----------|
| detect | 无 WS 凭证且无 token | 提供 `--access-token` 或在有 WS 凭证的环境运行 |
| create | agent 名已存在 | 用 `--route existing` 或换名 |
| create | 认证失败 | 检查 `GRIX_API_KEY` 或 `--access-token` |
| bind | API key 被遮掩 | 脚本已自动传 `--inherit-keys global`，检查全局 `.env` |
| gateway | 启动失败 | 检查 SOUL.md 和 `.env` 内容 |
| accept | 探针超时 | 检查 SOUL.md、网关状态、agent 在线 |

## 常见陷阱

### 陷阱 1：Hermes 全链路密钥脱敏

所有终端输出会将 API key 替换为遮掩值。读写 `.env` 中的密钥必须用二进制方式，不能经过终端输出中转。

### 陷阱 2：profile clone 导致 LLM key 变成字面 `***`

`hermes profile create --clone` 会将过滤后的遮掩值写入新 profile。`bootstrap.js` 已自动传 `--inherit-keys global` 从全局 `.env` 继承正确密钥。

## 独立验收工具

单独验证已有 agent 的身份回答（不需要重新跑整个孵化流程）：

```bash
node scripts/verify_acceptance.js --session-id <SESSION_ID> --probe-message "你是谁" --expected-substring "我是" --timeout 15 --json
```
