# 红牛创建会话：create_new 已创建成功但 bootstrap 误判失败

本次真实创建新增一个高价值现场模式：

## 现象

执行：

```bash
node grix-egg/scripts/bootstrap.js \
  --install-id egg-hongniu-3c1f9372 \
  --agent-name 红牛 \
  --profile-name hongniu \
  --route create_new \
  --json
```

返回失败：

- `step=create`
- `reason=WS 创建 agent 未返回有效凭证`

但 `raw_error` 里其实已经包含成功创建结果：

```json
{
  "ok": true,
  "action": "create_grix",
  "createdAgent": {
    "id": "2051152262751322112",
    "agent_name": "红牛",
    "api_endpoint": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2051152262751322112",
    "api_key": "ak_..."
  }
}
```

## 正确判读

这不是远端创建真的失败，而是：

- 宿主 create 已成功
- bootstrap 当前对 WS create 返回结构的提取不兼容
- 凭证被放在 `createdAgent.{id,agent_name,api_endpoint,api_key}` 下
- 脚本仍按顶层字段缺失误判为失败

## 现场恢复动作

如果 `raw_error` / stdout 中能看到 `createdAgent`，应立即：

1. 提取 `createdAgent.id`
2. 提取 `createdAgent.api_endpoint`
3. 提取 `createdAgent.api_key`
4. 直接改走 `--route existing`
5. 用同一个显示名 + ASCII-safe `--profile-name` 完成本地绑定与启动

示例：

```bash
node grix-egg/scripts/bootstrap.js \
  --install-id egg-hongniu-bind2-3c1f9372 \
  --agent-name 红牛 \
  --profile-name hongniu \
  --route existing \
  --agent-id 2051152262751322112 \
  --api-endpoint 'wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2051152262751322112' \
  --api-key 'ak_...' \
  --install-dir /tmp/hongniu-grix-bundle \
  --json
```

## 同场景第二层结论

如果 `--install-dir` 指向源码 git checkout，`bind_local` 会拒绝：

- `Install dir points to a git checkout`

此时先从源码树导出临时 bundle，再把该 bundle 传给 `--install-dir`：

```bash
HOME=/Users/gcf node /Volumes/disk1/go/src/grix-hermes/bin/grix-hermes.js install \
  --dest /tmp/hongniu-grix-bundle \
  --force \
  --skip-cron
```

## 启动判定

后续若 `gateway` 步仍报 `did not report a running state after startup`，但 `hermes --profile <name> gateway status` 显示：

- `Service is loaded`
- 有 `PID`

则按 `start_gateway.js` running-state 假负例处理，不要把 agent 误报为未创建。