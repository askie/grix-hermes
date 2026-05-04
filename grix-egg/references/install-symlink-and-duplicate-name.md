# create_new 真实复测新增判读：symlink install 与重名 agent

本次会话新增两个已验证结论，适用于用户在源码仓库内直接运行 `grix-egg/scripts/bootstrap.js` 创建空 agent。

## 1. install 目标若经 symlink 解析后就是源码树本身，install 应视为 no-op

真实环境里：

- `HERMES_HOME=/Users/gcf/.hermes/profiles/grix-online`
- 默认 install 目录：`/Users/gcf/.hermes/profiles/grix-online/skills/grix-hermes`
- 该目录是一个 symlink，实际解析到：`/Volumes/disk1/go/src/grix-hermes`

如果 `grix-hermes install --dest <DIR> --force` 直接对这种目录执行“先删目标、再拷源码”，会出现自删/自拷问题，表现为：

- `ENOENT: no such file or directory, lstat '/Volumes/disk1/go/src/grix-hermes/grix-admin'`

因为目标 realpath 与源码 root 实际相同。

### 推荐修法

在 `bin/grix-hermes.ts` / 安装入口里加入 realpath 判定：

- 若 `src` 与 `dest` 的 `path.resolve(...)` 相同，直接 no-op
- 或两者 `fs.realpathSync.native(...)` 相同，也直接 no-op

也就是：

- `samePathOrTarget(src, dest) === true` 时跳过 copy/remove

### 推荐回归测试

增加一个 smoke 回归：

1. 临时创建 `skills/grix-hermes` symlink 指向仓库 root
2. 执行：
   - `node bin/grix-hermes.js install --dest <symlink> --force --skip-cron`
3. 断言：
   - 退出码为 0
   - 源码树关键文件仍存在，如 `grix-admin/SKILL.md`

## 2. install 修通后，create_new 可能前进到“重名 agent 已存在”

本次真实复测里，修完 install 后再次执行：

```bash
HOME=/Users/gcf node /Volumes/disk1/go/src/grix-hermes/grix-egg/scripts/bootstrap.js \
  --install-id egg-67070b42 \
  --agent-name 雪碧 \
  --profile-name xuebi \
  --route create_new \
  --json
```

状态推进为：

- `detect = done`
- `install = done`
- `create = failed`

create 真实报错：

- `grix agent_invoke_result: code=20002 msg=同名 Agent 已存在`

且 `contact_search` 已能看到现有 agent：

- `display_name = 雪碧`
- `peer_id = 2050958189851574272`

### 正确判读

当 `create_new` 报“同名 Agent 已存在”时，应明确说明：

- 本地 install/source-tree 兼容性问题已经不再是主阻塞
- 宿主 admin create 已经真正打到远端
- 当前剩余问题是 **远端名称冲突**

### 下一步分流

应直接二选一：

1. **改名重建**：换一个新的 `--agent-name`
2. **接管现有 agent**：把现有 agent 改走 `--route existing`
   - 若只有 `agent_id`，且没有明文 `api_key`
   - 先轮换 key，再继续 existing bind

不要继续把这类报错归因到：

- install bundle 布局
- `unsupported cmd for hermes`
- 缺少 `GRIX_ACCESS_TOKEN`

这三类都属于更前一层或另一条路径的问题。