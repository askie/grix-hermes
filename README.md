# grix-hermes

`grix-hermes` 是一个独立发布的 Hermes 技能包项目。
它对外发布到 npm 的包名是 `@dhf-hermes/grix`，安装后的命令仍然是 `grix-hermes`。

它的目标很单一：

- 不修改 Hermes 内核
- 复用 Hermes 已有的 `terminal` 和 `send_message`
- 把 Grix 相关技能做成可单独安装、可 npm 发布、可 GitHub 发布的 Hermes 技能包

## 包含内容

- 8 个 Hermes 技能
- 一套共享 Grix WS CLI，给 `grix-query`、`grix-group`、`grix-admin`、`message-unsend` 使用
- 独立 HTTP 组件，给 `grix-register` 使用
- Hermes profile 绑定和安装编排 helper，给 `grix-admin`、`grix-register`、`grix-egg` 使用

## 安装

### 方式 1：npm

```bash
npm install -g @dhf-hermes/grix
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

推荐主线是第 1 种：共享一份 `grix-hermes` 代码目录，让多个 Hermes profile 一起映射它。
这样升级一次代码，所有 profile 都会一起生效；每个 profile 自己只保留独立的 `.env`、`config.yaml`、`SOUL.md`。

在这条主线下，默认技能策略是：

- 主 agent：保留全部 8 个技能
- 其他 agent：默认禁用 `grix-admin`、`grix-register`、`grix-update`、`grix-egg`

这个默认策略会在绑定 Hermes profile 时自动写入 `config.yaml` 的 `skills.disabled`。

如果你希望这组技能和 Hermes 网关不要共用同一只 API agent，可以在
`~/.hermes/.env` 里额外配置 `GRIX_SKILL_ENDPOINT`、`GRIX_SKILL_AGENT_ID`、
`GRIX_SKILL_API_KEY`。技能会优先使用这组独立凭证。
如果 Hermes gateway 也连着 Grix，独立 `GRIX_SKILL_*` 能避免短连接技能调用把 gateway 顶掉后再重连。

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
2. npm 包名：`@dhf-hermes/grix`
3. GitHub Secret: `NPM_TOKEN`

仓库里也带了本地发布脚本：

- `./publish.sh`
- `./scripts/publish_npm.sh`

常用方式：

```bash
bash ./publish.sh
bash ./publish.sh --publish
```

## 设计边界

- Grix 查询、群管理、远端 Agent 管理、消息撤回：走 Grix WS 协议
  这组短连接默认会带内部兼容握手，确保后端放行授权类 WS 命令
- 注册、发验证码、创建首个 API agent：走独立 HTTP 组件
- 本地 Hermes agent 的创建、覆盖、绑定：走 Hermes `profile`、`.env`、`config.yaml`、`SOUL.md`
- 技能升级：面向整个 `grix-hermes` 包，可配 Hermes cron 定时执行
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
