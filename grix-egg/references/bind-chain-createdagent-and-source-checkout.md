# createdAgent 误判失败 + 绑定链路参数遗漏

这次会话确认了两类容易被混在一起的真实问题：

## 1. host create 已成功，但 bootstrap 误判失败

现场特征：

- `bootstrap --route create_new` 在 create 步失败
- 报错表面像“未返回有效凭证”
- 但 stdout JSON 实际是：
  - `ok: true`
  - `action: create_grix`
  - `createdAgent.id`
  - `createdAgent.api_endpoint`
  - `createdAgent.api_key`

结论：

- 远端 agent 已成功创建
- 真正问题是 `bootstrap.ts` 没兼容 `createdAgent` 包装结构

修法：

- 在 create 结果解析时，除了旧的 `data` 包装，也要兼容 `createdAgent`

## 2. 绑定链路参数遗漏会让 profile“创建成功但默认不可用”

如果 `bootstrap.ts -> bind_local.js` 没继续传：

- `--account-id`
- `--allowed-users`
- `--allow-all-users`
- `--home-channel`
- `--home-channel-name`

则新 profile 可能：

- 默认访问控制不符合预期
- home channel 丢失
- agent 看起来绑上了，但实际不可直接使用

一个实用默认值：

- host 路径下若未显式传 `--allowed-users`，可默认回落到当前宿主 `GRIX_AGENT_ID`
- 若没有限制用户语义，则允许默认 `--allow-all-users true`

## 3. installDir 不能把源码 checkout 一律判死

之前的错误语义是：

- 只要 `installDir` 下有 `.git` 就直接拒绝

这会误伤一种完全合理的场景：

- 用户直接拿源码 checkout 当运行目录
- 该目录实际上已经具备可用 bundle 结构

更精确的判断应是：

- git checkout + 具备可用 grix-hermes bundle 结构 => 允许
- git checkout + 缺 bundle 入口 => 拒绝，并提示导出 bundle 或改用安装产物

## 4. profile 离线的另一个根因：缺 channels.grix.wsUrl

只把 `GRIX_ENDPOINT/GRIX_AGENT_ID/GRIX_API_KEY` 写进 `.env` 还不够。

绑定时还应把：

```yaml
channels:
  grix:
    wsUrl: <API_ENDPOINT>
```

写进 `config.yaml`。

缺这段时，Hermes 可能报：

- `No messaging platforms enabled.`

表象就是 agent 离线。

## 5. 这次新增的最小回归点

- host create 返回 `createdAgent` 包装时可正常继续 bind
- `bind_local` 接受带 `.git` 的源码 checkout installDir（前提是 bundle 结构完整）
- 绑定后 `config.yaml` 含 `channels.grix.wsUrl`
- `--allow-all-users true` 会落盘到 profile `.env`
