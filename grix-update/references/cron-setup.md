# Cron Setup

`grix-hermes install` 会自动创建每日更新 cron job（名称 `grix-hermes-daily-update`，每天 06:00），无需手动配置。

自动创建逻辑：
- install 完成后调用 `hermes cron add`
- 先查 `hermes cron list`，同名 job 已存在则跳过
- `hermes` 不在 PATH 或命令失败时降级为提示，不影响 install

如果自动创建未生效（比如 install 时用了 `--skip-cron`），可以手动让上层 cron 直接调用这个技能：

```json
{"install_dir":"~/.hermes/skills/grix-hermes"}
```

技能会自动执行 `npm update -g` → 重新 install 到目标目录。

如果 cron 自己负责通知，技能侧不要再猜消息目标。

成功输出包含 `version_before` 和 `version_after`，cron 可据此判断是否有版本变化。
