---
name: grix-update
description: 需要检查或执行 `grix-hermes` 技能包升级时使用。适用于手动维护或 Hermes cron 维护场景，主线围绕发布包来源仓库和 Hermes 安装目录完成检查、拉取、依赖刷新、重新安装。
---

# Grix Update

这个技能只做 `grix-hermes` 技能包升级。

## 输入

建议把输入理解成：

- `mode`: `check-only` / `apply-update` / `check-and-apply`
- `repo_root`: 用来产出发布包的 `grix-hermes` 仓库根目录
- `install_dir`: 可选。默认 `~/.hermes/skills/grix-hermes`
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
6. 执行：
   - `node ./bin/grix-hermes.mjs install --dest <INSTALL_DIR> --force`

## Guardrails

- 工作树不干净时，默认停止，不自动升级
- 不要猜测源仓库路径或目标安装目录
- 不要把 Hermes `skills.external_dirs` 指回本地源码仓库
- cron 场景要把 `repo_root` 明确写死

## 推荐 cron 接法

```text
Use the grix-update skill with {"mode":"check-and-apply","repo_root":"/path/to/grix-hermes","install_dir":"~/.hermes/skills/grix-hermes","allow_dirty":false}
```

## 参考

- [Cron Setup](references/cron-setup.md)
