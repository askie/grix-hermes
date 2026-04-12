# grix-hermes

`grix-hermes` 是一个独立发布的 Hermes 技能包项目。

它的目标很单一：

- 不修改 Hermes 内核
- 复用 Hermes 已有的 `terminal` 和 `send_message`
- 把 Grix / OpenClaw 相关技能做成可单独安装、可 npm 发布、可 GitHub 发布的技能包

## 包含内容

- 9 个迁移后的技能
- 一套共享 Grix WS CLI，给 `grix-query`、`grix-group`、`grix-admin`、`message-unsend` 使用
- 独立 HTTP 组件，给 `grix-register` 使用
- OpenClaw 本地运维脚本，给 `openclaw-memory-setup` 使用

## 安装

### 方式 1：npm

```bash
npm install -g grix-hermes
grix-hermes install
```

默认会安装到：

```text
~/.hermes/skills/grix-hermes
```

如果你用了自定义 `HERMES_HOME`，安装器会跟随它。

### 方式 2：GitHub / 本地目录

```bash
git clone <repo> /path/to/grix-hermes
```

然后可以二选一：

1. 直接把仓库根目录作为 `skills.external_dirs`
2. 执行 `node ./bin/grix-hermes.mjs install --dest <目标目录>`

## 命令

```bash
grix-hermes list
grix-hermes manifest
grix-hermes install
grix-hermes install --dest ~/.hermes/skills/grix-hermes --force
```

## GitHub / npm 发布

仓库已经带了两条工作流：

- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`

发布时只需要准备：

1. GitHub 仓库
2. npm 包名
3. GitHub Secret: `NPM_TOKEN`

## 设计边界

- Grix 查询、群管理、远端 Agent 管理、消息撤回：走 Grix WS 协议
- 注册、发验证码、创建首个 API agent：走独立 HTTP 组件
- 发消息、发卡片：优先使用 Hermes 自带 `send_message`
- 本项目不依赖修改 Hermes 内核，也不要求给 Hermes 增加新 tool

## 技能清单

- `grix-admin`
- `grix-egg`
- `grix-group`
- `grix-query`
- `grix-register`
- `grix-update`
- `message-send`
- `message-unsend`
- `openclaw-memory-setup`
