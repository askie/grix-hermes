---
name: grix-hermes
description: Hermes 技能包安装入口。提供 grix-hermes bundle 安装、Hermes skills 目录接入说明、8 个技能目录启用、每日更新 cron 配置和安装后验证。
---

# Grix Hermes

`grix-hermes` 是发布到 npm 的 Hermes 技能包。安装后，Hermes 可以加载 8 个 Grix 技能和共享运行时。

## 能力

- 安装 `@dhf-hermes/grix` 到 `~/.hermes/skills/grix-hermes`
- 提供 Hermes `skills.external_dirs` 接入路径
- 提供 8 个 Grix 技能目录
- 创建每日更新 cron job
- 输出技能清单和 manifest 供安装后验证

## 快速安装

```bash
npx @dhf-hermes/grix install
```

安装动作：

1. 通过 npm 获取最新版 `@dhf-hermes/grix`
2. 安装完整 bundle 到 `~/.hermes/skills/grix-hermes`
3. 创建每日更新 cron job：`grix-hermes-daily-update`，每天 06:00

安装后验证：

```bash
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js list
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js manifest
hermes skills list
```

## 手工安装

手工安装适合需要显式控制安装目录和 Hermes profile 的环境。

### 1. 确定 Hermes 目录

默认 `HERMES_HOME`：

```text
~/.hermes
```

默认安装目录：

```text
~/.hermes/skills/grix-hermes
```

使用自定义 `HERMES_HOME` 时，将下面路径中的 `~/.hermes` 替换为对应目录。

### 2. 获取 npm 包

```bash
tmp="$(mktemp -d)"
npm install --prefix "$tmp/prefix" @dhf-hermes/grix
```

包目录：

```text
$tmp/prefix/node_modules/@dhf-hermes/grix
```

### 3. 安装完整 bundle

```bash
install_dir="${HERMES_HOME:-$HOME/.hermes}/skills/grix-hermes"
node "$tmp/prefix/node_modules/@dhf-hermes/grix/bin/grix-hermes.js" install --dest "$install_dir" --force --skip-cron
```

完整 bundle 内容包含：

- `bin`
- `lib`
- `shared`
- 8 个技能目录
- 包内自带的 `node_modules`

### 4. 接入 Hermes 配置

编辑目标 Hermes profile 配置文件：

- 默认 profile：`~/.hermes/config.yaml`
- 命名 profile：`~/.hermes/profiles/<PROFILE_NAME>/config.yaml`

配置 `skills.external_dirs`：

```yaml
skills:
  external_dirs:
    - ~/.hermes/skills/grix-hermes
```

目标 profile 可见技能：

- `grix-admin`
- `grix-egg`
- `grix-group`
- `grix-query`
- `grix-register`
- `grix-update`
- `message-send`
- `message-unsend`

### 5. 配置每日更新

```bash
hermes cron add --name grix-hermes-daily-update --skill grix-update "0 6 * * *" 'Use the grix-update skill with {"install_dir":"~/.hermes/skills/grix-hermes"}'
```

### 6. 清理临时目录

```bash
rm -rf "$tmp"
```

## 技能清单

| 技能 | 能力 |
| --- | --- |
| `grix-admin` | 远程 Grix Agent 管理：API agent、分类、分配、状态和 API key rotation |
| `grix-egg` | Hermes Agent 孵化编排：空蛋创建、profile 绑定、gateway 启动和验收 |
| `grix-group` | Grix 群组生命周期管理：创建、查询、成员和角色 |
| `grix-query` | 联系人、会话和消息查询 |
| `grix-register` | HTTP 注册、登录和 API agent 创建 |
| `grix-update` | 技能包更新并重新安装到 Hermes skills 目录 |
| `message-send` | 消息发送和 Grix deep-link 卡片生成 |
| `message-unsend` | 消息撤回 |

## 安装验证

```bash
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js list
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js manifest
hermes skills list
```

验收标准：

- `list` 列出 8 个技能
- `manifest` 输出 `grix-hermes` 和 8 个技能条目
- `hermes skills list` 扫描到 `~/.hermes/skills/grix-hermes`
