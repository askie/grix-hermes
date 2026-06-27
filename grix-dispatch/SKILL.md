---
name: grix-dispatch
description: 程序优先的 Grix 任务派发技能。AI 只负责把派发意图整理成标准参数，再调用脚本把任务派给主人名下的另一个 agent。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, dispatch, agent, task, delegation]
    related_skills: [grix-admin, grix-query, message-send]
---

# Grix Dispatch

`grix-dispatch` 的唯一入口是：

```bash
node scripts/dispatch.js ... --json
```

把一项任务派给主人名下的另一个 agent，在指定工作目录里执行。后端会**为每次派发新建一条独立的主人↔目标 agent 私聊**（不复用历史会话），并以主人身份把任务发进去，目标 agent 收到即开工。

## 1. 标准入参

```bash
node scripts/dispatch.js \
  --agent-id "<TARGET_AGENT_ID>" \
  --cwd "/abs/path/to/workdir" \
  --task "<以主人第一人称写的任务>" \
  --title "<一句话任务标题>"
```

规则：

- `--agent-id` 必填，目标 agent 的数字 ID。
- `--cwd` 必填，绝对路径的工作目录；目标为 claude/codex 等需要绑定目录的 agent 时由后端绑定。
- `--task` 必填，任务正文。任务是**以主人身份**发进会话的，所以要用主人第一人称口吻写（"帮我…"、"你去…"），不要写成第三方转述。
- `--title` 可选，概括任务核心的一句话，作为新会话标题；不传时后端自动取任务首行生成标题。

## 2. 返回

脚本输出 JSON，关键字段：

- `data.session_id`：本次派发新建的会话 ID。
- `data.msg_id`：任务消息 ID。
- `data.mode`：`prompt`（openclaw/hermes 目标）或 `binding`（claude/codex 等目标）。

## 3. 约束

- 只能派发**主人名下**且状态可用的 agent；目标不属于主人会被拒（4003）。
- 每次调用只派发一项任务，不要把多项任务塞进一次调用。
- 绑定类目标（claude/codex）若目录绑定超时会返回 4290，此时任务不会发出，按需重试。
