---
name: grix-update
description: 需要检查或执行 `grix-hermes` 技能包升级时使用。适用于手动维护或 Hermes cron 维护场景，主线围绕发布包来源仓库和 Hermes 安装目录完成检查、拉取、依赖刷新、重新安装。
---

# Grix Update

这个技能只做 `grix-hermes` 技能包升级。

## 执行方式

```bash
node scripts/grix_update.js [options]
```

## 完整参数

```bash
node scripts/grix_update.js \
  --mode check-and-apply \
  --repo-root /path/to/grix-hermes \
  --install-dir ~/.hermes/skills/grix-hermes \
  --allow-dirty true|false \
  --git git \
  --npm npm \
  --node node \
  --dry-run \
  --json
```

- `--mode`：`check-only` / `apply-update` / `check-and-apply`（默认 `check-and-apply`）
- `--repo-root`：grix-hermes 仓库根目录
- `--install-dir`：目标安装目录，默认 `~/.hermes/skills/grix-hermes`
- `--allow-dirty`：`true` / `false`（默认 `false`）。允许工作树有未提交变更时继续升级
- `--git`：git 可执行文件路径（默认 `git`）
- `--npm`：npm 可执行文件路径（默认 `npm`）
- `--node`：node 可执行文件路径（默认 `node`）
- `--dry-run`：只输出计划不执行
- `--json`：JSON 格式输出

## 执行顺序

1. 检查仓库是否是 git checkout
2. 检查分支、upstream、工作树是否干净
3. 需要时执行 `git fetch --prune`
4. 按模式决定是否真正 `git pull --ff-only`
5. 拉取后执行 `npm install`
6. 执行：
   - `node ./bin/grix-hermes.js install --dest <INSTALL_DIR> --force`

## Guardrails

- 工作树不干净时，默认停止，不自动升级。需要时传 `--allow-dirty true`
- 不要猜测源仓库路径或目标安装目录
- 不要把 Hermes `skills.external_dirs` 指回本地源码仓库
- cron 场景要把 `repo_root` 明确写死

## 推荐 cron 接法

```text
Use the grix-update skill with {"mode":"check-and-apply","repo_root":"/path/to/grix-hermes","install_dir":"~/.hermes/skills/grix-hermes","allow_dirty":false}
```

## 参考

- [Cron Setup](references/cron-setup.md)
