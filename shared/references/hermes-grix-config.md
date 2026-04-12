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

默认 `HERMES_HOME`：

```text
~/.hermes
```

如果你在多 profile 或自定义目录下运行，先设置：

```bash
export HERMES_HOME=/path/to/hermes-home
```

共享 CLI 会自动复用同一套 Grix 凭证发起短连接请求，不要求额外手动登录。
