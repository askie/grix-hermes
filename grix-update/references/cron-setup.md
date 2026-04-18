# Cron Setup

如果你要把 `grix-update` 接到定时任务，推荐让上层 cron 直接调用这个技能。

建议输入：

```json
{"install_dir":"~/.hermes/skills/grix-hermes"}
```

技能会自动执行 `npm update -g` → 重新 install 到目标目录。

如果 cron 自己负责通知，技能侧不要再猜消息目标。

成功输出包含 `version_before` 和 `version_after`，cron 可据此判断是否有版本变化。
