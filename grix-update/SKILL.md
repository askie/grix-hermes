---
name: grix-update
description: 需要检查或执行 `grix-hermes` 技能包升级时使用。通过 `npm update -g` 拉最新版，再重新 install 到 Hermes skills 目录。适用于手动维护或 Hermes cron 维护场景。
---

# Grix Update

这个技能只做 `grix-hermes` 技能包升级。基于 npm 全局包更新，不依赖 git。

## 执行方式

```bash
node scripts/grix_update.js [options]
```

## 完整参数

```bash
node scripts/grix_update.js \
  --install-dir ~/.hermes/skills/grix-hermes \
  --npm npm \
  --node node \
  --dry-run \
  --json
```

- `--install-dir`：目标安装目录，默认 `~/.hermes/skills/grix-hermes`
- `--npm`：npm 可执行文件路径（默认 `npm`）
- `--node`：node 可执行文件路径（默认 `node`）
- `--dry-run`：只输出计划不执行
- `--json`：JSON 格式输出

## 执行顺序

1. `npm update -g @dhf-hermes/grix` — 拉最新版到全局 node_modules
2. `npm root -g` — 拿到全局包路径
3. `node <全局包>/bin/grix-hermes.js install --dest <INSTALL_DIR> --force` — 重新安装到 skills 目录

## 输出

成功时返回 `version_before` 和 `version_after`，便于 cron 判断是否有变化。

## Guardrails

- 不要猜测安装目录，不确定时用默认值或显式传 `--install-dir`
- 不要把 Hermes `skills.external_dirs` 指回 npm 全局目录或源码仓库

## 推荐 cron 接法

```text
Use the grix-update skill with {"install_dir":"~/.hermes/skills/grix-hermes"}
```

## 参考

- [Cron Setup](references/cron-setup.md)
