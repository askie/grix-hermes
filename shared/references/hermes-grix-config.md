# Hermes Grix Runtime

本项目不改 Hermes 内核，只复用 Hermes 已经配置好的 Grix 运行参数。

共享 CLI 的参数来源顺序：

1. 命令行显式参数
2. 进程环境变量
3. `HERMES_HOME/.env`
4. `HERMES_HOME/config.yaml`

至少需要这 3 个值：

- `GRIX_ENDPOINT`
- `GRIX_AGENT_ID`
- `GRIX_API_KEY`

如果你希望这组技能使用独立的 API agent，而 Hermes 网关继续使用原来的主连接，
可以单独设置：

- `GRIX_SKILL_ENDPOINT`
- `GRIX_SKILL_AGENT_ID`
- `GRIX_SKILL_API_KEY`
- `GRIX_SKILL_ACCOUNT_ID`

共享 CLI 会优先读取 `GRIX_SKILL_*`，没有时才回退到默认的 `GRIX_*`。

授权类 WS 命令默认会以 `openclaw` 家族声明握手，并声明 `agent_invoke` 能力，
这样后端才会放行查询、群管理、分类管理、撤回这类需要授权的 WS 操作。

如需覆盖默认握手参数，还可以设置：

- `GRIX_CLIENT_TYPE`
- `GRIX_HOST_TYPE`
- `GRIX_HOST_VERSION`
- `GRIX_CONTRACT_VERSION`
- `GRIX_CAPABILITIES`
- `GRIX_LOCAL_ACTIONS`
- `GRIX_ADAPTER_HINT`

默认 `HERMES_HOME`：

```text
~/.hermes
```

如果你在多 profile 或自定义目录下运行，先设置：

```bash
export HERMES_HOME=/path/to/hermes-home
```

共享 CLI 会自动复用同一套 Grix 凭证发起短连接请求，不要求额外手动登录。
