---
name: grix-update
description: 需要检查或执行 `grix-hermes` 技能包升级时使用。适用于手动维护或 Hermes cron 维护场景，主线围绕当前仓库和目标安装目录完成检查、拉取、依赖刷新、可选重装。
---

# Grix Update

这个技能只做 `grix-hermes` 技能包升级。

## 输入

建议把输入理解成：

- `mode`: `check-only` / `apply-update` / `check-and-apply`
- `repo_root`: 当前 `grix-hermes` 仓库根目录
- `install_dir`: 可选。只有你用了复制安装模式时才需要
- `allow_dirty`: 默认 `false`

## 执行顺序

优先使用 helper：

```bash
python3 scripts/grix_update.py \
  --mode check-and-apply \
  --repo-root /path/to/grix-hermes \
  --install-dir ~/.hermes/skills/grix-hermes \
  --json
```

它内部会按当前 Hermes 技能包主线执行：

1. 检查仓库是否是 git checkout
2. 检查分支、upstream、工作树是否干净
3. 需要时执行 `git fetch --prune`
4. 按模式决定是否真正 `git pull --ff-only`
5. 拉取后执行 `npm install`
6. 如果给了 `install_dir`，再执行：
   - `node ./bin/grix-hermes.mjs install --dest <INSTALL_DIR> --force`

## 什么时候需要 `install_dir`

- 如果 Hermes 通过 `skills.external_dirs` 直接映射当前仓库：
  - 通常不需要 `install_dir`
- 如果 Hermes 用的是复制安装目录：
  - 需要明确给出 `install_dir`

## Guardrails

- 工作树不干净时，默认停止，不自动升级
- 不要猜测源仓库路径或目标安装目录
- cron 场景要把 `repo_root` 明确写死
- 如果只是开发映射目录模式，不要额外重复安装

## 推荐 cron 接法

```text
Use the grix-update skill with {"mode":"check-and-apply","repo_root":"/path/to/grix-hermes","install_dir":"~/.hermes/skills/grix-hermes","allow_dirty":false}
```

## 参考

- [Cron Setup](references/cron-setup.md)
