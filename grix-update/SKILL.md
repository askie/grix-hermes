---
name: grix-update
description: 需要检查或执行 OpenClaw 的 Grix 插件升级时使用。适用于手动维护或 cron 维护场景，只通过 `openclaw` 官方 CLI 完成检查、升级、校验、可选重启和健康检查。
---

# Grix Update

这个技能只做 OpenClaw 运维。

## 输入

建议把输入理解成：

- `mode`: `check-only` / `apply-update` / `check-and-apply`
- `plugin_id`: 默认 `grix`
- `allow_restart`: 默认 `true`

## 执行顺序

优先使用 helper：

```bash
python3 scripts/grix_update.py --mode check-and-apply --plugin-id grix --allow-restart true --json
```

它内部会按当前 OpenClaw CLI 真实命令执行：

1. `openclaw plugins inspect <plugin_id> --json`
2. `openclaw plugins update <plugin_id> --dry-run`
3. 按模式决定是否真正升级
4. 升级后执行：
   - `openclaw plugins doctor`
   - `openclaw gateway restart`（仅在允许时）
   - `openclaw health --json`

## Guardrails

- 不要改用非官方脚本
- 如果 `allow_restart=false`，明确告诉上层运行态可能还是旧版本
- 如果没有明确通知目标，不要自行猜消息发送目标

## 推荐 cron 接法

```text
Use the grix-update skill with {"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}
```

## 参考

- [Cron Setup](references/cron-setup.md)
