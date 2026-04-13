# Cron Setup

如果你要把 `grix-update` 接到定时任务，推荐让上层 cron 直接调用这个技能，而不是把升级逻辑散在多个地方。

建议输入：

```json
{"mode":"check-and-apply","repo_root":"/path/to/grix-hermes","install_dir":"~/.hermes/skills/grix-hermes","allow_dirty":false}
```

如果 cron 自己负责通知，技能侧不要再猜消息目标。
