# 已创建但 Grix 离线：缺少 channels.grix 或 `.env` 中 key 被遮掩

适用场景：
- `grix-egg` 已经把远端 agent 创建出来了
- 用户看到 agent 在 Grix 里仍是离线
- 本地 profile gateway 似乎也“启动了”

本次会话沉淀出的两类高价值根因：

## 1. profile `config.yaml` 只有 skills 配置，没有 `channels.grix.wsUrl`

现场表现：

```yaml
skills:
  external_dirs:
    - /tmp/hongniu-grix-bundle
  disabled: []
```

缺少：

```yaml
channels:
  grix:
    wsUrl: wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<AGENT_ID>
```

这时 gateway 可能仍显示 service loaded / PID 存在，但日志会明确写：

- `No messaging platforms enabled.`

结论：
- profile 已建好，但 Hermes 根本没有启用 Grix 平台
- 远端 agent 自然不会上线

修复：
- 在 profile `config.yaml` 中补上 `channels.grix.wsUrl`
- 然后 `hermes --profile <name> gateway restart`
- 再看 `gateway.log` 是否出现：
  - `Connecting to grix...`
  - `[Grix] Connected to ...`
  - `✓ grix connected`

## 2. profile `.env` 中 `GRIX_API_KEY` 被落盘成了遮掩值

现场曾出现：

```env
GRIX_API_KEY=ak_205...qL3a
```

而不是真实 key。这样一重启 gateway，日志会报：

- `grix auth failed: code=10001 msg=auth failed`

结论：
- 对外输出可以脱敏
- 但 profile `.env` 落盘必须保留真实 `GRIX_API_KEY`
- 一旦写成 `***` 或 `ak_***` 样式，运行时鉴权一定失败

修复：
- 把 profile `.env` 恢复为真实 key
- 再重启 gateway

## 3. 验证顺序

推荐现场顺序：

1. `hermes --profile <name> gateway status`
2. 看 `logs/gateway.log`
3. 若有 `No messaging platforms enabled.`，先查 `config.yaml` 里的 `channels.grix.wsUrl`
4. 若有 `auth failed: code=10001`，先查 `.env` 中 `GRIX_API_KEY` 是否是真值
5. 修完后重启 gateway
6. 以日志中的 `✓ grix connected` 作为最终上线依据

## 4. 本次会话的具体信号词

- 平台未启用：`No messaging platforms enabled.`
- key 被遮掩导致鉴权失败：`grix auth failed: code=10001 msg=auth failed`
- 修复成功：
  - `[Grix] Connected to ...`
  - `✓ grix connected`
  - `Gateway running with 1 platform(s)`
