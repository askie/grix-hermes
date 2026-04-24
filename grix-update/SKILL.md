---
name: grix-update
description: 检查并执行 `grix-hermes` 技能包升级。通过 npm 全局包更新后重新安装到 Hermes skills 目录，支持手动维护和 Hermes cron 维护。
---

# Grix Update

这个技能提供 `grix-hermes` 技能包升级能力。

## 执行方式

```bash
node scripts/grix_update.js \
  --install-dir ~/.hermes/skills/grix-hermes \
  --npm npm \
  --node node \
  --dry-run \
  --json
```

## 参数

- `--install-dir`：目标安装目录，默认 `~/.hermes/skills/grix-hermes`
- `--npm`：npm 可执行文件路径，默认 `npm`
- `--node`：node 可执行文件路径，默认 `node`
- `--dry-run`：输出升级计划
- `--json`：JSON 输出

## 执行顺序

1. `npm update -g @dhf-hermes/grix`
2. `npm root -g`
3. `node <全局包>/bin/grix-hermes.js install --dest <INSTALL_DIR> --force`

## 输出

- `version_before`
- `version_after`
- 安装目录
- 命令执行日志

## 自动 Cron

`grix-hermes install` 会通过 `hermes cron add` 创建每日更新任务：

- 名称：`grix-hermes-daily-update`
- 时间：每天 06:00
- 幂等检查：先查 `hermes cron list`
- `--skip-cron`：跳过 cron 创建
- `--hermes <path>`：指定 hermes 可执行文件路径

推荐 cron prompt：

```text
Use the grix-update skill with {"install_dir":"~/.hermes/skills/grix-hermes"}
```

## 参考

- [Cron Setup](references/cron-setup.md)
