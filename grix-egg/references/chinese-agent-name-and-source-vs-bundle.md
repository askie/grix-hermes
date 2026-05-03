# 雪碧空 agent 孵化会话记录

本次真实操作得到两条高价值排障结论：

1. 中文显示名不能直接复用为 Hermes profile 名
   - 例：`雪碧`
   - 必须额外提供 ASCII-safe `--profile-name xuebi`
   - 否则报：`Invalid Hermes profile name: 雪碧. Must match [a-z0-9][a-z0-9_-]{0,63}`

2. 源码树与已安装 bundle 的 bootstrap 可运行性要分开判断
   - 源码树：`/Volumes/disk1/go/src/grix-hermes`
   - 已安装 bundle：`~/.hermes/skills/grix-hermes`
   - 从源码树直接跑时，install 步可能报：
     - `ENOENT: no such file or directory, lstat '/Volumes/disk1/go/src/grix-hermes/grix-admin'`
   - 改用已安装 bundle 后，install 可过，但 create 仍可能报：
     - `grix error: code=4004 msg=unsupported cmd for hermes`

3. 对当前宿主环境，判断顺序应是：
   - 先 probe admin capability：`agent_category_list`
   - 若 `unsupported cmd for hermes`，说明当前会话不支持宿主 create/admin capability
   - 此时优先改走 `--route existing`，或继续排查宿主 bridge / capability 暴露
   - 不要默认把“再补一个 `GRIX_ACCESS_TOKEN`”当成 `create_new` 的首选恢复动作

4. 额外环境事实（历史会话现场）
   - `~/.hermes/.env` 中当时没有可用的 `GRIX_ACCESS_TOKEN`
   - 这只能说明当时无法验证独立 HTTP 链路
   - 不应被表述成“当前 `create_new` 只差一个 token 就能成功”

适用场景：以后用户要求创建中文名空 agent，且当前会话看起来“WS 已连上但 create 失败”时，优先用这组判断路径。