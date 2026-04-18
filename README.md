---
name: grix-hermes
description: 当 Hermes 需要下载、安装并启用 grix-hermes 技能包时使用。目标是把整个 bundle 安装到 Hermes 技能目录，并让 Hermes 扫描到其中的 8 个技能目录。
---

# Grix Hermes

这是给 Hermes 读取的安装入口，不负责讲解各子技能的业务用法。

安装完成后，具体怎么使用各个技能，交给安装后的各个 `SKILL.md` 自己说明。

## 绝对规则

- 只给 Hermes 使用
- 不要把 Hermes `skills.external_dirs` 指向当前源码仓库
- 不要把 Hermes `skills.external_dirs` 指向 npm 全局目录

## 安装

### 自动安装（推荐）

一条命令完成下载、安装、配置 cron：

```bash
npx @dhf-hermes/grix install
```

自动安装会：
1. 通过 npm 下载最新版 `@dhf-hermes/grix`
2. 安装到 `~/.hermes/skills/grix-hermes`
3. 自动创建每日更新 cron job（`grix-hermes-daily-update`，每天 06:00）

安装完成后验证：

```bash
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js list
hermes skills list
```

### 手工安装

如果自动安装失败，按以下步骤手工操作。

#### 1. 准备 Hermes 目录

默认 `HERMES_HOME` 是：

```text
~/.hermes
```

默认安装目录是：

```text
~/.hermes/skills/grix-hermes
```

如果当前环境已经设置了 `HERMES_HOME`，下面所有 `~/.hermes` 都替换成对应值。

#### 2. 下载 npm 包到临时目录

```bash
tmp="$(mktemp -d)"
npm install --prefix "$tmp/prefix" @dhf-hermes/grix
```

下载完成后，安装包目录应位于：

```text
$tmp/prefix/node_modules/@dhf-hermes/grix
```

#### 3. 复制到 Hermes 技能目录

先确保目标目录存在，并且准备接收一份完整的新内容：

```bash
install_dir="${HERMES_HOME:-$HOME/.hermes}/skills/grix-hermes"
mkdir -p "$install_dir"
cp -R "$tmp/prefix/node_modules/@dhf-hermes/grix/." "$install_dir/"
```

要求：

- 如果 `install_dir` 里已有旧版本内容，先手工清空或替换成空目录，再复制，避免残留旧文件
- 复制整个包内容，不要只复制单个技能目录
- 保留 `bin`、`lib`、`shared`、8 个技能目录，以及包内自带的 `node_modules`
- 目标应是安装目录，不是源码目录

#### 4. 在 Hermes 配置里启用

编辑目标 Hermes 配置文件：

- 默认 profile：`~/.hermes/config.yaml`
- 命名 profile：`~/.hermes/profiles/<PROFILE_NAME>/config.yaml`

确保 `skills.external_dirs` 包含安装目录：

```yaml
skills:
  external_dirs:
    - ~/.hermes/skills/grix-hermes
```

如果 `skills.disabled` 里出现下面这些名字，移除它们，确保安装后都可用：

- `grix-admin`
- `grix-egg`
- `grix-group`
- `grix-query`
- `grix-register`
- `grix-update`
- `message-send`
- `message-unsend`

#### 5. 创建每日更新 cron job

```bash
hermes cron add --name grix-hermes-daily-update --skill grix-update "0 6 * * *" 'Use the grix-update skill with {"install_dir":"~/.hermes/skills/grix-hermes"}'
```

#### 6. 清理临时目录

```bash
rm -rf "$tmp"
```

## Included Skills

- `grix-admin`
- `grix-egg`
- `grix-group`
- `grix-query`
- `grix-register`
- `grix-update`
- `message-send`
- `message-unsend`

## Verify After Install

运行：

```bash
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js list
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js manifest
hermes skills list
```

成功标准：

- `list` 能列出 8 个技能
- `manifest` 能输出 `grix-hermes` 和技能清单
- `hermes skills list` 能扫描到 `~/.hermes/skills/grix-hermes`
- `skills.external_dirs` 指向的是安装目录，不是本地源码仓库
