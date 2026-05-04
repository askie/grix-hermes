---
name: grix-update
description: 检查并执行 `grix-hermes` 技能包升级。通过 npm 全局包更新后重新安装到 Hermes skills 目录，支持手动维护和 Hermes cron 维护。
version: 1.0.0
author: askie
license: MIT
metadata:
  hermes:
    tags: [grix, update, npm, upgrade, maintenance]
    related_skills: [grix-egg]
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

## 发布 / npm 认证注意事项（新）

如果是在 Hermes profile 内执行 `npm whoami`、`npm login`、`publish_npm.sh` 或 `publish.sh --publish`，先确认当前进程看到的 `HOME` 不是被 profile 重定向后的隔离目录。否则即使真实机器已经登录过 npm，这个会话里仍可能表现为：

- `npm whoami` 报 `ENEEDAUTH`
- `publish_npm.sh --publish` 报 `npm auth missing`
- 当前 profile 下看不到 `~/.npmrc`

对这个用户当前机器，稳妥做法是显式切回真实 HOME 再做 npm 认证/发布：

```bash
HOME=/Users/gcf npm whoami
HOME=/Users/gcf npm login
HOME=/Users/gcf bash ./scripts/publish_npm.sh --publish --version <x.y.z> --confirm-package @dhf-hermes/grix@<x.y.z> --confirm-tarball dhf-hermes-grix-<x.y.z>.tgz
```

如果 `--preview` 已通过，而 `--publish` 只失败在 npm auth，这通常说明：

1. 代码/测试/打包流程本身没问题
2. 阻塞点只是当前运行环境读不到真实 `~/.npmrc`
3. 应先修正 `HOME` 或补 npm token，而不是继续改发布脚本

补充参考：
- `references/npm-publish-auth-under-hermes-home.md`：Hermes profile HOME 重定向导致 npm publish 读不到真实凭证时的判读与恢复路径

## 参考

- [Cron Setup](references/cron-setup.md)
- [NPM Publish Auth under Hermes HOME](references/npm-publish-auth-under-hermes-home.md)

